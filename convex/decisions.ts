/**
 * The outcome loop: the business picks report opportunities to try, says when to check back, and later
 * records what happened. Figures come from its own Meta results and results files, read at the decision and
 * again at the outcome, so "before" and "after" are measured, not remembered. The next research session
 * reads these as known context.
 *
 * Each outcome also writes one de-identified row to `learningSignals`, Vistrial's internal learning. No
 * public function reads that table.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound } from "./lib/errors";
import { uploadAgents } from "./resultUploads";
import { reportForProject } from "./studio";
import { analysisFor } from "./offers";
import { savedRecord } from "./lib/savedRecords";
import { readDiagnosis, type RoadmapPhase } from "./skills/growthDiagnostics/shapes";
import { readIndustry } from "./skills/landingTeardown/shapes";

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHECK_IN_DAYS = [14, 30, 60, 90] as const;
const MAX_NOTE = 500;
const MAX_TEXT = 600;
const MAX_MARKET = 60;

export const RESULTS = ["better", "same", "worse", "tooEarly", "notTried"] as const;
export type DecisionResult = (typeof RESULTS)[number];
const resultValidator = v.union(v.literal("better"), v.literal("same"), v.literal("worse"), v.literal("tooEarly"), v.literal("notTried"));

export type Figures = Doc<"decisions">["baseline"][number];

function clip(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function requireEditor(role: Doc<"members">["role"]) {
  if (role === "rep") notAllowed();
}

/**
 * The business's own figures right now: its Meta results (when the connection is granted to the Growth
 * Architect) and each ready results file granted to it. Totals only.
 */
export async function currentFigures(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<Figures[]> {
  const now = Date.now();
  const rows: Figures[] = [];
  const connection = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (connection?.status === "connected" && connection.adAccountId && (connection.agents ?? [GROWTH_ARCHITECT]).includes(GROWTH_ARCHITECT)) {
    const snapshot = await ctx.db
      .query("metaAdSnapshots")
      .withIndex("by_workspace_account", (q) => q.eq("workspaceId", workspaceId).eq("adAccountId", connection.adAccountId!))
      .unique();
    if (snapshot) {
      const results = snapshot.campaigns.reduce((sum, row) => sum + (row.results ?? 0), 0);
      rows.push({
        source: "meta",
        label: "Meta ads",
        currency: snapshot.currency,
        dateStart: snapshot.dateStart,
        dateStop: snapshot.dateStop,
        spend: snapshot.totals.spend,
        conversions: results,
        capturedAt: now,
      });
    }
  }
  const uploads = await ctx.db
    .query("resultUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(20);
  const seen = new Set<string>();
  for (const upload of uploads) {
    if (upload.status !== "ready" || !upload.summary || !uploadAgents(upload).includes(GROWTH_ARCHITECT)) continue;
    // The newest file per label stands for that source.
    if (seen.has(upload.label)) continue;
    seen.add(upload.label);
    rows.push({
      source: "upload",
      label: upload.label,
      currency: upload.currency,
      dateStart: upload.summary.dateStart,
      dateStop: upload.summary.dateStop,
      ...(upload.summary.totals.spend !== undefined ? { spend: upload.summary.totals.spend } : {}),
      ...(upload.summary.totals.conversions !== undefined ? { conversions: upload.summary.totals.conversions } : {}),
      ...(upload.summary.totals.revenue !== undefined ? { revenue: upload.summary.totals.revenue } : {}),
      capturedAt: now,
    });
  }
  return rows;
}

const METRICS = ["spend", "conversions", "revenue"] as const;

/** Percent change per measure, comparing the same source before and after. Skips a zero baseline. */
export function changesBetween(before: Figures[], after: Figures[]) {
  const changes: { source: string; label: string; metric: (typeof METRICS)[number]; before: number; after: number; percent: number }[] = [];
  for (const old of before) {
    const now = after.find((row) => row.source === old.source && row.label === old.label);
    if (!now) continue;
    for (const metric of METRICS) {
      const a = old[metric];
      const b = now[metric];
      if (a === undefined || b === undefined || a === 0) continue;
      changes.push({ source: old.source, label: old.label, metric, before: a, after: b, percent: Math.round(((b - a) / Math.abs(a)) * 1000) / 10 });
    }
  }
  return changes;
}

const RESULT_WORDS: Record<DecisionResult, string> = {
  better: "it helped",
  same: "no clear change",
  worse: "it made things worse",
  tooEarly: "too early to tell",
  notTried: "not tried",
};

/** One line for the next research brief: what was tried, what happened, and the measured change. */
export function describeDecision(decision: Pick<Doc<"decisions">, "proposedAction" | "checkInAt" | "baseline" | "outcome">) {
  if (!decision.outcome) {
    return `Planned: ${decision.proposedAction}. Check-in due ${new Date(decision.checkInAt).toISOString().slice(0, 10)}; no outcome yet.`;
  }
  const measured = changesBetween(decision.baseline, decision.outcome.after)
    .map((row) => `${row.label} ${row.metric} ${row.percent > 0 ? "+" : ""}${row.percent}%`)
    .join(", ");
  const note = decision.outcome.note ? ` Owner: "${decision.outcome.note}"` : "";
  return `Tried: ${decision.proposedAction}. Result: ${RESULT_WORDS[decision.outcome.result]}${measured ? ` (${measured})` : ""}.${note}`;
}

async function ownDecision(ctx: QueryCtx, workspaceId: Id<"workspaces">, decisionId: Id<"decisions">) {
  const decision = await ctx.db.get(decisionId);
  if (!decision || decision.workspaceId !== workspaceId) notFound();
  return decision;
}

export type DecisionView = {
  id: Id<"decisions">;
  /** Null for a report opportunity. */
  itemKind: "offerChange" | "roadmapStep" | "pageChange" | null;
  phase: RoadmapPhase | null;
  assetId: Id<"assets"> | null;
  opportunityIndex: number;
  opportunity: string;
  proposedAction: string;
  validationMethod: string;
  checkInAt: number;
  createdAt: number;
  due: boolean;
  baseline: Figures[];
  outcome: (Omit<NonNullable<Doc<"decisions">["outcome"]>, "recordedBy"> & { changes: ReturnType<typeof changesBetween> }) | null;
};

function view(decision: Doc<"decisions">, now: number): DecisionView {
  return {
    id: decision._id,
    itemKind: decision.itemKind ?? null,
    phase: decision.phase ?? null,
    assetId: decision.assetId ?? null,
    opportunityIndex: decision.opportunityIndex,
    opportunity: decision.opportunity,
    proposedAction: decision.proposedAction,
    validationMethod: decision.validationMethod,
    checkInAt: decision.checkInAt,
    createdAt: decision.createdAt,
    due: !decision.outcome && decision.checkInAt <= now,
    baseline: decision.baseline,
    outcome: decision.outcome
      ? {
          result: decision.outcome.result,
          note: decision.outcome.note,
          after: decision.outcome.after,
          recordedAt: decision.outcome.recordedAt,
          changes: changesBetween(decision.baseline, decision.outcome.after),
        }
      : null,
  };
}

/** The decisions made on one research project's report. */
export const forProject = workspaceQuery({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    const rows = await ctx.db
      .query("decisions")
      .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", args.projectId))
      .take(50);
    const now = Date.now();
    // Report opportunities only: offer changes and roadmap steps belong to their own asset.
    return rows.filter((row) => !row.itemKind).map((row) => view(row, now));
  },
});

/** The decisions made on one offer analysis or growth diagnosis: its offer changes or roadmap steps. */
export const forAsset = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    const rows = await ctx.db
      .query("decisions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
      .take(50);
    const now = Date.now();
    return rows.filter((row) => row.itemKind).map((row) => view(row, now));
  },
});

type PlannedItem = {
  projectId: Id<"researchProjects">;
  runId: Id<"agentRuns">;
  itemKind: "offerChange" | "roadmapStep" | "pageChange";
  phase?: RoadmapPhase;
  opportunity: string;
  proposedAction: string;
  validationMethod: string;
};

/**
 * The item a person chose from an asset, read from the run's own saved record, never from the screen: an
 * offer change from an offer analysis, or a roadmap step from a growth diagnosis. Its research project is
 * the diagnosis's own, or the approved market report the offer analysis built on, so the next research
 * session reads the outcome as known context.
 */
async function itemOf(ctx: QueryCtx, asset: Doc<"assets">, index: number): Promise<PlannedItem | null> {
  const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
  if (!run || run.workspaceId !== asset.workspaceId) return null;
  if (asset.kind === "offerAnalysis") {
    const read = await analysisFor(ctx, asset);
    const change = read?.analysis.changes[index];
    const raw = read?.context?.baseProjectId ?? read?.context?.reports.find((row) => row.projectId)?.projectId ?? null;
    const projectId = raw ? ctx.db.normalizeId("researchProjects", raw) : null;
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!change || !project || project.workspaceId !== asset.workspaceId) return null;
    return { projectId: project._id, runId: run._id, itemKind: "offerChange", opportunity: change.title, proposedAction: change.proposedChange, validationMethod: change.validationMethod };
  }
  if (asset.kind === "growthDiagnosis") {
    const saved = (await savedRecord(ctx.db, asset, "diagnosis")) as { diagnosis: unknown } | null;
    const step = readDiagnosis(saved?.diagnosis)?.roadmap[index];
    const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!step || !project || project.workspaceId !== asset.workspaceId) return null;
    return {
      projectId: project._id,
      runId: run._id,
      itemKind: "roadmapStep",
      phase: step.phase,
      opportunity: step.problem,
      proposedAction: step.action,
      validationMethod: `Watch ${step.targetMetric}. Target: ${step.target}`,
    };
  }
  if (asset.kind === "pageTeardown") {
    // A change to a landing page, from a teardown. Its project is the teardown's own.
    const saved = (await savedRecord(ctx.db, asset, "teardown")) as { read?: unknown } | null;
    const suggestion = readIndustry(saved?.read)?.suggestions[index];
    const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!suggestion || !project || project.workspaceId !== asset.workspaceId) return null;
    return { projectId: project._id, runId: run._id, itemKind: "pageChange", opportunity: suggestion.title, proposedAction: suggestion.change, validationMethod: suggestion.howToTell };
  }
  return null;
}

/**
 * "We'll try this" on an offer change or a roadmap step: the same outcome loop as a report opportunity,
 * with the check-in date and today's figures. Rejected work cannot be tried. Owners and managers.
 */
export const planItem = workspaceMutation({
  args: { assetId: v.id("assets"), index: v.number(), checkInDays: v.number() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!CHECK_IN_DAYS.includes(args.checkInDays as (typeof CHECK_IN_DAYS)[number])) notAllowed();
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (asset.status === "rejected" || asset.status === "archived") notAllowed();
    const item = await itemOf(ctx, asset, args.index);
    if (!item) notFound();
    const existing = await ctx.db
      .query("decisions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
      .take(50);
    const same = existing.find((row) => row.itemKind === item.itemKind && row.opportunityIndex === args.index);
    if (same) return same._id;
    const now = Date.now();
    const decisionId = await ctx.db.insert("decisions", {
      workspaceId: ctx.workspaceId,
      projectId: item.projectId,
      runId: item.runId,
      assetId: asset._id,
      itemKind: item.itemKind,
      ...(item.phase ? { phase: item.phase } : {}),
      opportunityIndex: args.index,
      opportunity: clip(item.opportunity, MAX_TEXT),
      proposedAction: clip(item.proposedAction, MAX_TEXT),
      validationMethod: clip(item.validationMethod, MAX_TEXT),
      checkInAt: now + args.checkInDays * DAY_MS,
      createdBy: ctx.identity.subject,
      createdAt: now,
      baseline: await currentFigures(ctx, ctx.workspaceId),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "decision.planned",
      subject: decisionId,
    });
    return decisionId;
  },
});

/** Check-ins that are due: decisions past their date with no outcome yet, oldest first. */
export const due = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("decisions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId).lte("checkInAt", now))
      .take(50);
    return rows
      .filter((row) => !row.outcome)
      .slice(0, 10)
      .map((row) => ({ ...view(row, now), projectId: row.projectId }));
  },
});

/** "We'll try this": records the decision, its check-in date, and today's figures. Owners and managers. */
export const plan = workspaceMutation({
  args: { projectId: v.id("researchProjects"), opportunityIndex: v.number(), checkInDays: v.number() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!CHECK_IN_DAYS.includes(args.checkInDays as (typeof CHECK_IN_DAYS)[number])) notAllowed();
    const project = await ctx.db.get(args.projectId);
    if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    const written = await reportForProject(ctx, project);
    const opportunity = written?.report.opportunities[args.opportunityIndex];
    if (!written || !opportunity) notFound();
    const existing = await ctx.db
      .query("decisions")
      .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", args.projectId))
      .take(20);
    // One decision per opportunity of the current report.
    const same = existing.find((row) => row.runId === written.runId && row.opportunityIndex === args.opportunityIndex);
    if (same) return same._id;
    const assetId = written.assetId ? ctx.db.normalizeId("assets", written.assetId) : null;
    const now = Date.now();
    const decisionId = await ctx.db.insert("decisions", {
      workspaceId: ctx.workspaceId,
      projectId: args.projectId,
      runId: written.runId,
      ...(assetId ? { assetId } : {}),
      opportunityIndex: args.opportunityIndex,
      opportunity: clip(opportunity.opportunity, MAX_TEXT),
      proposedAction: clip(opportunity.proposedAction, MAX_TEXT),
      validationMethod: clip(opportunity.validationMethod, MAX_TEXT),
      checkInAt: now + args.checkInDays * DAY_MS,
      createdBy: ctx.identity.subject,
      createdAt: now,
      baseline: await currentFigures(ctx, ctx.workspaceId),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "decision.planned",
      subject: decisionId,
    });
    return decisionId;
  },
});

/** Moves a check-in date. Owners and managers. */
export const reschedule = workspaceMutation({
  args: { decisionId: v.id("decisions"), checkInDays: v.number() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!CHECK_IN_DAYS.includes(args.checkInDays as (typeof CHECK_IN_DAYS)[number])) notAllowed();
    const decision = await ownDecision(ctx, ctx.workspaceId, args.decisionId);
    if (decision.outcome) notAllowed();
    await ctx.db.patch(decision._id, { checkInAt: Date.now() + args.checkInDays * DAY_MS });
    return null;
  },
});

/** "What happened": records the result in the owner's words, with today's figures beside the baseline. */
export const recordOutcome = workspaceMutation({
  args: { decisionId: v.id("decisions"), result: resultValidator, note: v.string() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const decision = await ownDecision(ctx, ctx.workspaceId, args.decisionId);
    const now = Date.now();
    const after = await currentFigures(ctx, ctx.workspaceId);
    const outcome = { result: args.result, note: clip(args.note, MAX_NOTE), after, recordedAt: now, recordedBy: ctx.identity.subject };
    await ctx.db.patch(decision._id, { outcome });
    await writeLearningSignal(ctx, { ...decision, outcome });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "decision.outcome",
      subject: `${decision._id}:${args.result}`,
    });
    return null;
  },
});

/** Removes a decision and its learning row. Owners and managers. */
export const remove = workspaceMutation({
  args: { decisionId: v.id("decisions") },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const decision = await ownDecision(ctx, ctx.workspaceId, args.decisionId);
    await deleteLearningSignal(ctx, decision._id);
    await ctx.db.delete(decision._id);
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "decision.removed",
      subject: args.decisionId,
    });
    return null;
  },
});

// ---------- Internal learning (never public) ----------

async function deleteLearningSignal(ctx: MutationCtx, decisionId: Id<"decisions">) {
  const rows = await ctx.db
    .query("learningSignals")
    .withIndex("by_decision", (q) => q.eq("decisionId", decisionId))
    .take(5);
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * One de-identified row per outcome: the market in a few words (no place), the action as the report wrote
 * it, the result, days taken, and percent changes. Never the workspace, a person, an amount, or the owner's
 * note. Recording a new outcome replaces the row.
 */
async function writeLearningSignal(ctx: MutationCtx, decision: Doc<"decisions"> & { outcome: NonNullable<Doc<"decisions">["outcome"]> }) {
  await deleteLearningSignal(ctx, decision._id);
  const project = await ctx.db.get(decision.projectId);
  await ctx.db.insert("learningSignals", {
    decisionId: decision._id,
    market: clip((project?.market ?? "").toLowerCase(), MAX_MARKET),
    opportunity: decision.opportunity,
    proposedAction: decision.proposedAction,
    result: decision.outcome.result,
    daysToOutcome: Math.max(0, Math.round((decision.outcome.recordedAt - decision.createdAt) / DAY_MS)),
    changes: changesBetween(decision.baseline, decision.outcome.after).map((row) => ({ source: row.source, metric: row.metric, percent: row.percent })),
    month: new Date(decision.outcome.recordedAt).toISOString().slice(0, 7),
  });
}

/**
 * For Vistrial's team only, from the Convex dashboard or CLI (`npx convex run decisions:learningSummary`):
 * outcomes by market and result. Internal; no screen calls it.
 */
export const learningSummary = internalQuery({
  args: { market: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("learningSignals").take(2000);
    const filtered = args.market ? rows.filter((row) => row.market.includes(args.market!.toLowerCase())) : rows;
    const byMarket = new Map<string, Record<DecisionResult, number>>();
    for (const row of filtered) {
      const counts = byMarket.get(row.market) ?? { better: 0, same: 0, worse: 0, tooEarly: 0, notTried: 0 };
      counts[row.result] += 1;
      byMarket.set(row.market, counts);
    }
    return {
      total: filtered.length,
      byMarket: [...byMarket.entries()].map(([market, counts]) => ({ market, ...counts })),
      recent: filtered.slice(-50).map(({ market, opportunity, proposedAction, result, daysToOutcome, changes, month }) => ({
        market,
        opportunity,
        proposedAction,
        result,
        daysToOutcome,
        changes,
        month,
      })),
    };
  },
});

/** For context.read: the decisions this workspace made, newest first, with outcomes first. */
export async function decisionsForContext(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(30);
  return rows
    .sort((a, b) => Number(Boolean(b.outcome)) - Number(Boolean(a.outcome)) || b.createdAt - a.createdAt)
    .slice(0, 10);
}
