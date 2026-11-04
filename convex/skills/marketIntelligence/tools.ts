import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { loadCaps } from "../../lib/capRows";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { factsForRun, liveFact } from "../../lib/facts";
import { runChecks } from "./checks";
import { latest, latestDone, projectOf, projectSources, recordOf } from "./records";
import { renderReport } from "./render";
import {
  MIN_SAMPLE,
  PHASE,
  parseJson,
  readReport,
  type ChecksRecord,
  type ComputeRecord,
  type ContextRecord,
  type Report,
} from "./shapes";

export type ToolOutcome = {
  resultId?: string;
  resultCode?: string;
  artifact?: { kind: string; body: string };
  /** Fails the step and the run with this code. */
  failCode?: string;
};

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

function clip(value: unknown, max = 200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined;
}

export async function contextOf(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  return step ? ((await recordOf(ctx.db, run, step._id, "context")) as ContextRecord | null) : null;
}

/** The report the run last wrote: the revision if one ran, otherwise the first draft. */
export async function reportOf(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]): Promise<Report | null> {
  const revise = latestDone(steps, PHASE.revise);
  const write = latestDone(steps, PHASE.write);
  const step = revise ?? write;
  return step ? readReport(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/**
 * Observe: the project's scope, the confirmed profile, and the business facts a run may use, with their
 * status. A declared gap (no market, no geography anywhere) is listed so the skill can ask.
 */
const contextRead: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  if (!project) return { failCode: "no_project" };
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  const facts = await factsForRun(ctx, run.workspaceId);
  const answered = async (key: string) => (await liveFact(ctx, run.workspaceId, key))?.value ?? "";
  const market = project.market || (await answered("researchMarket")) || profile?.offer || "";
  const geography = project.geography || (await answered("researchGeography")) || profile?.geography || "";
  const gaps = [...(market ? [] : ["researchMarket"]), ...(geography ? [] : ["researchGeography"])];
  const context: ContextRecord = {
    projectId: project._id,
    objective: project.objective,
    market,
    geography,
    competitors: project.competitors,
    platforms: project.platforms,
    profile: profile
      ? {
          versionId: profile._id,
          offer: profile.offer,
          priceNotes: profile.priceNotes,
          audience: profile.audience,
          geography: profile.geography,
          channels: profile.channels,
          brandVoice: profile.brandVoice,
          competitors: profile.competitors,
        }
      : null,
    facts: facts.map((row) => ({ id: row._id, factKey: row.factKey, value: row.value, status: row.status, sourceType: row.sourceType, recordedAt: row.recordedAt })),
    gaps,
  };
  return { resultCode: gaps.length ? "missing_context" : "ok", resultId: project._id, artifact: record("context", context) };
};

/** Distinguish: saves the classify step's labels on each source, marked as the model's classification. */
const applyClassification: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  if (!project) return { failCode: "no_project" };
  const step = latestDone(steps, PHASE.classify);
  if (!step) return { resultCode: "nothing_classified", resultId: "0" };
  const answer = (await recordOf(ctx.db, run, step._id, "model")) as { items?: Record<string, unknown>[] } | null;
  const now = Date.now();
  let applied = 0;
  for (const item of answer?.items ?? []) {
    const id = ctx.db.normalizeId("sourceRefs", typeof item.sourceRefId === "string" ? item.sourceRefId : "");
    const row = id ? await ctx.db.get(id) : null;
    // Only this project's sources. An id the model made up, or one from elsewhere, is skipped.
    if (!row || row.workspaceId !== run.workspaceId || row.projectId !== project._id) continue;
    const relevance = item.relevance === "high" || item.relevance === "medium" || item.relevance === "low" ? item.relevance : undefined;
    await ctx.db.patch(row._id, {
      classification: {
        hook: clip(item.hook),
        offer: clip(item.offer),
        callToAction: clip(item.callToAction),
        format: clip(item.format, 80),
        audienceHypothesis: clip(item.audienceHypothesis),
        relevance,
        classifiedBy: "model",
        classifiedAt: now,
      },
    });
    applied++;
  }
  return { resultId: String(applied) };
};

function norm(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9%$]+/g, " ").trim();
}

/**
 * Counts, groupings, dates and the minimum-sample check, all in code. A pattern seen in fewer than
 * MIN_SAMPLE sources is marked not enough, so the report says "Not enough data" instead of a trend.
 */
const compute: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  if (!project) return { failCode: "no_project" };
  const sources = await projectSources(ctx.db, run.workspaceId, project._id);
  const byPlatform: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const groups = new Map<string, { dimension: "offer" | "callToAction" | "format"; value: string; ids: string[] }>();
  let earliest: number | null = null;
  let latestDate: number | null = null;
  for (const row of sources) {
    byPlatform[row.platform] = (byPlatform[row.platform] ?? 0) + 1;
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    if (row.publishedAt) {
      earliest = earliest === null ? row.publishedAt : Math.min(earliest, row.publishedAt);
      latestDate = latestDate === null ? row.publishedAt : Math.max(latestDate, row.publishedAt);
    }
    for (const dimension of ["offer", "callToAction", "format"] as const) {
      const value = row.classification?.[dimension];
      const key = norm(value);
      if (!key) continue;
      const group = groups.get(`${dimension}:${key}`) ?? { dimension, value: value!, ids: [] };
      group.ids.push(row._id);
      groups.set(`${dimension}:${key}`, group);
    }
  }
  const statuses = await ctx.db
    .query("sourceStatus")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(20);
  const artifacts = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(300);
  const limitations = new Map<string, string>();
  for (const row of artifacts) {
    if (row.kind !== "tool") continue;
    const result = parseJson(row.body) as { platform?: string; limitation?: string } | null;
    if (result?.platform && result.limitation) limitations.set(result.platform, result.limitation);
  }
  const value: ComputeRecord = {
    totals: { sources: sources.length, byPlatform, byKind },
    patterns: [...groups.values()]
      .map((group) => ({ dimension: group.dimension, value: group.value, count: group.ids.length, sourceRefIds: group.ids, enough: group.ids.length >= MIN_SAMPLE }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    dates: { earliest, latest: latestDate },
    limits: statuses.map((row) => ({ platform: row.platform, state: row.state, reasonCode: row.reasonCode, limitation: limitations.get(row.platform) ?? null })),
  };
  return { resultId: String(sources.length), artifact: record("compute", value) };
};

async function computeOf(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) {
  const step = latestDone(steps, PHASE.compute);
  return step ? ((await recordOf(ctx.db, run, step._id, "compute")) as ComputeRecord | null) : null;
}

async function prioritizedCount(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) {
  const step = latestDone(steps, PHASE.prioritize);
  const answer = step ? ((await recordOf(ctx.db, run, step._id, "model")) as { opportunities?: unknown[] } | null) : null;
  return Array.isArray(answer?.opportunities) ? Math.min(answer.opportunities.length, 3) : 0;
}

/** Validate: the eight completion checks, in code. */
const check: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  const context = await contextOf(ctx, run, steps);
  if (!project || !context) return { failCode: "no_project" };
  const sources = await projectSources(ctx.db, run.workspaceId, project._id, 500);
  const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug, run.skillSlug);
  const result = runChecks({
    report: await reportOf(ctx, run, steps),
    context,
    compute: await computeOf(ctx, run, steps),
    prioritizedCount: await prioritizedCount(ctx, run, steps),
    knownSourceIds: new Set(sources.map((row) => row._id as string)),
    runCostCents: run.costCents,
    capCents: caps.maxCostCentsPerRun,
  });
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

async function checksOf(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]): Promise<ChecksRecord | null> {
  const recheck = latestDone(steps, PHASE.recheck);
  const first = latestDone(steps, PHASE.check);
  const step = recheck ?? first;
  return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
}

const NOT_ENOUGH = "Not enough data";

/**
 * Save: the report as a marketReport asset with one evidence row per claim. A draft that passed every check
 * waits for approval; one that did not is marked Needs Review, with the failed checks named. Claims that
 * break an evidence rule are dropped and listed, never stored as if supported.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  const context = await contextOf(ctx, run, steps);
  if (!project || !context) return { failCode: "no_project" };
  const report = await reportOf(ctx, run, steps);
  const checks: ChecksRecord = (await checksOf(ctx, run, steps)) ?? { passed: false, results: [] };
  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!report) notes.push("The report could not be written within the run's budget.");
  const passed = checks.passed && report !== null;

  const claims: (ClaimInput & { statement: string })[] = [];
  if (report) {
    report.findings.forEach((row, i) => {
      if (!row.basis) return;
      const statement = row.basis === "insufficient" && !row.statement.startsWith(NOT_ENOUGH) ? `${NOT_ENOUGH}: ${row.statement}` : row.statement;
      claims.push({ claimKey: `finding-${i + 1}`, statement, basis: row.basis, ...(row.basis === "insufficient" ? {} : { sourceRefIds: row.sourceRefIds }) });
    });
    report.opportunities.forEach((row, i) => {
      const supported = row.evidence.uncertainty === "none" && row.evidence.sourceRefIds.length > 0;
      const basis = supported ? "inferred" : row.evidence.uncertainty === "insufficient" ? "insufficient" : "hypothesis";
      const statement = `${row.opportunity}. ${row.proposedAction}`;
      claims.push({
        claimKey: `opportunity-${i + 1}`,
        statement: basis === "insufficient" && !statement.startsWith(NOT_ENOUGH) ? `${NOT_ENOUGH}: ${statement}` : statement,
        basis,
        ...(supported ? { sourceRefIds: row.evidence.sourceRefIds } : {}),
      });
    });
  }
  const screened = await screenClaims(ctx, run.workspaceId, claims);
  if (screened.dropped.length > 0) notes.push(`${screened.dropped.length} claim(s) were left out because they broke an evidence rule.`);

  const body = report
    ? renderReport(report, context, checks, notes)
    : `# Market report\n\n**Objective:** ${context.objective}\n\n## Needs review\n\n${notes.map((note) => `- ${note}`).join("\n")}\n`;
  const assetId = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    kind: "marketReport",
    title: `Market report: ${project.title}`.slice(0, 200),
    status: passed ? "draft" : "needsReview",
    currentVersion: 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body, createdBy: "agent" });
  for (const claim of screened.kept) {
    const ids = (claim.sourceRefIds ?? []).map((raw) => ctx.db.normalizeId("sourceRefs", raw)).filter((id): id is Id<"sourceRefs"> => id !== null);
    await ctx.db.insert("evidence", {
      workspaceId: run.workspaceId,
      assetVersionId: versionId,
      claimKey: claim.claimKey,
      statement: claim.statement,
      basis: claim.basis,
      ...(ids.length ? { sourceRefIds: ids } : {}),
    });
  }
  // The run's record of what it used and how it was checked, kept with the run.
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("report", { report, checks, notes, dropped: screened.dropped, contextUsed: report?.contextUsed ?? null }),
  };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const MUTATION_TOOLS: Record<string, MutationTool> = {
  "context.read": contextRead,
  "mi.applyClassification": applyClassification,
  "mi.compute": compute,
  "mi.check": check,
  "mi.save": save,
};
