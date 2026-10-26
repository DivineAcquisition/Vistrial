import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { memberAction, workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { DEFAULT_CAPS, dayKey, overCap, type Caps } from "./lib/caps";
import { assertClaims } from "./lib/evidence";
import { notAllowed, notFound } from "./lib/errors";
import { complete, type ModelRoute } from "./lib/modelRouter";
import {
  INJECTION_FIXTURE,
  TEST_AGENT,
  TEST_SKILL,
  assertDeclared,
  declaredTools,
  devSkillsEnabled,
  wrapUntrusted,
} from "./lib/registry";

const OPEN = ["queued", "running", "waiting"] as const;

async function loadCaps(ctx: MutationCtx, workspaceId: Id<"workspaces">, agentSlug: string): Promise<Caps> {
  const row = await ctx.db
    .query("agentCaps")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug))
    .unique();
  if (!row) return DEFAULT_CAPS;
  return row;
}

async function daySpend(ctx: MutationCtx, workspaceId: Id<"workspaces">, agentSlug: string, day: string) {
  const row = await ctx.db
    .query("capCounters")
    .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug).eq("day", day))
    .unique();
  return row?.costCents ?? 0;
}

async function controls(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
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

async function ensureRoute(ctx: MutationCtx, workKind: string): Promise<ModelRoute> {
  const row = await ctx.db
    .query("modelRoutes")
    .withIndex("by_workKind", (q) => q.eq("workKind", workKind))
    .unique();
  if (row) return row;
  const created = {
    workKind,
    provider: "fake",
    model: "fake-writer",
    fallbackProvider: "fake",
    fallbackModel: "fake-writer",
  };
  await ctx.db.insert("modelRoutes", created);
  return created;
}

async function stopRun(
  ctx: MutationCtx,
  run: { _id: Id<"agentRuns">; workspaceId: Id<"workspaces">; costCents: number },
  stopReason: "cap" | "error" | "cancelled" | "halted" | "done",
  status: "stopped" | "failed" | "completed",
) {
  await ctx.db.patch(run._id, { status, stopReason, finishedAt: Date.now() });
  await writeAudit(ctx, {
    workspaceId: run.workspaceId,
    actorType: "system",
    actorId: "runtime",
    action: "run.finished",
    subject: run._id,
    count: run.costCents,
  });
}

async function memberOrThrow(ctx: MutationCtx, workspaceId: Id<"workspaces">, userId: string) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
  if (!member?.active) notFound();
  return member;
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
      .take(20);
    return rows
      .map((row) => ({
        id: row._id,
        skillSlug: row.skillSlug,
        status: row.status,
        stopReason: row.stopReason ?? null,
        costCents: row.costCents,
        startedAt: row.startedAt,
      }))
      .sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const get = workspaceQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
      .take(50);
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
      artifacts: artifacts.map((row) => ({ id: row._id, kind: row.kind, byteSize: row.byteSize, body: row.body ?? "" })),
    };
  },
});

export const start = workspaceMutation({
  args: { agentSlug: v.string(), skillSlug: v.string() },
  handler: async (ctx, args) => {
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
    return id;
  },
});

export const stop = workspaceMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    if (run.status === "completed" || run.status === "failed" || run.status === "stopped") return null;
    await stopRun(ctx, run, "halted", "stopped");
    return null;
  },
});

export const plan = internalQuery({
  args: { workspaceId: v.id("workspaces"), runId: v.id("agentRuns"), userId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", args.userId))
      .unique();
    if (!member?.active) notFound();
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== args.workspaceId) notFound();
    if (run.status !== "queued" && run.status !== "running") {
      return { done: true as const, status: run.status };
    }
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", args.workspaceId).eq("runId", run._id))
      .take(50);
    const index = steps.length;
    const tools = declaredTools(run.skillSlug);
    const planSteps: { kind: "tool" | "model"; toolSlug?: string; workKind?: "write" }[] = [
      { kind: "tool", toolSlug: "profile.read" },
      { kind: "model", workKind: "write" },
      { kind: "tool", toolSlug: "asset.create" },
    ];
    const next = planSteps[index];
    if (!next) return { done: true as const, status: run.status };
    if (next.kind === "tool" && next.toolSlug && !tools.includes(next.toolSlug as "profile.read")) {
      throw new Error("That tool is not declared for this skill.");
    }
    const route = await ctx.db
      .query("modelRoutes")
      .withIndex("by_workKind", (q) => q.eq("workKind", "write"))
      .unique();
    return {
      done: false as const,
      status: run.status,
      index,
      idempotencyKey: `${run._id}:${index}`,
      kind: next.kind,
      toolSlug: next.toolSlug ?? null,
      workKind: "write" as const,
      route: route ?? {
        provider: "fake",
        model: "fake-writer",
        fallbackProvider: "fake",
        fallbackModel: "fake-writer",
      },
      modelInput: wrapUntrusted(INJECTION_FIXTURE),
    };
  },
});

export const commitTool = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    runId: v.id("agentRuns"),
    userId: v.string(),
    idempotencyKey: v.string(),
    index: v.number(),
    toolSlug: v.string(),
  },
  handler: async (ctx, args) => {
    await memberOrThrow(ctx, args.workspaceId, args.userId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== args.workspaceId) notFound();
    const prior = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_idempotency", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (prior?.resultId) return { status: run.status, resultId: prior.resultId };

    assertDeclared(run.skillSlug, args.toolSlug);
    const gate = await controls(ctx, args.workspaceId);
    if (gate.paused || gate.halted) {
      await stopRun(ctx, run, "cancelled", "stopped");
      return { status: "stopped" as const, resultId: null };
    }
    const caps = await loadCaps(ctx, args.workspaceId, run.agentSlug);
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", args.workspaceId).eq("runId", run._id))
      .take(50);
    const spent = await daySpend(ctx, args.workspaceId, run.agentSlug, dayKey());
    if (
      overCap({
        caps,
        runCost: run.costCents,
        dayCost: spent,
        steps: steps.length,
        startedAt: run.startedAt,
        now: Date.now(),
      })
    ) {
      await stopRun(ctx, run, "cap", "stopped");
      return { status: "stopped" as const, resultId: null };
    }

    await ctx.db.patch(run._id, { status: "running" });
    let resultId = "read";
    if (args.toolSlug === "profile.read") {
      const profiles = await ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId).eq("status", "confirmed"))
        .take(10);
      const confirmed = profiles.sort((a, b) => b.version - a.version)[0];
      resultId = confirmed?._id ?? "none";
    } else if (args.toolSlug === "test.echo") {
      resultId = "echo";
    } else if (args.toolSlug === "asset.create") {
      const readStep = steps.find((step) => step.toolSlug === "profile.read");
      const sourceId = readStep?.resultId ?? "none";
      const claims = [
        {
          claimKey: "profile",
          statement: "The confirmed profile was read.",
          sourceId,
          fetchedAt: Date.now(),
        },
      ];
      assertClaims(claims);
      const assetId = await ctx.db.insert("assets", {
        workspaceId: args.workspaceId,
        kind: "researchReport",
        title: "Test echo",
        status: "draft",
        currentVersion: 1,
        createdByRun: run._id,
        createdAt: Date.now(),
      });
      const versionId = await ctx.db.insert("assetVersions", {
        workspaceId: args.workspaceId,
        assetId,
        version: 1,
        body: "ok",
        createdBy: "agent",
      });
      for (const claim of claims) {
        await ctx.db.insert("evidence", {
          workspaceId: args.workspaceId,
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
      workspaceId: args.workspaceId,
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
      const bytes = new TextEncoder().encode(wrapUntrusted(INJECTION_FIXTURE));
      await ctx.db.insert("runArtifacts", {
        workspaceId: args.workspaceId,
        runId: run._id,
        stepId,
        kind: "tool",
        byteSize: bytes.byteLength,
        body: wrapUntrusted(INJECTION_FIXTURE),
      });
    }
    if (args.toolSlug === "asset.create") {
      await stopRun(ctx, { ...run, costCents: run.costCents }, "done", "completed");
      return { status: "completed" as const, resultId };
    }
    return { status: "running" as const, resultId };
  },
});

export const commitModel = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    runId: v.id("agentRuns"),
    userId: v.string(),
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
    await memberOrThrow(ctx, args.workspaceId, args.userId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== args.workspaceId) notFound();
    const prior = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_idempotency", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (prior?.resultId) return { status: run.status, resultId: prior.resultId };

    const caps = await loadCaps(ctx, args.workspaceId, run.agentSlug);
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", args.workspaceId).eq("runId", run._id))
      .take(50);
    const day = dayKey();
    const spent = await daySpend(ctx, args.workspaceId, run.agentSlug, day);
    if (
      overCap({
        caps,
        runCost: run.costCents,
        dayCost: spent,
        steps: steps.length,
        startedAt: run.startedAt,
        now: Date.now(),
      })
    ) {
      await stopRun(ctx, run, "cap", "stopped");
      return { status: "stopped" as const, resultId: null };
    }

    const nextCost = run.costCents + args.costCents;
    const nextDay = spent + args.costCents;
    const counter = await ctx.db
      .query("capCounters")
      .withIndex("by_workspace_agent_day", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("agentSlug", run.agentSlug).eq("day", day),
      )
      .unique();
    if (counter) await ctx.db.patch(counter._id, { costCents: nextDay });
    else {
      await ctx.db.insert("capCounters", {
        workspaceId: args.workspaceId,
        agentSlug: run.agentSlug,
        day,
        costCents: nextDay,
      });
    }
    await ctx.db.patch(run._id, {
      status: "running",
      costCents: nextCost,
      inputTokens: run.inputTokens + args.inputTokens,
      outputTokens: run.outputTokens + args.outputTokens,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: args.workspaceId,
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
    const bytes = new TextEncoder().encode(args.text);
    await ctx.db.insert("runArtifacts", {
      workspaceId: args.workspaceId,
      runId: run._id,
      stepId,
      kind: "model",
      byteSize: bytes.byteLength,
      body: args.text,
    });
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "system",
      actorId: "runtime",
      action: "run.model",
      subject: stepId,
      count: args.costCents,
    });
    const crossed = overCap({
      caps,
      runCost: nextCost,
      dayCost: nextDay,
      steps: steps.length + 1,
      startedAt: run.startedAt,
      now: Date.now(),
    });
    if (crossed) {
      await stopRun(ctx, { ...run, costCents: nextCost }, "cap", "stopped");
      return { status: "stopped" as const, resultId: stepId };
    }
    return { status: "running" as const, resultId: stepId };
  },
});

export const advance = memberAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<string> => {
    const plan = await ctx.runQuery(internal.runs.plan, {
      workspaceId: ctx.workspaceId,
      runId: args.runId,
      userId: ctx.userId,
    });
    if (plan.done) return plan.status;
    if (plan.kind === "model") {
      const route = plan.route;
      const result = await complete(route, plan.workKind, plan.modelInput);
      const saved: { status: string } = await ctx.runMutation(internal.runs.commitModel, {
        workspaceId: ctx.workspaceId,
        runId: args.runId,
        userId: ctx.userId,
        idempotencyKey: plan.idempotencyKey,
        index: plan.index,
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents: result.costCents,
        provider: result.provider,
        model: result.model,
      });
      return saved.status;
    }
    const saved: { status: string } = await ctx.runMutation(internal.runs.commitTool, {
      workspaceId: ctx.workspaceId,
      runId: args.runId,
      userId: ctx.userId,
      idempotencyKey: plan.idempotencyKey,
      index: plan.index,
      toolSlug: plan.toolSlug ?? "",
    });
    return saved.status;
  },
});

export const applyDeclared = internalMutation({
  args: { skillSlug: v.string(), toolSlug: v.string() },
  handler: async (_ctx, args) => {
    assertDeclared(args.skillSlug, args.toolSlug);
    return true;
  },
});
