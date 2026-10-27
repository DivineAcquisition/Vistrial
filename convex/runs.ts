import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { DEFAULT_CAPS, PLATFORM_CEILING, dayKey, overCap, type Caps } from "./lib/caps";
import { assertClaims, assertSourcesExist } from "./lib/evidence";
import { notAllowed, notFound } from "./lib/errors";
import { ModelError, complete, type ModelRoute } from "./lib/modelRouter";
import {
  INJECTION_FIXTURE,
  TEST_AGENT,
  TEST_SKILL,
  assertDeclared,
  declaredTools,
  devSkillsEnabled,
  wrapUntrusted,
} from "./lib/registry";

const OPEN = new Set(["queued", "running", "waiting"]);

type StopReason = "cap" | "error" | "cancelled" | "halted" | "done";

async function loadCaps(ctx: QueryCtx, workspaceId: Id<"workspaces">, agentSlug: string): Promise<Caps> {
  const row = await ctx.db
    .query("agentCaps")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug))
    .unique();
  return row ?? DEFAULT_CAPS;
}

async function daySpend(ctx: QueryCtx, workspaceId: Id<"workspaces">, agentSlug: string, day: string) {
  const row = await ctx.db
    .query("capCounters")
    .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug).eq("day", day))
    .unique();
  return row?.costCents ?? 0;
}

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
    if (!devSkillsEnabled()) return null;
    return { slug: TEST_SKILL, name: "Test echo", status: "available" as const, agentSlug: TEST_AGENT };
  },
});

export const list = workspaceQuery({
  args: { agentSlug: v.string() },
  handler: async (ctx, args) => {
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
      .take(50);
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
      steps: steps
        .sort((a, b) => a.index - b.index)
        .map((step) => ({
          id: step._id,
          index: step.index,
          kind: step.kind,
          toolSlug: step.toolSlug ?? null,
          modelRoute: step.modelRoute ?? null,
          status: step.status,
          resultCode: step.resultCode,
          durationMs: step.durationMs,
        })),
      artifacts: artifacts.map((row) => ({ id: row._id, kind: row.kind, byteSize: row.byteSize })),
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
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    if (args.skillSlug === TEST_SKILL && !devSkillsEnabled()) notFound();
    const tools = declaredTools(args.skillSlug);
    if (tools.length === 0) throw new Error("This skill is not built yet.");
    const gate = await controls(ctx, ctx.workspaceId);
    const caps = await loadCaps(ctx, ctx.workspaceId, args.agentSlug);
    const spent = await daySpend(ctx, ctx.workspaceId, args.agentSlug, dayKey());
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
    if (!OPEN.has(run.status)) return null;
    await stopRun(ctx, run, "halted", "stopped");
    return null;
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

const PLAN: { kind: "tool" | "model"; toolSlug?: string }[] = [
  { kind: "tool", toolSlug: "profile.read" },
  { kind: "model" },
  { kind: "tool", toolSlug: "asset.create" },
];

/**
 * Every check that can stop a run happens here, before any model call or tool runs:
 * the starter's membership, pause, halt, every cap, and the model route.
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
    const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug);
    const steps = await stepCount(ctx, run);
    const spent = await daySpend(ctx, run.workspaceId, run.agentSlug, dayKey());
    if (overCap({ caps, runCost: run.costCents, dayCost: spent, steps: steps.length, startedAt: run.startedAt, now: Date.now() })) {
      await stopRun(ctx, run, "cap", "stopped");
      return { done: true as const };
    }
    const index = steps.length;
    const next = PLAN[index];
    if (!next) {
      await stopRun(ctx, run, "done", "completed");
      return { done: true as const };
    }
    if (next.kind === "tool") assertDeclared(run.skillSlug, next.toolSlug ?? "");
    if (run.status === "queued") await ctx.db.patch(run._id, { status: "running" });
    const idempotencyKey = `${run._id}:${index}`;
    if (next.kind === "tool") {
      return { done: false as const, kind: "tool" as const, index, idempotencyKey, toolSlug: next.toolSlug ?? "" };
    }
    const route = await routeFor(ctx, "write");
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
      modelInput: wrapUntrusted(INJECTION_FIXTURE),
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
) {
  await ctx.db.insert("runSteps", {
    workspaceId: run.workspaceId,
    runId: run._id,
    index,
    idempotencyKey,
    kind,
    status: "failed",
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    resultCode: code,
  });
  await stopRun(ctx, run, "error", "failed");
}

/** Marks a run failed after a model call errored. Codes only, no provider text. */
export const fail = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    index: v.number(),
    idempotencyKey: v.string(),
    code: v.string(),
    kind: v.union(v.literal("tool"), v.literal("model")),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || !OPEN.has(run.status)) return null;
    await recordFailure(ctx, run, args.index, args.idempotencyKey, args.code, args.kind);
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
      const assetId = await ctx.db.insert("assets", {
        workspaceId: run.workspaceId,
        kind: "researchReport",
        title: "Test echo",
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
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    const prior = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_idempotency", (q) => q.eq("workspaceId", run.workspaceId).eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (prior) return { status: run.status };

    const day = dayKey();
    const spent = await daySpend(ctx, run.workspaceId, run.agentSlug, day);
    const nextCost = run.costCents + args.costCents;
    const nextDay = spent + args.costCents;
    const counter = await ctx.db
      .query("capCounters")
      .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", run.workspaceId).eq("agentSlug", run.agentSlug).eq("day", day))
      .unique();
    if (counter) await ctx.db.patch(counter._id, { costCents: nextDay });
    else await ctx.db.insert("capCounters", { workspaceId: run.workspaceId, agentSlug: run.agentSlug, day, costCents: nextDay });
    await ctx.db.patch(run._id, {
      costCents: nextCost,
      inputTokens: run.inputTokens + args.inputTokens,
      outputTokens: run.outputTokens + args.outputTokens,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: run.workspaceId,
      runId: run._id,
      index: args.index,
      idempotencyKey: args.idempotencyKey,
      kind: "model",
      modelRoute: `${args.provider}/${args.model}`,
      status: "completed",
      durationMs: 1,
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
    const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug);
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
      try {
        result = await complete(plan.route, "write", plan.modelInput);
      } catch (error) {
        const code = error instanceof ModelError ? error.code : "provider_error";
        await ctx.runMutation(internal.runs.fail, {
          runId: args.runId,
          index: plan.index,
          idempotencyKey: plan.idempotencyKey,
          code,
          kind: "model",
        });
        return null;
      }
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
