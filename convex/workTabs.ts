/**
 * What each Growth Architect work tab shows, read on the server: this skill's runs that are going now,
 * its results (drafts waiting for review first), and the next steps it suggests. Plus the Diagnostics tab's
 * goal and roadmap, and the data a research report's PDF is built from. Every read is this workspace's.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { currentFigures } from "./decisions";
import { currentGoal } from "./goals";
import { workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { BASIS_LABEL } from "./lib/evidence";
import { savedRecord } from "./lib/savedRecords";
import { SKILL_ASSET, SKILL_TAB, isTabSkill, suggestionsFor, type TabSkill } from "./lib/workTabs";
import { reportForRun } from "./studio";
import { readDiagnosis, type DiagnosticsRecord } from "./skills/growthDiagnostics/shapes";

const OPEN = ["queued", "running", "waiting", "needsInput"] as const;

/** Review order: work waiting on a person first, then approved, then the rest. */
const STATUS_ORDER: Record<Doc<"assets">["status"], number> = { needsReview: 0, draft: 1, approved: 2, rejected: 3, archived: 4 };

async function approvedOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, kind: Doc<"assets">["kind"]) {
  return ctx.db
    .query("assets")
    .withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("status", "approved"))
    .order("desc")
    .first();
}

async function hasOwnData(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return (await currentFigures(ctx, workspaceId)).length > 0;
}

/**
 * What a diagnosis can read, for the Diagnostics tab's checklist: Meta ads connected, results files ready,
 * and outcomes the owner has recorded. A diagnosis reads only the business's own data.
 */
async function connectedData(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const meta = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  const uploads = await ctx.db
    .query("resultUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(50);
  const decisions = await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  return {
    meta: meta?.status === "connected",
    resultsFiles: uploads.filter((row) => row.status === "ready").length,
    outcomes: decisions.filter((row) => Boolean(row.outcome)).length,
  };
}

function projectIdOf(ctx: QueryCtx, run: Doc<"agentRuns"> | null) {
  return run ? ctx.db.normalizeId("researchProjects", run.inputRef) : null;
}

/** One tab: this skill's open runs with their progress, its results, recent finished runs and next steps. */
export const tab = workspaceQuery({
  args: { skillSlug: v.string() },
  handler: async (ctx, args) => {
    if (!isTabSkill(args.skillSlug)) throw userError("This skill has no workspace.");
    const skill: TabSkill = args.skillSlug;

    const running = [];
    for (const status of OPEN) {
      const rows = await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .order("desc")
        .take(20);
      for (const run of rows) {
        if (run.skillSlug !== skill || run.agentSlug !== GROWTH_ARCHITECT) continue;
        const steps = await ctx.db
          .query("runSteps")
          .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
          .take(250);
        const last = steps.sort((a, b) => a.index - b.index)[steps.length - 1];
        running.push({
          id: run._id,
          status: run.status,
          startedAt: run.startedAt,
          costCents: run.costCents,
          stepsDone: steps.filter((row) => row.status === "completed").length,
          phase: last?.phase ?? null,
          question: run.waitingFor?.question ?? null,
          projectId: projectIdOf(ctx, run),
        });
      }
    }
    running.sort((a, b) => b.startedAt - a.startedAt);

    const finished = (
      await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", GROWTH_ARCHITECT))
        .order("desc")
        .take(60)
    )
      .filter((run) => run.skillSlug === skill && !(OPEN as readonly string[]).includes(run.status))
      .slice(0, 6)
      .map((run) => ({ id: run._id, status: run.status, stopReason: run.stopReason ?? null, startedAt: run.startedAt, finishedAt: run.finishedAt ?? null, costCents: run.costCents }));

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", SKILL_ASSET[skill]))
      .order("desc")
      .take(30);
    const results = [];
    for (const asset of assets) {
      if (asset.status === "archived") continue;
      const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
      results.push({
        id: asset._id,
        title: asset.title,
        status: asset.status,
        currentVersion: asset.currentVersion,
        createdAt: asset.createdAt,
        runId: asset.createdByRun ?? null,
        projectId: run && run.workspaceId === ctx.workspaceId ? projectIdOf(ctx, run) : null,
      });
    }
    results.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt);

    const state = {
      approvedReport: (await approvedOf(ctx, ctx.workspaceId, "marketReport")) !== null,
      approvedOffer: (await approvedOf(ctx, ctx.workspaceId, "offerAnalysis")) !== null,
      approvedDiagnosis: (await approvedOf(ctx, ctx.workspaceId, "growthDiagnosis")) !== null,
      ownData: await hasOwnData(ctx, ctx.workspaceId),
      goal: (await currentGoal(ctx, ctx.workspaceId)) !== null,
    };
    return { skillSlug: skill, running, finished, results, suggestions: suggestionsFor(SKILL_TAB[skill], state), state };
  },
});

/**
 * The Diagnostics tab: the goal, which of the business's own data is connected, and the newest diagnosis as data: the stall stage, the figures it used
 * and the 90-day roadmap, each step with the figures it cites. Null diagnosis before the first one.
 */
export const diagnostics = workspaceQuery({
  args: { assetId: v.optional(v.id("assets")) },
  handler: async (ctx, args) => {
    const goal = await currentGoal(ctx, ctx.workspaceId);
    const goalView = goal ? { text: goal.text, target: goal.target ?? null, metric: goal.metric ?? null, period: goal.period ?? null, setAt: goal.setAt } : null;
    let asset: Doc<"assets"> | null = null;
    if (args.assetId) {
      asset = await ctx.db.get(args.assetId);
      if (!asset || asset.workspaceId !== ctx.workspaceId || asset.kind !== "growthDiagnosis") notFound();
    } else {
      const rows = await ctx.db
        .query("assets")
        .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "growthDiagnosis"))
        .order("desc")
        .take(10);
      asset = rows.find((row) => row.status !== "rejected" && row.status !== "archived") ?? null;
    }
    const data = await connectedData(ctx, ctx.workspaceId);
    if (!asset) return { goal: goalView, data, diagnosis: null };
    const saved = (await savedRecord(ctx.db, asset, "diagnosis")) as { diagnosis: unknown; missing?: { stage: string; text: string }[] } | null;
    const record = (await savedRecord(ctx.db, asset, "diagnostics")) as DiagnosticsRecord | null;
    const diagnosis = readDiagnosis(saved?.diagnosis);
    const figures = new Map((record?.figures ?? []).map((row) => [row.id, row]));
    const cite = (ids: string[]) =>
      ids
        .map((id) => figures.get(id))
        .filter((row) => row !== undefined)
        .map((row) => ({ id: row.id, label: row.label, display: row.display, computed: row.computed, formula: row.formula ?? null, period: row.period ?? null }));
    const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
    return {
      goal: goalView,
      data,
      diagnosis: {
        assetId: asset._id,
        title: asset.title,
        status: asset.status,
        createdAt: asset.createdAt,
        projectId: run && run.workspaceId === ctx.workspaceId ? projectIdOf(ctx, run) : null,
        /** The goal the diagnosis was written toward, which may differ from the goal now. */
        goalUsed: record?.goal?.text ?? null,
        hasData: record?.hasData ?? false,
        missing: (record?.missing ?? saved?.missing ?? []).map((row) => row.text),
        summary: diagnosis?.summary ?? "",
        stage: diagnosis?.stage ?? "unknown",
        stageReason: diagnosis?.stageReason ?? "",
        stageFigures: cite(diagnosis?.stageFigureIds ?? []),
        findings: (diagnosis?.findings ?? []).map((row) => ({ statement: row.statement, figures: cite(row.figureIds) })),
        roadmap: (diagnosis?.roadmap ?? []).map((row, index) => ({ index, phase: row.phase, problem: row.problem, action: row.action, targetMetric: row.targetMetric, target: row.target, figures: cite(row.figureIds) })),
        fixes: (diagnosis?.fixes ?? []).map((row) => ({ fix: row.fix, why: row.why, howToTell: row.howToTell })),
        limits: diagnosis?.limits ?? [],
      },
    };
  },
});

/**
 * What a market report's PDF is built from: the report as data, the sources it rests on, and the
 * business's own Meta and results figures. Read-only; the PDF is drawn in the browser.
 */
export const reportPdf = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId || asset.kind !== "marketReport") notFound();
    const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    const written = await reportForRun(ctx, run);
    if (!written) notFound();
    const projectId = projectIdOf(ctx, run);
    const project = projectId ? await ctx.db.get(projectId) : null;
    const sources =
      project && project.workspaceId === ctx.workspaceId
        ? await ctx.db
            .query("sourceRefs")
            .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id))
            .take(300)
        : [];
    const workspace = await ctx.db.get(ctx.workspaceId);
    const report = written.report;
    return {
      title: asset.title,
      status: asset.status,
      version: asset.currentVersion,
      createdAt: asset.createdAt,
      businessName: workspace?.name ?? "",
      market: project?.market ?? "",
      geography: project?.geography ?? "",
      objective: report.objective || project?.objective || "",
      summary: report.summary,
      findings: report.findings.map((row) => ({ statement: row.statement, basisLabel: row.basis ? BASIS_LABEL[row.basis] : "No basis", sourceIds: row.sourceRefIds })),
      opportunities: report.opportunities.map((row) => ({
        opportunity: row.opportunity,
        proposedAction: row.proposedAction,
        validationMethod: row.validationMethod,
        uncertainty: row.evidence.uncertainty,
        sourceIds: row.evidence.sourceRefIds,
      })),
      limits: report.limits.map((row) => row.text),
      sources: sources
        .sort((a, b) => a.observedAt - b.observedAt)
        .map((row) => ({
          id: row._id as string,
          platform: row.platform,
          title: row.title,
          url: row.url,
          publisher: row.publisher ?? null,
          offer: row.classification?.offer ?? null,
          callToAction: row.classification?.callToAction ?? null,
        })),
      figures: (await currentFigures(ctx, ctx.workspaceId)).map((row) => ({
        source: row.source,
        label: row.label,
        currency: row.currency ?? null,
        period: row.dateStart && row.dateStop ? `${row.dateStart} to ${row.dateStop}` : null,
        spend: row.spend ?? null,
        conversions: row.conversions ?? null,
        revenue: row.revenue ?? null,
      })),
    };
  },
});
