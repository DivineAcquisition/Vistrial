import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { loadCaps } from "../../lib/capRows";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { factsForRun, liveFact } from "../../lib/facts";
import { runChecks } from "./checks";
import { describeUpload, saveUploadSourcesFor } from "../../resultUploads";
import { saveFirstPartySources } from "./firstParty";
import { latest, latestDone, projectOf, projectSources, recordOf } from "./records";
import { renderReport } from "./render";
import {
  MIN_SAMPLE,
  NO_BUDGET_ASSUMPTION,
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
  const answeredMarket = await answered("researchMarket");
  const answeredArea = await answered("researchGeography");
  const market = project.market || answeredMarket || profile?.offer || "";
  const geography = project.geography || answeredArea || profile?.geography || "";
  const originOf = (fromProject: string, fromAnswer: string) => (fromProject ? "project" : fromAnswer ? "fact" : "profile") as "project" | "fact" | "profile";
  const gaps = [...(market ? [] : ["researchMarket"]), ...(geography ? [] : ["researchGeography"])];
  // The brief's "known" list is built here, with where each item came from and when. No model writes it.
  const known: ContextRecord["known"] = [];
  if (market) known.push({ key: "market", label: "Market", value: market, origin: originOf(project.market, answeredMarket), status: "verified", recordedAt: project.createdAt });
  if (geography) known.push({ key: "geography", label: "Area", value: geography, origin: originOf(project.geography, answeredArea), status: "verified", recordedAt: project.createdAt });
  if (profile) {
    const fields = [
      ["offer", "Offer", profile.offer],
      ["priceNotes", "Price notes", profile.priceNotes],
      ["audience", "Audience", profile.audience],
      ["channels", "Channels", profile.channels],
      ["brandVoice", "Brand voice", profile.brandVoice],
    ] as const;
    for (const [key, label, value] of fields) {
      if (value.trim()) known.push({ key: `profile.${key}`, label, value, origin: "profile", status: "confirmed", recordedAt: profile.confirmedAt ?? profile._creationTime });
    }
  }
  for (const fact of facts) known.push({ key: `fact:${fact._id}`, label: fact.factKey, value: fact.value, origin: "fact", status: fact.status, recordedAt: fact.recordedAt });
  // The business's own ad results, when its Meta connection is granted to this agent: saved as sources the
  // report can cite as "Your data", and listed as known.
  const firstParty = await saveFirstPartySources(ctx, run.workspaceId, project, run._id);
  if (firstParty) known.push({ key: "connection:meta", label: firstParty.label, value: firstParty.value, origin: "connection", status: "verified", recordedAt: firstParty.recordedAt });
  // Results files the business uploaded and granted to this agent: totals only, cited the same way.
  const uploads = await saveUploadSourcesFor(ctx, { workspaceId: run.workspaceId, projectId: project._id, runId: run._id, agentSlug: run.agentSlug });
  for (const { upload } of uploads) {
    known.push({ key: `upload:${upload._id}`, label: `Your results: ${upload.label}`, value: describeUpload(upload), origin: "connection", status: "verified", recordedAt: upload.createdAt });
  }
  const missing: ContextRecord["missing"] = gaps.map((key) => ({ key, blocking: true }));
  const assumptions: string[] = [];
  if (!facts.some((row) => /budget/i.test(row.factKey))) {
    missing.push({ key: "adBudget", blocking: false });
    assumptions.push(NO_BUDGET_ASSUMPTION);
  }
  if (!profile) {
    missing.push({ key: "businessProfile", blocking: false });
    assumptions.push("No confirmed business profile, so relevance is judged from the assignment alone.");
  }
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
    known,
    missing,
    assumptions,
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
  // Counts describe the market; the business's own results are not part of them.
  const sources = (await projectSources(ctx.db, run.workspaceId, project._id)).filter((row) => row.platform !== "customerData");
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


const NOT_ENOUGH = "Not enough data";

/**
 * Save: the report as a marketReport asset with one evidence row per claim. A draft that passed every check
 * waits for approval; one that did not is marked Needs Review, with the failed checks named. Claims that
 * break an evidence rule are dropped and listed, never stored as if supported.
 */
/** The claims one version of the report makes, before the evidence rules screen them. */
function reportClaims(report: Report | null, counts: (ClaimInput & { statement: string })[]) {
  const claims: (ClaimInput & { statement: string })[] = [...counts];
  if (!report) return claims;
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
  return claims;
}

/**
 * Counts as claims: how many sources were reviewed per platform, and each pattern seen in at least
 * MIN_SAMPLE of them. Computed in code, marked observed, and citing every source counted, so any number
 * in the report can be checked against its sources.
 */
function countClaims(sources: Doc<"sourceRefs">[], computed: ComputeRecord | null) {
  if (sources.length === 0) return [];
  const byPlatform = new Map<string, number>();
  for (const row of sources) byPlatform.set(row.platform, (byPlatform.get(row.platform) ?? 0) + 1);
  const parts = [...byPlatform.entries()].map(([platform, n]) => `${n} ${PLATFORM_WORDS[platform] ?? platform}`).join(", ");
  const claims: (ClaimInput & { statement: string })[] = [
    {
      claimKey: "count-sources",
      statement: `${sources.length} ${sources.length === 1 ? "source was" : "sources were"} reviewed: ${parts}.`,
      basis: "observed",
      computed: true,
      sourceRefIds: sources.map((row) => row._id),
    },
  ];
  const dimension = { offer: "offer", callToAction: "call to action", format: "format" } as const;
  (computed?.patterns ?? [])
    // Offers and calls to action only: format labels are free text and counting them says nothing.
    .filter((row) => row.enough && row.dimension !== "format" && !/not visible|title only/i.test(row.value))
    .slice(0, 6)
    .forEach((row, i) => {
      claims.push({
        claimKey: `count-pattern-${i + 1}`,
        statement: `${row.count} of ${sources.length} sources show the ${dimension[row.dimension]} "${row.value}" (the agent's reading).`,
        basis: "observed",
        computed: true,
        sourceRefIds: row.sourceRefIds,
      });
    });
  return claims;
}

const PLATFORM_WORDS: Record<string, string> = { web: "web", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", metaAdLibrary: "Meta Ad Library", customerData: "your data" };

async function writeVersion(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  assetId: Id<"assets">,
  version: number,
  body: string,
  claims: (ClaimInput & { statement: string })[],
) {
  const screened = await screenClaims(ctx, run.workspaceId, claims);
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version, body, createdBy: "agent" });
  for (const claim of screened.kept) {
    const ids = (claim.sourceRefIds ?? []).map((raw) => ctx.db.normalizeId("sourceRefs", raw)).filter((id): id is Id<"sourceRefs"> => id !== null);
    await ctx.db.insert("evidence", {
      workspaceId: run.workspaceId,
      assetVersionId: versionId,
      claimKey: claim.claimKey,
      statement: claim.statement,
      basis: claim.basis,
      ...(claim.computed ? { computed: true } : {}),
      ...(ids.length ? { sourceRefIds: ids } : {}),
    });
  }
  return screened.dropped;
}

/**
 * Save: the report as a marketReport asset. Version 1 is the first draft with its own checks. When a
 * revision ran, it is version 2 with the second checks, so the person can compare what changed. A report
 * that passed waits for approval; one that did not is Needs Review, with the failed checks named. Claims
 * that break an evidence rule are dropped and counted, never stored as if supported.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  const context = await contextOf(ctx, run, steps);
  if (!project || !context) return { failCode: "no_project" };
  const sources = await projectSources(ctx.db, run.workspaceId, project._id, 500);
  const counts = countClaims(
    sources.filter((row) => row.platform !== "customerData"),
    await computeOf(ctx, run, steps),
  );

  const writeStep = latestDone(steps, PHASE.write);
  const reviseStep = latestDone(steps, PHASE.revise);
  const first = writeStep ? readReport(await recordOf(ctx.db, run, writeStep._id, "model")) : null;
  const second = reviseStep ? readReport(await recordOf(ctx.db, run, reviseStep._id, "model")) : null;
  const checkStep = latestDone(steps, PHASE.check);
  const recheckStep = latestDone(steps, PHASE.recheck);
  const firstChecks: ChecksRecord = (checkStep ? ((await recordOf(ctx.db, run, checkStep._id, "checks")) as ChecksRecord | null) : null) ?? { passed: false, results: [] };
  const finalChecks: ChecksRecord = recheckStep ? (((await recordOf(ctx.db, run, recheckStep._id, "checks")) as ChecksRecord | null) ?? { passed: false, results: [] }) : firstChecks;
  const finalReport = second ?? first;
  const passed = finalChecks.passed && finalReport !== null;

  const firstNotes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!first) firstNotes.push("The first draft could not be written within the run's budget.");
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") firstNotes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) firstNotes.push("A revision follows as version 2.");

  const assetId = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    kind: "marketReport",
    title: `Market report: ${project.title}`.slice(0, 200),
    status: passed ? "draft" : "needsReview",
    currentVersion: second ? 2 : 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const bodyFor = (report: Report | null, checks: ChecksRecord, notes: string[]) =>
    report
      ? renderReport(report, context, checks, notes)
      : `# Market report\n\n**Objective:** ${context.objective}\n\n## Needs review\n\n${notes.map((note) => `- ${note}`).join("\n")}\n`;
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, bodyFor(first, firstChecks, firstNotes), reportClaims(first, counts));
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, bodyFor(second, finalChecks, []), reportClaims(second, counts)) : [];
  // The run's record of what it used and how it was checked, kept with the run.
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("report", {
      report: finalReport,
      checks: finalChecks,
      versions: second ? 2 : 1,
      dropped: second ? droppedSecond : droppedFirst,
      contextUsed: finalReport?.contextUsed ?? null,
    }),
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
