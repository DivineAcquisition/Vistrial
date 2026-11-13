import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { currentFigures, describeDecision } from "../../decisions";
import { INSUFFICIENT_PREFIX, screenClaims, type ClaimInput } from "../../lib/evidence";
import type { PageSnapshot } from "../../lib/pageReader/extract";
import { REASON_WORDS } from "../../lib/pageReader/read";
import { saveSourceRef } from "../../lib/sourceRefs";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { orderOf, pageFacts, patternTable, sanitise } from "./compute";
import { SECTION_BY_KEY } from "./framework";
import { renderTeardown } from "./render";
import { HONEST_LIMIT, PHASE, analysePhase, parseJson, readAnalysis, readIndustry, type ChecksRecord, type ContextRecord, type IndustryRead, type PagesRecord, type TeardownPage, type TeardownRecord, type UnreadPage } from "./shapes";

type Step = Doc<"runSteps">;
type Db = QueryCtx["db"] | SkillContext["db"];
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };
type RunRef = Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "inputRef">;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The request a run was started for: the one on the run's project. */
export async function requestOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const project = await projectOf(db, run);
  if (!project) return null;
  return db
    .query("teardownRequests")
    .withIndex("by_workspace_project", (q) => q.eq("workspaceId", run.workspaceId).eq("projectId", project._id))
    .first();
}

/** The pages of a request's read job, in order. Empty before the job exists. */
export async function jobPages(db: Db, request: Pick<Doc<"teardownRequests">, "workspaceId" | "jobId"> | null) {
  if (!request?.jobId) return [];
  const rows = await db
    .query("pageReads")
    .withIndex("by_workspace_job", (q) => q.eq("workspaceId", request.workspaceId).eq("jobId", request.jobId!))
    .take(20);
  return rows.sort((a, b) => a.order - b.order);
}

export function snapshotOf(page: Pick<Doc<"pageReads">, "snapshot" | "status">): PageSnapshot | null {
  if (page.status !== "read" && page.status !== "partial") return null;
  const value = parseJson(page.snapshot) as PageSnapshot | null;
  return value && Array.isArray(value.blocks) && value.blocks.length > 0 ? value : null;
}

export async function contextOf(db: Db, run: RunRef, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.context);
  return step ? ((await recordOf(db, run, step._id, "context")) as ContextRecord | null) : null;
}

export async function pagesOf(db: Db, run: RunRef, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.apply);
  return step ? ((await recordOf(db, run, step._id, "pages")) as PagesRecord | null) : null;
}

/** Observe: the request, the business's own offer and audience, and its own measured results when it has any. */
const context: MutationTool = async (ctx, run) => {
  const request = await requestOf(ctx.db, run);
  if (!request) return { failCode: "no_request" };
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  const figures = await currentFigures(ctx, run.workspaceId, run.clientId);
  const decisions = await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
    .order("desc")
    .take(40);
  const value: ContextRecord = {
    requestId: request._id,
    industry: request.industry,
    note: request.note ?? "",
    urls: request.urls,
    ownUrl: request.ownUrl ?? null,
    find: request.find,
    profile: profile ? { offer: profile.offer, audience: profile.audience } : null,
    figures: figures.map((row) => ({ label: row.label, period: row.dateStart && row.dateStop ? `${row.dateStart} to ${row.dateStop}` : "", spend: row.spend ?? null, conversions: row.conversions ?? null, revenue: row.revenue ?? null })),
    // Only changes to a page that were tried and have an outcome: what this business has itself measured.
    decisions: decisions.filter((row) => row.itemKind === "pageChange" && row.outcome).slice(0, 8).map((row) => describeDecision(row)),
  };
  return { resultCode: "ok", resultId: request._id, artifact: record("context", value) };
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Compute: every page that was read becomes a source on the project, gets its counted facts, and has the
 * model's reading of it cleaned (sections that exist, quotes that are on the page). Then the pattern table
 * is counted across the other businesses' pages.
 */
const apply: MutationTool = async (ctx, run, steps) => {
  const request = await requestOf(ctx.db, run);
  const project = await projectOf(ctx.db, run);
  if (!request || !project) return { failCode: "no_request" };
  const pages: TeardownPage[] = [];
  const unread: UnreadPage[] = [];
  const found = new Set(request.foundUrls ?? []);
  for (const row of await jobPages(ctx.db, request)) {
    const own = Boolean(request.ownUrl) && row.url === request.ownUrl;
    const snapshot = snapshotOf(row);
    if (!snapshot) {
      const reasonCode = row.reasonCode && row.reasonCode !== "ok" ? row.reasonCode : "empty";
      unread.push({ url: row.url, own, reasonCode, reason: REASON_WORDS[reasonCode] ?? "This page could not be read." });
      continue;
    }
    const step = latestDone(steps, analysePhase(row.order));
    const raw = step ? readAnalysis(await recordOf(ctx.db, run, step._id, "model")) : null;
    const cleaned = raw ? sanitise(raw, snapshot) : null;
    const finalUrl = row.finalUrl ?? row.url;
    let sourceRefId: Id<"sourceRefs"> | null = null;
    try {
      sourceRefId = (
        await saveSourceRef(ctx, {
          workspaceId: run.workspaceId,
          projectId: project._id,
          runId: run._id,
          origin: found.has(row.url) ? "found" : "supplied",
          platform: "web",
          kind: "page",
          url: finalUrl,
          title: snapshot.title || hostOf(finalUrl),
          publisher: hostOf(finalUrl),
          observedAt: row.readAt ?? Date.now(),
          availability: "linkOnly",
          excerpt: snapshot.description || undefined,
          limitation: row.driver === "browser" ? undefined : "Read from the page's HTML, without running its scripts.",
        })
      ).id;
    } catch {
      // A page with no citable address is still analysed; findings that cite it alone are dropped at save.
    }
    pages.push({
      id: `p${pages.length + 1}`,
      readId: row._id,
      sourceRefId,
      url: row.url,
      finalUrl,
      host: hostOf(finalUrl),
      title: snapshot.title,
      own,
      origin: found.has(row.url) ? "found" : "supplied",
      driver: row.driver ?? "fetch",
      status: row.status,
      facts: pageFacts(snapshot),
      analysis: cleaned?.analysis ?? null,
      ...orderOf(cleaned?.analysis ?? null),
      droppedQuotes: cleaned?.droppedQuotes ?? 0,
      droppedLines: cleaned?.droppedLines ?? 0,
    });
  }
  const value: PagesRecord = { industry: request.industry, pages, unread, table: patternTable(pages), ownId: pages.find((page) => page.own)?.id ?? null };
  return { resultCode: pages.some((page) => page.analysis) ? "ok" : "no_pages", resultId: String(pages.length), artifact: record("pages", value) };
};

async function readAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<IndustryRead | null> {
  return step ? readIndustry(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/** Validate: the completion checks, in code, on the latest draft. */
const check: MutationTool = async (ctx, run, steps) => {
  const pages = await pagesOf(ctx.db, run, steps);
  if (!pages) return { failCode: "no_pages_record" };
  const draft = await readAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.industry));
  const result = runChecks(draft, pages);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

const NOT_ENOUGH = INSUFFICIENT_PREFIX;

/** The claims one version of the teardown makes, before the evidence rules screen them. */
export function teardownClaims(read: IndustryRead | null, pages: PagesRecord): Claim[] {
  const refs = new Map(pages.pages.map((page) => [page.id, page.sourceRefId]));
  const cite = (ids: string[]) => [...new Set(ids.map((id) => refs.get(id)).filter((id): id is string => Boolean(id)))];
  const claims: Claim[] = [];
  for (const page of pages.pages) {
    if (!page.sourceRefId) continue;
    const order = page.order.map((key) => SECTION_BY_KEY[key].name).join(", ") || "none of the framework's sections";
    const skipped = page.skipped.map((key) => SECTION_BY_KEY[key].name).join(", ") || "none";
    // What code counted is observed and computed. The order of sections is a reading of the page, so it is an inference.
    claims.push({ claimKey: `${page.id}-facts`, statement: `${page.host}: ${page.facts.ctaCount} buttons leading to ${page.facts.ctaTargets} place${page.facts.ctaTargets === 1 ? "" : "s"}, ${page.facts.navLinks} links in the header, ${page.facts.words} words.`, basis: "observed", computed: true, sourceRefIds: [page.sourceRefId] });
    if (page.analysis) claims.push({ claimKey: `${page.id}-order`, statement: `${page.host} answers, in order: ${order}. It has no section for: ${skipped}.`, basis: "inferred", sourceRefIds: [page.sourceRefId] });
  }
  const others = pages.pages.filter((page) => !page.own && page.analysis);
  if (others.length < 2) claims.push({ claimKey: "patterns-insufficient", statement: `${NOT_ENOUGH}: fewer than two other pages were read, so no shared patterns are reported.` });
  if (!read) return claims.map((claim) => (claim.basis ? claim : { ...claim, basis: "insufficient" as const }));
  read.patterns.forEach((row, index) => {
    const sources = cite(row.pageIds);
    if (sources.length) claims.push({ claimKey: `pattern-${index + 1}`, statement: `${row.statement} Why it may work: ${row.whyItMayWork}`, basis: row.basis, sourceRefIds: sources });
  });
  read.gaps.forEach((row, index) => {
    const own = pages.ownId ? cite([pages.ownId]) : [];
    const sources = [...new Set([...own, ...cite(row.pageIds)])];
    if (sources.length) claims.push({ claimKey: `gap-${index + 1}`, statement: row.statement, basis: "inferred", sourceRefIds: sources });
  });
  read.suggestions.forEach((row, index) => {
    const sources = cite(row.pageIds);
    const statement = `${row.title}: ${row.change} How to tell: ${row.howToTell}`;
    claims.push(row.basis === "inferred" && sources.length ? { claimKey: `suggestion-${index + 1}`, statement, basis: "inferred", sourceRefIds: sources } : { claimKey: `suggestion-${index + 1}`, statement, basis: "hypothesis" });
  });
  return claims.map((claim) => (claim.basis ? claim : { ...claim, basis: "insufficient" as const }));
}

async function writeVersion(ctx: MutationCtx, run: Doc<"agentRuns">, assetId: Id<"assets">, version: number, body: string, claims: Claim[]) {
  const screened = await screenClaims(ctx, run.workspaceId, claims);
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version, body, createdBy: "agent" });
  for (const claim of screened.kept) {
    const ids = (claim.sourceRefIds ?? []).map((raw) => ctx.db.normalizeId("sourceRefs", raw)).filter((id): id is Id<"sourceRefs"> => id !== null);
    await ctx.db.insert("evidence", { workspaceId: run.workspaceId, assetVersionId: versionId, claimKey: claim.claimKey, statement: claim.statement, basis: claim.basis, ...(claim.computed ? { computed: true } : {}), ...(ids.length ? { sourceRefIds: ids } : {}) });
  }
  return screened.dropped;
}

/**
 * Save: the teardown as an asset with one evidence row per claim, for a person to approve. Version 1 is the
 * first draft with its checks; a revision, when one ran, is version 2. A teardown that did not pass, or read
 * no page, is Needs Review.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const request = await requestOf(ctx.db, run);
  const context = await contextOf(ctx.db, run, steps);
  const pages = (await pagesOf(ctx.db, run, steps)) ?? { industry: request?.industry ?? "", pages: [], unread: [], table: [], ownId: null };
  if (!request) return { failCode: "no_request" };
  const first = await readAt(ctx, run, latestDone(steps, PHASE.industry));
  const second = await readAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const finalRead = second ?? first;
  const passed = finalChecks.passed && finalRead !== null;

  const notes: string[] = [];
  if (pages.pages.length === 0) notes.push(`${NOT_ENOUGH}: none of the pages could be read, so there is nothing to tear down. The reasons are listed below.`);
  else if (!first) notes.push("The findings across pages could not be written within the run's budget. What was read on each page is below.");
  const revise = latest(steps, PHASE.revise);
  if (first && !firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (first && !firstChecks.passed && second) notes.push("A revision follows as version 2.");
  const unanalysed = pages.pages.filter((page) => !page.analysis).length;
  if (unanalysed) notes.push(`${unanalysed} page${unanalysed === 1 ? " was" : "s were"} read but not analysed, because the run's budget ran out.`);

  const assetId = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    kind: "pageTeardown",
    title: `Landing page teardown: ${request.industry}`.slice(0, 200),
    status: passed ? "draft" : "needsReview",
    currentVersion: second ? 2 : 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const empty: ChecksRecord = { passed: false, results: [] };
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, renderTeardown(first, pages, first ? firstChecks : empty, notes), teardownClaims(first, pages));
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, renderTeardown(second, pages, finalChecks, []), teardownClaims(second, pages)) : [];
  await ctx.scheduler.runAfter(0, internal.emailReminders.sendReportReady, { assetId });
  const value: TeardownRecord & { dropped: unknown } = {
    ...pages,
    read: finalRead,
    checks: finalChecks,
    versions: second ? 2 : 1,
    limits: [HONEST_LIMIT, ...notes, ...(finalRead?.limits ?? [])],
    measured: (context?.figures.length ?? 0) > 0,
    dropped: second ? droppedSecond : droppedFirst,
  };
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("teardown", value) };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const LP_MUTATION_TOOLS: Record<string, MutationTool> = {
  "lp.context": context,
  "lp.apply": apply,
  "lp.check": check,
  "lp.save": save,
};
