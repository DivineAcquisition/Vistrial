import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { PLATFORM_CEILING, SOFT_WARNING_RATIO, capScope, dayKey, overCap } from "./lib/caps";
import { addDaySpend, daySpend, loadCaps } from "./lib/capRows";
import { currentAgentSlug } from "./catalog";
import { assertClaims, assertSourcesExist } from "./lib/evidence";
import { notAllowed, notFound } from "./lib/errors";
import { ModelError, NO_SPEND, complete, type ModelRoute, type Spend } from "./lib/modelRouter";
import { completeWithTools } from "./lib/toolRouter";
import { INJECTION_FIXTURE, TEST_SKILL, devSkillsEnabled, wrapUntrusted } from "./lib/registry";
import { assertDeclared, skillFor } from "./lib/skills";

const OPEN = new Set(["queued", "running", "waiting"]);

type StopReason = "cap" | "error" | "cancelled" | "halted" | "done";

async function controls(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const workspace = await ctx.db
    .query("workspaceControls")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  const platform = await ctx.db
    .query("platformControls")
    .withIndex("by_key", (q) => q.eq("key", "platform"))
    .unique();
  return { paused: workspace?.agentsPaused === true, halted: platform?.halted === true };
}

async function stepCount(ctx: QueryCtx, run: Doc<"agentRuns">) {
  return ctx.db
    .query("runSteps")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(PLATFORM_CEILING.maxSteps + 1);
}

async function stopRun(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  stopReason: StopReason,
  status: "stopped" | "failed" | "completed",
  costCents = run.costCents,
) {
  await ctx.db.patch(run._id, { status, stopReason, finishedAt: Date.now() });
  await writeAudit(ctx, {
    workspaceId: run.workspaceId,
    actorType: "system",
    actorId: "runtime",
    action: "run.finished",
    subject: run._id,
    count: costCents,
  });
}

/** The person who started the run must still be an active member, or the run stops. */
async function starterActive(ctx: QueryCtx, run: Doc<"agentRuns">) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", run.workspaceId).eq("userId", run.startedBy))
    .unique();
  return member?.active === true;
}

/** A workspace without a route uses the fake model only where dev skills are on. Production fails the run instead. */
async function routeFor(ctx: QueryCtx, workKind: string): Promise<ModelRoute | null> {
  const row = await ctx.db
    .query("modelRoutes")
    .withIndex("by_workKind", (q) => q.eq("workKind", workKind))
    .unique();
  if (row) return row;
  if (!devSkillsEnabled()) return null;
  return { provider: "fake", model: "fake-writer", fallbackProvider: "fake", fallbackModel: "fake-writer" };
}

export const devSkill = workspaceQuery({
  args: {},
  handler: async () => {
    const skill = skillFor(TEST_SKILL);
    if (!skill) return null;
    return { slug: skill.slug, name: skill.name, status: "available" as const, agentSlug: skill.agentSlug };
  },
});

export const list = workspaceQuery({
  args: { agentSlug: v.string() },
  handler: async (ctx, input) => {
    const args = { agentSlug: currentAgentSlug(input.agentSlug) };
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", args.agentSlug))
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      id: row._id,
      skillSlug: row.skillSlug,
      status: row.status,
      stopReason: row.stopReason ?? null,
      costCents: row.costCents,
      startedAt: row.startedAt,
    }));
  },
});

const runStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("stopped"),
);

/** The Runs page: newest first, a page at a time, with optional filters. */
export const page = workspaceQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(runStatus),
    agentSlug: v.optional(v.string()),
    skillSlug: v.optional(v.string()),
    startedByMe: v.optional(v.boolean()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, input) => {
    const args = { ...input, agentSlug: input.agentSlug === undefined ? undefined : currentAgentSlug(input.agentSlug) };
    const base = args.status
      ? ctx.db
          .query("agentRuns")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", args.status!))
      : args.agentSlug
        ? ctx.db
            .query("agentRuns")
            .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", args.agentSlug!))
        : ctx.db.query("agentRuns").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId));
    const result = await base
      .order("desc")
      .filter((q) =>
        q.and(
          args.agentSlug ? q.eq(q.field("agentSlug"), args.agentSlug) : true,
          args.skillSlug ? q.eq(q.field("skillSlug"), args.skillSlug) : true,
          args.startedByMe ? q.eq(q.field("startedBy"), ctx.identity.subject) : true,
          args.since !== undefined ? q.gte(q.field("startedAt"), args.since) : true,
        ),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        id: row._id,
        agentSlug: row.agentSlug,
        skillSlug: row.skillSlug,
        status: row.status,
        stopReason: row.stopReason ?? null,
        costCents: row.costCents,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        startedByMe: row.startedBy === ctx.identity.subject,
      })),
    };
  },
});

/** The live panel: runs that are still going, newest first. */
export const open = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows: Doc<"agentRuns">[] = [];
    for (const status of ["queued", "running", "waiting"] as const) {
      rows.push(
        ...(await ctx.db
          .query("agentRuns")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
          .order("desc")
          .take(10)),
      );
    }
    return rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 10)
      .map((row) => ({
        id: row._id,
        agentSlug: row.agentSlug,
        skillSlug: row.skillSlug,
        status: row.status,
        costCents: row.costCents,
        startedAt: row.startedAt,
      }));
  },
});

/** Run metadata only. Artifact bodies load one at a time through `artifact`. */
export const get = workspaceQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    const steps = await stepCount(ctx, run);
    const artifacts = await ctx.db
      .query("runArtifacts")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
      .take(PLATFORM_CEILING.maxSteps + 1);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("createdByRun", run._id))
      .take(20);
    const caps = await loadCaps(ctx, ctx.workspaceId, run.agentSlug, run.skillSlug);
    const day = dayKey(run.startedAt);
    const starter = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", run.startedBy))
      .unique();
    return {
      id: run._id,
      agentSlug: run.agentSlug,
      skillSlug: run.skillSlug,
      status: run.status,
      stopReason: run.stopReason ?? null,
      costCents: run.costCents,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      startedByName: starter?.displayName ?? null,
      caps: {
        maxCostCentsPerRun: caps.maxCostCentsPerRun,
        maxCostCentsPerDay: caps.maxCostCentsPerDay,
        maxSteps: caps.maxSteps,
        maxDurationMs: caps.maxDurationMs,
        softWarningCents: caps.maxCostCentsPerRun * SOFT_WARNING_RATIO,
        /** "skill" when the skill has its own caps and day budget, "agent" when it shares the agent's. */
        scope: capScope(run.skillSlug) === undefined ? ("agent" as const) : ("skill" as const),
      },
      daySpentCents: await daySpend(ctx, ctx.workspaceId, run.agentSlug, run.skillSlug, day),
      steps: steps
        .sort((a, b) => a.index - b.index)
        .map((step) => ({
          id: step._id,
          index: step.index,
          kind: step.kind,
          toolSlug: step.toolSlug ?? null,
          workKind: step.kind === "model" ? (step.workKind ?? "write") : null,
          status: step.status,
          resultCode: step.resultCode,
          durationMs: step.durationMs,
          inputTokens: step.inputTokens,
          outputTokens: step.outputTokens,
          webSearches: step.webSearches ?? 0,
          webFetches: step.webFetches ?? 0,
        })),
      artifacts: artifacts.map((row) => ({ id: row._id, kind: row.kind, byteSize: row.byteSize, stepId: row.stepId })),
      assets: assets.map((row) => ({
        id: row._id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        currentVersion: row.currentVersion,
      })),
    };
  },
});

/** One artifact body, checked against the caller's workspace every time. */
export const artifact = workspaceQuery({
  args: { artifactId: v.id("runArtifacts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.artifactId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    return { id: row._id, kind: row.kind, byteSize: row.byteSize, body: row.body ?? "" };
  },
});

export const start = workspaceMutation({
  args: { agentSlug: v.string(), skillSlug: v.string() },
  handler: async (ctx, input) => {
    if (ctx.member.role === "rep") notAllowed();
    // An older client may still send a renamed slug. Runs are always stored under the current one.
    const args = { ...input, agentSlug: currentAgentSlug(input.agentSlug) };
    if (args.skillSlug === TEST_SKILL && !devSkillsEnabled()) notFound();
    const skill = skillFor(args.skillSlug);
    if (!skill) throw new Error("This skill is not built yet.");
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.agentSlug))
      .unique();
    if (!agent || agent.retired === true) notFound();
    if (agent.status !== "live") throw new Error(`${agent.name} is not available yet.`);
    const link = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentId", agent._id))
      .unique();
    if (!link || link.state === "off") throw new Error(`Turn on the ${agent.name} first.`);
    if (skill.agentSlug !== agent.slug) notFound();
    const gate = await controls(ctx, ctx.workspaceId);
    const caps = await loadCaps(ctx, ctx.workspaceId, args.agentSlug, args.skillSlug);
    const spent = await daySpend(ctx, ctx.workspaceId, args.agentSlug, args.skillSlug, dayKey());
    const blocked = gate.paused || gate.halted || spent >= caps.maxCostCentsPerDay;
    const id = await ctx.db.insert("agentRuns", {
      workspaceId: ctx.workspaceId,
      agentSlug: args.agentSlug,
      skillSlug: args.skillSlug,
      status: blocked ? "stopped" : "queued",
      startedBy: ctx.identity.subject,
      inputRef: args.skillSlug,
      startedAt: Date.now(),
      finishedAt: blocked ? Date.now() : undefined,
      stopReason: blocked ? (gate.halted || gate.paused ? "cancelled" : "cap") : undefined,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "run.started",
      subject: id,
      count: 0,
    });
    if (!blocked) {
      await ctx.scheduler.runAfter(0, internal.runs.step, { runId: id });
      await ctx.scheduler.runAfter(caps.maxDurationMs, internal.runs.expire, { runId: id });
    }
    return id;
  },
});

export const stop = workspaceMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    if (!OPEN.has(run.status)) return { stopped: false };
    await stopRun(ctx, run, "halted", "stopped");
    return { stopped: true };
  },
});

/** Stops a run that is still open when its time cap runs out, whether or not anyone is watching. */
export const expire = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || !OPEN.has(run.status)) return null;
    await stopRun(ctx, run, "cap", "stopped");
    return null;
  },
});

/**
 * Every check that can stop a run happens here, before any model call or tool runs:
 * the starter's membership, pause, halt, every cap, and the model route. Then the skill
 * module names the next step; the runtime checks it against the skill's declared tools.
 */
export const prepare = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || !OPEN.has(run.status)) return { done: true as const };
    if (!(await starterActive(ctx, run))) {
      await stopRun(ctx, run, "cancelled", "stopped");
      return { done: true as const };
    }
    const gate = await controls(ctx, run.workspaceId);
    if (gate.paused || gate.halted) {
      await stopRun(ctx, run, "cancelled", "stopped");
      return { done: true as const };
    }
    const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug, run.skillSlug);
    const steps = await stepCount(ctx, run);
    const spent = await daySpend(ctx, run.workspaceId, run.agentSlug, run.skillSlug, dayKey());
    if (overCap({ caps, runCost: run.costCents, dayCost: spent, steps: steps.length, startedAt: run.startedAt, now: Date.now() })) {
      await stopRun(ctx, run, "cap", "stopped");
      return { done: true as const };
    }
    const index = steps.length;
    const idempotencyKey = `${run._id}:${index}`;
    // The dev flag can be turned off while a dev skill runs. The run then fails instead of guessing.
    const skill = skillFor(run.skillSlug);
    if (!skill) {
      await recordFailure(ctx, run, index, idempotencyKey, "skill_unavailable", "tool");
      return { done: true as const };
    }
    const next = await skill.nextStep({
      db: ctx.db,
      run,
      steps: [...steps]
        .sort((a, b) => a.index - b.index)
        .map((step) => ({
          index: step.index,
          kind: step.kind,
          toolSlug: step.toolSlug,
          status: step.status,
          resultCode: step.resultCode,
          resultId: step.resultId,
        })),
    });
    if (!next) {
      await stopRun(ctx, run, "done", "completed");
      return { done: true as const };
    }
    if (next.kind === "tool") assertDeclared(run.skillSlug, next.toolSlug);
    // Claude's web tools are tools too: a model step may use them only if the skill declared them.
    if (next.kind === "model" && next.webSearch) assertDeclared(run.skillSlug, "web.search");
    if (next.kind === "model" && next.webFetch) assertDeclared(run.skillSlug, "web.fetch");
    if (run.status === "queued") await ctx.db.patch(run._id, { status: "running" });
    if (next.kind === "tool") {
      return { done: false as const, kind: "tool" as const, index, idempotencyKey, toolSlug: next.toolSlug };
    }
    const route = await routeFor(ctx, next.workKind);
    if (!route) {
      await recordFailure(ctx, run, index, idempotencyKey, "no_route");
      return { done: true as const };
    }
    return {
      done: false as const,
      kind: "model" as const,
      index,
      idempotencyKey,
      route: {
        provider: route.provider,
        model: route.model,
        fallbackProvider: route.fallbackProvider,
        fallbackModel: route.fallbackModel,
      },
      workKind: next.workKind,
      modelInput: next.input,
      // Only the fields a step sets: Convex values cannot hold undefined.
      tools:
        next.webSearch || next.webFetch || next.outputSchema || next.system
          ? {
              ...(next.system ? { system: next.system } : {}),
              ...(next.webSearch ? { webSearch: next.webSearch } : {}),
              ...(next.webFetch ? { webFetch: next.webFetch } : {}),
              ...(next.outputSchema ? { outputSchema: next.outputSchema } : {}),
            }
          : null,
    };
  },
});

async function recordFailure(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  index: number,
  idempotencyKey: string,
  code: string,
  kind: "tool" | "model" = "model",
  spent: Spend = NO_SPEND,
  durationMs = 0,
) {
  const stepId = await ctx.db.insert("runSteps", {
    workspaceId: run.workspaceId,
    runId: run._id,
    index,
    idempotencyKey,
    kind,
    status: "failed",
    durationMs,
    inputTokens: spent.inputTokens,
    outputTokens: spent.outputTokens,
    resultCode: code,
  });
  if (OPEN.has(run.status)) await stopRun(ctx, run, "error", "failed");
  return stepId;
}

/**
 * Adds what a model call was billed to the run and to today's counter, and returns the new totals.
 * The counter is the skill's own when the skill has its own caps, otherwise the agent's.
 */
async function charge(ctx: MutationCtx, run: Doc<"agentRuns">, spent: Spend) {
  const dayCost = await addDaySpend(ctx, run.workspaceId, run.agentSlug, run.skillSlug, dayKey(), spent.costCents);
  const runCost = run.costCents + spent.costCents;
  await ctx.db.patch(run._id, {
    costCents: runCost,
    inputTokens: run.inputTokens + spent.inputTokens,
    outputTokens: run.outputTokens + spent.outputTokens,
  });
  return { runCost, dayCost };
}

async function findStep(ctx: QueryCtx, run: Doc<"agentRuns">, idempotencyKey: string) {
  return ctx.db
    .query("runSteps")
    .withIndex("by_workspace_idempotency", (q) => q.eq("workspaceId", run.workspaceId).eq("idempotencyKey", idempotencyKey))
    .unique();
}

/**
 * Marks a run failed after a step errored. Codes only, no provider text. A model call that failed
 * but was billed (a refusal) is still counted, even when the run was stopped while the call was out.
 */
export const fail = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    index: v.number(),
    idempotencyKey: v.string(),
    code: v.string(),
    kind: v.union(v.literal("tool"), v.literal("model")),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costCents: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    if (await findStep(ctx, run, args.idempotencyKey)) return null;
    const spent = {
      inputTokens: args.inputTokens ?? 0,
      outputTokens: args.outputTokens ?? 0,
      costCents: args.costCents ?? 0,
    };
    const billed = spent.costCents > 0 || spent.inputTokens > 0 || spent.outputTokens > 0;
    if (!billed && !OPEN.has(run.status)) return null;
    if (billed) await charge(ctx, run, spent);
    const current = (await ctx.db.get(run._id)) ?? run;
    const stepId = await recordFailure(
      ctx,
      current,
      args.index,
      args.idempotencyKey,
      args.code,
      args.kind,
      spent,
      args.durationMs ?? 0,
    );
    if (billed) {
      await writeAudit(ctx, {
        workspaceId: run.workspaceId,
        actorType: "system",
        actorId: "runtime",
        action: "run.model",
        subject: stepId,
        count: spent.costCents,
      });
    }
    return null;
  },
});

/** The tool's effect and its step marker commit together, so a retry can never repeat the effect. */
export const commitTool = internalMutation({
  args: { runId: v.id("agentRuns"), idempotencyKey: v.string(), index: v.number(), toolSlug: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    const prior = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_idempotency", (q) => q.eq("workspaceId", run.workspaceId).eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (prior) return { status: run.status };
    if (!OPEN.has(run.status)) return { status: run.status };
    assertDeclared(run.skillSlug, args.toolSlug);
    const steps = await stepCount(ctx, run);

    let resultId: string;
    if (args.toolSlug === "profile.read") {
      const confirmed = await ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
        .order("desc")
        .first();
      if (!confirmed) {
        await ctx.db.insert("runSteps", {
          workspaceId: run.workspaceId,
          runId: run._id,
          index: args.index,
          idempotencyKey: args.idempotencyKey,
          kind: "tool",
          toolSlug: args.toolSlug,
          status: "failed",
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          resultCode: "no_confirmed_profile",
        });
        await stopRun(ctx, run, "error", "failed");
        return { status: "failed" as const };
      }
      resultId = confirmed._id;
    } else if (args.toolSlug === "test.echo") {
      resultId = "echo";
    } else if (args.toolSlug === "asset.create") {
      const readStep = steps.find((step) => step.toolSlug === "profile.read" && step.status === "completed");
      const claims = [
        {
          claimKey: "profile",
          statement: "The confirmed profile was read.",
          sourceId: readStep?.resultId,
          fetchedAt: Date.now(),
        },
      ];
      assertClaims(claims);
      await assertSourcesExist(ctx, run.workspaceId, claims);
      // The skill says what it hands back. assertDeclared above already proved the skill exists.
      const output = skillFor(run.skillSlug)!.output;
      const assetId = await ctx.db.insert("assets", {
        workspaceId: run.workspaceId,
        kind: output.assetKind,
        title: output.title,
        status: "draft",
        currentVersion: 1,
        createdByRun: run._id,
        createdAt: Date.now(),
      });
      const versionId = await ctx.db.insert("assetVersions", {
        workspaceId: run.workspaceId,
        assetId,
        version: 1,
        body: "ok",
        createdBy: "agent",
      });
      for (const claim of claims) {
        await ctx.db.insert("evidence", {
          workspaceId: run.workspaceId,
          assetVersionId: versionId,
          claimKey: claim.claimKey,
          statement: claim.statement,
          sourceId: claim.sourceId,
          fetchedAt: claim.fetchedAt,
        });
      }
      resultId = assetId;
    } else {
      throw new Error("That tool is not declared for this skill.");
    }

    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: run.workspaceId,
      runId: run._id,
      index: args.index,
      idempotencyKey: args.idempotencyKey,
      kind: "tool",
      toolSlug: args.toolSlug,
      status: "completed",
      durationMs: 1,
      inputTokens: 0,
      outputTokens: 0,
      resultCode: "ok",
      resultId,
    });
    if (args.toolSlug === "test.echo") {
      const body = wrapUntrusted(INJECTION_FIXTURE);
      await ctx.db.insert("runArtifacts", {
        workspaceId: run.workspaceId,
        runId: run._id,
        stepId,
        kind: "tool",
        byteSize: new TextEncoder().encode(body).byteLength,
        body,
      });
    }
    return { status: "running" as const };
  },
});

/**
 * Records a model call that already happened. The cost is always counted, even when the run
 * was paused or capped while the call was out, and the run then stops for that reason.
 */
export const commitModel = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    idempotencyKey: v.string(),
    index: v.number(),
    text: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costCents: v.number(),
    provider: v.string(),
    model: v.string(),
    workKind: v.optional(v.string()),
    /** Wall time of the model call, measured in the action around it. */
    durationMs: v.optional(v.number()),
    webSearches: v.optional(v.number()),
    webFetches: v.optional(v.number()),
    /** Sources the web tools found, as JSON: URLs, titles and short cited lines. Saved as its own record. */
    sources: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    if (await findStep(ctx, run, args.idempotencyKey)) return { status: run.status };

    const { runCost: nextCost, dayCost: nextDay } = await charge(ctx, run, {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costCents: args.costCents,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: run.workspaceId,
      runId: run._id,
      index: args.index,
      idempotencyKey: args.idempotencyKey,
      kind: "model",
      modelRoute: `${args.provider}/${args.model}`,
      workKind: args.workKind,
      status: "completed",
      durationMs: args.durationMs ?? 0,
      webSearches: args.webSearches,
      webFetches: args.webFetches,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      resultCode: "ok",
      resultId: `${args.provider}/${args.model}`,
    });
    await ctx.db.insert("runArtifacts", {
      workspaceId: run.workspaceId,
      runId: run._id,
      stepId,
      kind: "model",
      byteSize: new TextEncoder().encode(args.text).byteLength,
      body: args.text,
    });
    if (args.sources) {
      await ctx.db.insert("runArtifacts", {
        workspaceId: run.workspaceId,
        runId: run._id,
        stepId,
        kind: "sources",
        byteSize: new TextEncoder().encode(args.sources).byteLength,
        body: args.sources,
      });
    }
    await writeAudit(ctx, {
      workspaceId: run.workspaceId,
      actorType: "system",
      actorId: "runtime",
      action: "run.model",
      subject: stepId,
      count: args.costCents,
    });

    const current = { ...run, costCents: nextCost };
    if (!OPEN.has(run.status)) return { status: run.status };
    const gate = await controls(ctx, run.workspaceId);
    if (gate.paused || gate.halted) {
      await stopRun(ctx, current, "cancelled", "stopped", nextCost);
      return { status: "stopped" as const };
    }
    const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug, run.skillSlug);
    const steps = await stepCount(ctx, run);
    if (overCap({ caps, runCost: nextCost, dayCost: nextDay, steps: steps.length, startedAt: run.startedAt, now: Date.now() })) {
      await stopRun(ctx, current, "cap", "stopped", nextCost);
      return { status: "stopped" as const };
    }
    return { status: "running" as const };
  },
});

/** Runs one step, then schedules the next. Nothing depends on a browser staying open. */
export const step = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<null> => {
    const plan = await ctx.runMutation(internal.runs.prepare, { runId: args.runId });
    if (plan.done) return null;
    let status: string;
    if (plan.kind === "model") {
      let result;
      let web: { webSearches: number; webFetches: number; sources: string } | null = null;
      // Date.now() advances inside an action, so this is the real time the call took.
      const began = Date.now();
      try {
        if (plan.tools) {
          const answer = await completeWithTools(plan.route, plan.workKind, {
            input: plan.modelInput,
            system: plan.tools.system,
            webSearch: plan.tools.webSearch,
            webFetch: plan.tools.webFetch,
            outputSchema: plan.tools.outputSchema,
          });
          result = { ...answer, text: answer.output === null ? answer.text : JSON.stringify(answer.output) };
          web = {
            webSearches: answer.webSearches,
            webFetches: answer.webFetches,
            sources: JSON.stringify({ sources: answer.sources, citations: answer.citations }),
          };
        } else {
          result = await complete(plan.route, plan.workKind, plan.modelInput);
        }
      } catch (error) {
        const failed = error instanceof ModelError ? error : new ModelError("provider_error", false);
        await ctx.runMutation(internal.runs.fail, {
          runId: args.runId,
          index: plan.index,
          idempotencyKey: plan.idempotencyKey,
          code: failed.code,
          kind: "model",
          durationMs: Date.now() - began,
          ...failed.spent,
        });
        return null;
      }
      const durationMs = Date.now() - began;
      ({ status } = await ctx.runMutation(internal.runs.commitModel, {
        runId: args.runId,
        idempotencyKey: plan.idempotencyKey,
        index: plan.index,
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents: result.costCents,
        provider: result.provider,
        model: result.model,
        workKind: plan.workKind,
        durationMs,
        ...(web ?? {}),
      }));
    } else {
      try {
        ({ status } = await ctx.runMutation(internal.runs.commitTool, {
          runId: args.runId,
          idempotencyKey: plan.idempotencyKey,
          index: plan.index,
          toolSlug: plan.toolSlug,
        }));
      } catch {
        await ctx.runMutation(internal.runs.fail, {
          runId: args.runId,
          index: plan.index,
          idempotencyKey: plan.idempotencyKey,
          code: "tool_error",
          kind: "tool",
        });
        return null;
      }
    }
    if (status === "running") await ctx.scheduler.runAfter(0, internal.runs.step, { runId: args.runId });
    return null;
  },
});

export const applyDeclared = internalMutation({
  args: { skillSlug: v.string(), toolSlug: v.string() },
  handler: async (_ctx, args) => {
    assertDeclared(args.skillSlug, args.toolSlug);
    return true;
  },
});
