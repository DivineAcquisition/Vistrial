import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { PLATFORM_CEILING, SOFT_WARNING_RATIO, capScope, dayKey, overCap } from "./lib/caps";
import { addDaySpend, daySpend, loadCaps, runCaps } from "./lib/capRows";
import { currentAgentSlug } from "./catalog";
import { assertClaims, assertSourcesExist } from "./lib/evidence";
import { notAllowed, notFound, userError } from "./lib/errors";
import { ModelError, NO_SPEND, complete, type ModelRoute, type Spend } from "./lib/modelRouter";
import { completeWithTools } from "./lib/toolRouter";
import { INJECTION_FIXTURE, TEST_SKILL, devSkillsEnabled, isCollectTool, wrapUntrusted } from "./lib/registry";
import { collectResult, type Platform } from "./lib/researchShapes";
import { saveSourceRef, setSourceStatus } from "./lib/sourceRefs";
import { writeFact } from "./lib/facts";
import { estimateCents } from "./lib/estimate";
import { MUTATION_TOOLS as MI_TOOLS } from "./skills/marketIntelligence/tools";
import { OFFER_TOOLS } from "./skills/offerIntelligence/tools";
import { liveEnv, runAdapter } from "./adapters";
import { assertDeclared, skillFor } from "./lib/skills";
import { assertCanSpend, chargeUsage } from "./lib/billing";

const OPEN = new Set(["queued", "running", "waiting"]);

/** Every skill's code-only tools, by slug. */
const MUTATION_TOOLS = { ...MI_TOOLS, ...OFFER_TOOLS };

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
  v.literal("needsInput"),
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
    const caps = await runCaps(ctx, run);
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
          phase: step.phase ?? null,
          /** When the step was recorded, for the live feed's timings. */
          at: step._creationTime,
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

/**
 * Starts a run. Shared by the public start (a signed-in member) and development tools that drive the real
 * path from the dashboard; `checkCredit` is off only for the latter.
 */
export async function startRunFor(
  ctx: MutationCtx,
  {
    workspaceId,
    userId,
    role,
    checkCredit = true,
    free = false,
    projectId,
    ...input
  }: {
    workspaceId: Id<"workspaces">;
    userId: string;
    role: string;
    checkCredit?: boolean;
    /** Onboarding's free session: no credit check, and nothing is charged to the workspace. */
    free?: boolean;
    agentSlug: string;
    skillSlug: string;
    projectId?: Id<"researchProjects">;
    mode?: "thorough" | "fast";
  },
) {
  if (checkCredit && !free) await assertCanSpend(ctx, workspaceId);
  if (role === "rep") notAllowed();
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (projectId && (!project || project.workspaceId !== workspaceId)) notFound();
  if (project?.status === "archived") throw userError("This project is archived.");
  if (project?.latestRunId) {
    const latest = await ctx.db.get(project.latestRunId);
    if (latest?.status === "waiting") throw userError("This project has a run waiting for an answer. Answer it first.");
    if (latest && (latest.status === "queued" || latest.status === "running")) throw userError("This project already has a run in progress.");
  }
  // An older client may still send a renamed slug. Runs are always stored under the current one.
  const args = { ...input, agentSlug: currentAgentSlug(input.agentSlug) };
  if (args.skillSlug === TEST_SKILL && !devSkillsEnabled()) notFound();
  const skill = skillFor(args.skillSlug);
  if (!skill) throw userError("This skill is not built yet.");
  if (skill.needsProject && !projectId) throw userError("Choose a research project first.");
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_slug", (q) => q.eq("slug", args.agentSlug))
    .unique();
  if (!agent || agent.retired === true) notFound();
  if (agent.status !== "live") throw userError(`${agent.name} is not available yet.`);
  const link = await ctx.db
    .query("workspaceAgents")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
    .unique();
  if (!link || link.state === "off") throw userError(`Turn on the ${agent.name} first.`);
  if (skill.agentSlug !== agent.slug) notFound();
  const gate = await controls(ctx, workspaceId);
  const caps = await loadCaps(ctx, workspaceId, args.agentSlug, args.skillSlug);
  const spent = await daySpend(ctx, workspaceId, args.agentSlug, args.skillSlug, dayKey());
  const blocked = gate.paused || gate.halted || spent >= caps.maxCostCentsPerDay;
  const id = await ctx.db.insert("agentRuns", {
    workspaceId: workspaceId,
    agentSlug: args.agentSlug,
    skillSlug: args.skillSlug,
    status: blocked ? "stopped" : "queued",
    startedBy: userId,
    inputRef: project?._id ?? args.skillSlug,
    ...(args.mode ? { mode: args.mode } : {}),
    startedAt: Date.now(),
    finishedAt: blocked ? Date.now() : undefined,
    stopReason: blocked ? (gate.halted || gate.paused ? "cancelled" : "cap") : undefined,
    costCents: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...(free ? { free: true } : {}),
  });
  await writeAudit(ctx, {
    workspaceId: workspaceId,
    actorType: "user",
    actorId: userId,
    action: "run.started",
    subject: id,
    count: 0,
  });
  // Running locks the project's scope. Whether it is running now is read from its latest run.
  if (project) await ctx.db.patch(project._id, { status: "ready", latestRunId: id, updatedAt: Date.now() });
  if (!blocked) {
    await ctx.scheduler.runAfter(0, internal.runs.step, { runId: id });
    await ctx.scheduler.runAfter(caps.maxDurationMs, internal.runs.expire, { runId: id });
  }
  return id;
}

export const start = workspaceMutation({
  args: {
    agentSlug: v.string(),
    skillSlug: v.string(),
    /** The research project this run works on. Collect steps save their sources to it. */
    projectId: v.optional(v.id("researchProjects")),
    /** Quality mode; thorough when missing. */
    mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))),
  },
  handler: async (ctx, { projectId, ...input }) =>
    startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, projectId, ...input }),
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
    // Waiting does not count against the time cap. A wait pushes the stop back by its length.
    if (run.status === "waiting") return null;
    const caps = await runCaps(ctx, run);
    const left = caps.maxDurationMs - (Date.now() - run.startedAt - (run.waitedMs ?? 0));
    if (left > 0) {
      await ctx.scheduler.runAfter(left, internal.runs.expire, { runId: run._id });
      return null;
    }
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
    // A waiting run makes no calls and runs no research until a person answers.
    if (run.status === "waiting") return { done: true as const };
    if (!(await starterActive(ctx, run))) {
      await stopRun(ctx, run, "cancelled", "stopped");
      return { done: true as const };
    }
    const gate = await controls(ctx, run.workspaceId);
    if (gate.paused || gate.halted) {
      await stopRun(ctx, run, "cancelled", "stopped");
      return { done: true as const };
    }
    const caps = await runCaps(ctx, run);
    const steps = await stepCount(ctx, run);
    const spent = await daySpend(ctx, run.workspaceId, run.agentSlug, run.skillSlug, dayKey());
    const activeSince = run.startedAt + (run.waitedMs ?? 0);
    if (overCap({ caps, runCost: run.costCents, dayCost: spent, steps: steps.length, startedAt: activeSince, now: Date.now() })) {
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
          _id: step._id,
          index: step.index,
          kind: step.kind,
          toolSlug: step.toolSlug,
          status: step.status,
          resultCode: step.resultCode,
          resultId: step.resultId,
          phase: step.phase,
        })),
    });
    if (!next) {
      await stopRun(ctx, run, "done", "completed");
      return { done: true as const };
    }
    if (next.kind === "ask") {
      const question = skill.questions?.[next.questionKey];
      if (!question) {
        await recordFailure(ctx, run, index, idempotencyKey, "undeclared_question", "tool");
        return { done: true as const };
      }
      await askQuestion(ctx, run, index, idempotencyKey, next.questionKey, question, next.phase);
      return { done: true as const };
    }
    const phase = next.phase ? { phase: next.phase } : {};
    if (next.kind === "tool") assertDeclared(run.skillSlug, next.toolSlug);
    // Claude's web tools are tools too: a model step may use them only if the skill declared them.
    if (next.kind === "model" && next.webSearch) assertDeclared(run.skillSlug, "web.search");
    if (next.kind === "model" && next.webFetch) assertDeclared(run.skillSlug, "web.fetch");
    if (run.status === "queued") await ctx.db.patch(run._id, { status: "running" });
    if (next.kind === "tool" && isCollectTool(next.toolSlug)) {
      return { done: false as const, kind: "collect" as const, index, idempotencyKey, toolSlug: next.toolSlug, ...phase };
    }
    if (next.kind === "tool") {
      return { done: false as const, kind: "tool" as const, index, idempotencyKey, toolSlug: next.toolSlug, ...phase };
    }
    // Fast mode runs research and writing on the faster route.
    const workKindRoute = run.mode === "fast" && (next.workKind === "research" || next.workKind === "write") ? "classify" : next.workKind;
    const route = await routeFor(ctx, workKindRoute);
    if (!route) {
      await recordFailure(ctx, run, index, idempotencyKey, "no_route", "model", NO_SPEND, 0, undefined, next.phase);
      return { done: true as const };
    }
    // A skill with a reserve never starts a call whose worst case would spend into it, unless the step may.
    if (skill.reserveCents !== undefined) {
      const worst = estimateCents(route, next.workKind, `${next.system ?? ""}${next.input}`, next.webSearch?.maxUses ?? 0);
      const allowed = caps.maxCostCentsPerRun - run.costCents - (next.useReserve ? 0 : skill.reserveCents);
      if (worst > allowed) {
        await ctx.db.insert("runSteps", {
          workspaceId: run.workspaceId,
          runId: run._id,
          index,
          idempotencyKey,
          kind: "note",
          workKind: next.workKind,
          status: "completed",
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          resultCode: "over_budget",
          ...phase,
        });
        return { done: false as const, kind: "skipped" as const };
      }
    }
    return {
      done: false as const,
      kind: "model" as const,
      index,
      idempotencyKey,
      ...phase,
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
  toolSlug?: string,
  phase?: string,
) {
  const stepId = await ctx.db.insert("runSteps", {
    workspaceId: run.workspaceId,
    runId: run._id,
    index,
    idempotencyKey,
    kind,
    ...(toolSlug ? { toolSlug } : {}),
    ...(phase ? { phase } : {}),
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
  // The free session is on Vistrial: its cost is kept on the run and the day's counter, never charged as credits.
  if (!run.free) await chargeUsage(ctx, { workspaceId: run.workspaceId, costCents: spent.costCents, source: "run", ref: run._id });
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
    /** The tool that failed, so the run page can name it. */
    toolSlug: v.optional(v.string()),
    phase: v.optional(v.string()),
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
      args.toolSlug,
      args.phase,
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
  args: { runId: v.id("agentRuns"), idempotencyKey: v.string(), index: v.number(), toolSlug: v.string(), phase: v.optional(v.string()) },
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

    const phase = args.phase ? { phase: args.phase } : {};
    const handler = MUTATION_TOOLS[args.toolSlug];
    if (handler) {
      // A code-only tool: it reads and writes the database, never the network or a model.
      const outcome = await handler(ctx, run, [...steps].sort((a, b) => a.index - b.index));
      if (outcome.failCode) {
        await recordFailure(ctx, run, args.index, args.idempotencyKey, outcome.failCode, "tool", NO_SPEND, 0, args.toolSlug, args.phase);
        return { status: "failed" as const };
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
        resultCode: outcome.resultCode ?? "ok",
        ...(outcome.resultId ? { resultId: outcome.resultId } : {}),
        ...phase,
      });
      if (outcome.artifact) {
        await ctx.db.insert("runArtifacts", {
          workspaceId: run.workspaceId,
          runId: run._id,
          stepId,
          kind: outcome.artifact.kind,
          byteSize: new TextEncoder().encode(outcome.artifact.body).byteLength,
          body: outcome.artifact.body,
        });
      }
      return { status: "running" as const };
    }

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
          ...phase,
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
      ...phase,
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
    phase: v.optional(v.string()),
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
      ...(args.phase ? { phase: args.phase } : {}),
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
    const caps = await runCaps(ctx, run);
    const steps = await stepCount(ctx, run);
    if (overCap({ caps, runCost: nextCost, dayCost: nextDay, steps: steps.length, startedAt: run.startedAt, now: Date.now() })) {
      await stopRun(ctx, current, "cap", "stopped", nextCost);
      return { status: "stopped" as const };
    }
    return { status: "running" as const };
  },
});

/** The project a run works on, when its input is a project in the run's workspace. */
async function runProject(ctx: QueryCtx, run: Doc<"agentRuns">) {
  const id = ctx.db.normalizeId("researchProjects", run.inputRef);
  const project = id ? await ctx.db.get(id) : null;
  return project && project.workspaceId === run.workspaceId ? project : null;
}

const KNOWN_PLATFORMS: Platform[] = ["youtube", "tiktok", "instagram", "metaAdLibrary"];

/**
 * What a collect step works from: the project's scope, the web tools' results from this run's model steps
 * (newest first), and links the project already holds per platform. Null when the run has no project.
 */
export const collectInput = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const project = await runProject(ctx, run);
    if (!project) return null;
    const artifacts = await ctx.db
      .query("runArtifacts")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
      .order("desc")
      .take(200);
    const webResults = artifacts.filter((row) => row.kind === "sources" && row.body).map((row) => row.body!);
    const knownUrls: Partial<Record<Platform, string[]>> = {};
    for (const platform of KNOWN_PLATFORMS) {
      const rows = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project_platform", (q) =>
          q.eq("workspaceId", run.workspaceId).eq("projectId", project._id).eq("platform", platform),
        )
        .order("desc")
        .take(50);
      knownUrls[platform] = rows.map((row) => row.url);
    }
    return {
      scope: {
        market: project.market,
        geography: project.geography,
        competitors: project.competitors,
        platforms: project.platforms,
        suppliedUrls: project.suppliedUrls,
      },
      webResults,
      knownUrls,
    };
  },
});

const COLLECT_CODE = { available: "ok", partial: "partial", unavailable: "unavailable", awaitingAuthorization: "awaiting_authorization" } as const;

/**
 * Saves what one adapter found: the adapter's result as the raw record, each source on the project (the
 * same page once), and the adapter's status for this run. The step marker commits with them. An adapter
 * that could not reach its source still completes its step: the status says why, and the run goes on.
 */
export const commitCollect = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    idempotencyKey: v.string(),
    index: v.number(),
    toolSlug: v.string(),
    result: collectResult,
    durationMs: v.number(),
    phase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    if (await findStep(ctx, run, args.idempotencyKey)) return { status: run.status };
    if (!OPEN.has(run.status)) return { status: run.status };
    assertDeclared(run.skillSlug, args.toolSlug);
    const project = await runProject(ctx, run);
    if (!project) {
      await recordFailure(ctx, run, args.index, args.idempotencyKey, "no_project", "tool", NO_SPEND, 0, args.toolSlug);
      return { status: "failed" as const };
    }
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: run.workspaceId,
      runId: run._id,
      index: args.index,
      idempotencyKey: args.idempotencyKey,
      kind: "tool",
      toolSlug: args.toolSlug,
      status: "completed",
      durationMs: args.durationMs,
      inputTokens: 0,
      outputTokens: 0,
      resultCode: COLLECT_CODE[args.result.state],
      ...(args.phase ? { phase: args.phase } : {}),
    });
    const body = JSON.stringify(args.result);
    const artifactId = await ctx.db.insert("runArtifacts", {
      workspaceId: run.workspaceId,
      runId: run._id,
      stepId,
      kind: "tool",
      byteSize: new TextEncoder().encode(body).byteLength,
      body,
    });
    let saved = 0;
    const now = Date.now();
    for (const source of args.result.sources) {
      try {
        await saveSourceRef(ctx, { ...source, workspaceId: run.workspaceId, projectId: project._id, runId: run._id, artifactId, observedAt: now });
        saved++;
      } catch {
        // A link that is not a public address is left out. The adapter's raw record still shows it was found.
      }
    }
    const statusId = await setSourceStatus(ctx, {
      workspaceId: run.workspaceId,
      runId: run._id,
      projectId: project._id,
      platform: args.result.platform,
      state: args.result.state,
      reasonCode: args.result.reasonCode,
      found: saved,
    });
    await ctx.db.patch(stepId, { resultId: statusId });
    return { status: "running" as const };
  },
});

/** Seven days with no answer turns a waiting run into Needs Input, Timed Out (doctrine D8). */
export const ANSWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Puts a run in waiting on one question and schedules its guarded timeout. Nothing else runs meanwhile. */
async function askQuestion(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  index: number,
  idempotencyKey: string,
  questionKey: string,
  question: string,
  phase?: string,
) {
  const askedAt = Date.now();
  const questionId = `${run._id}:${index}:${askedAt.toString(36)}`;
  await ctx.db.insert("runSteps", {
    workspaceId: run.workspaceId,
    runId: run._id,
    index,
    idempotencyKey,
    kind: "note",
    status: "completed",
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    resultCode: "waiting_for_user",
    resultId: questionKey,
    ...(phase ? { phase } : {}),
  });
  await openQuestion(ctx, run, { questionId, questionKey, question, askedAt });
}

async function openQuestion(ctx: MutationCtx, run: Doc<"agentRuns">, waitingFor: NonNullable<Doc<"agentRuns">["waitingFor"]>) {
  await ctx.db.patch(run._id, { status: "waiting", waitingFor, needsInputReason: undefined });
  await ctx.scheduler.runAfter(ANSWER_WINDOW_MS, internal.runs.askTimeout, { runId: run._id, questionId: waitingFor.questionId });
  await writeAudit(ctx, {
    workspaceId: run.workspaceId,
    actorType: "system",
    actorId: "runtime",
    action: "run.asked",
    subject: run._id,
  });
}

/**
 * Fires seven days after a question. It changes the run only if the run is still waiting on that same
 * question; a run that resumed, finished, or waits on a newer question is left alone.
 */
export const askTimeout = internalMutation({
  args: { runId: v.id("agentRuns"), questionId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "waiting" || run.waitingFor?.questionId !== args.questionId) return null;
    await ctx.db.patch(run._id, {
      status: "needsInput",
      needsInputReason: "timedOut",
      waitedMs: (run.waitedMs ?? 0) + (Date.now() - run.waitingFor.askedAt),
    });
    return null;
  },
});

/**
 * An Owner or Manager answers the question a run is waiting on. The answer is saved as a verified business
 * fact, because the person stated it, and the run picks up where it stopped.
 */
export const answer = workspaceMutation({
  args: { runId: v.id("agentRuns"), questionId: v.string(), answer: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    if (run.status !== "waiting" || run.waitingFor?.questionId !== args.questionId) {
      throw userError("That question has already been answered or has changed.");
    }
    await writeFact(ctx, {
      workspaceId: ctx.workspaceId,
      factKey: run.waitingFor.questionKey,
      value: args.answer,
      sourceType: "owner",
      sourceReference: `run:${run._id}`,
      recordedBy: ctx.identity.subject,
      verifiedBy: ctx.identity.subject,
    });
    await ctx.db.patch(run._id, {
      status: "running",
      waitingFor: undefined,
      waitedMs: (run.waitedMs ?? 0) + (Date.now() - run.waitingFor.askedAt),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "run.answered",
      subject: run._id,
    });
    await ctx.scheduler.runAfter(0, internal.runs.step, { runId: run._id });
    return null;
  },
});

/** Reopens a run that timed out waiting. It asks the same question again, with a new id and a new seven days. */
export const resume = workspaceMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    if (run.status !== "needsInput" || !run.waitingFor) throw userError("This run is not waiting for input.");
    const askedAt = Date.now();
    await openQuestion(ctx, run, { ...run.waitingFor, questionId: `${run._id}:resume:${askedAt.toString(36)}`, askedAt });
    return null;
  },
});

/** Runs one step, then schedules the next. Nothing depends on a browser staying open. */
export const step = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<null> => {
    const plan = await ctx.runMutation(internal.runs.prepare, { runId: args.runId });
    if (plan.done) return null;
    const phase = "phase" in plan && plan.phase ? { phase: plan.phase } : {};
    let status: string;
    if (plan.kind === "skipped") {
      status = "running";
    } else if (plan.kind === "model") {
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
          ...phase,
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
        ...phase,
      }));
    } else if (plan.kind === "collect") {
      const input = await ctx.runQuery(internal.runs.collectInput, { runId: args.runId });
      if (!input) {
        await ctx.runMutation(internal.runs.fail, {
          runId: args.runId,
          index: plan.index,
          idempotencyKey: plan.idempotencyKey,
          code: "no_project",
          kind: "tool",
          toolSlug: plan.toolSlug,
          ...phase,
        });
        return null;
      }
      const began = Date.now();
      const collected = await runAdapter(plan.toolSlug, input, liveEnv());
      ({ status } = await ctx.runMutation(internal.runs.commitCollect, {
        runId: args.runId,
        idempotencyKey: plan.idempotencyKey,
        index: plan.index,
        toolSlug: plan.toolSlug,
        result: collected,
        durationMs: Date.now() - began,
        ...phase,
      }));
    } else {
      try {
        ({ status } = await ctx.runMutation(internal.runs.commitTool, {
          runId: args.runId,
          idempotencyKey: plan.idempotencyKey,
          index: plan.index,
          toolSlug: plan.toolSlug,
          ...phase,
        }));
      } catch {
        await ctx.runMutation(internal.runs.fail, {
          runId: args.runId,
          index: plan.index,
          idempotencyKey: plan.idempotencyKey,
          code: "tool_error",
          kind: "tool",
          toolSlug: plan.toolSlug,
          ...phase,
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
