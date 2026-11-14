/**
 * Pipeline Forensics' code-only tools: read the CRM through the shared layer and compute every figure, check
 * the model's review, and save it with one evidence row per claim. Nothing here calls a CRM or changes one.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { crmFor } from "../../lib/crm/read";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { canonicalUrl } from "../../lib/sourceRefs";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { computeForensics, noCrm } from "./compute";
import { renderNotEnough, renderReview } from "./render";
import { NOT_ENOUGH_DATA, PHASE, PLAN_WORDS, STALLED_DAYS, WINDOW_DAYS, readReview, type ChecksRecord, type Figure, type ForensicsRecord, type Review } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };

const DAY = 86_400_000;
const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

export async function forensicsOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "forensics")) as ForensicsRecord | null) : null;
}

async function reviewAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Review | null> {
  return step ? readReview(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/** The CRM as one "Your data" source on the project, so every figure can cite where it came from. */
async function saveCrmSource(ctx: MutationCtx, project: Doc<"researchProjects">, runId: Id<"agentRuns">, crm: { id: string; label: string; accountName: string; lastReadAt: number | null }, counts: string) {
  const url = `https://vistrial.io/app/connections/crm?connection=${crm.id}`;
  const canonical = canonicalUrl(url) ?? url;
  const fields = {
    title: `Your CRM: ${crm.accountName} (${crm.label})`.slice(0, 200),
    excerpt: counts.slice(0, 300),
    publisher: "Your business",
    observedAt: crm.lastReadAt ?? Date.now(),
    runId,
    limitation: `Read from your ${crm.label} account. Vistrial keeps no message words, call recordings or deal names.`,
  };
  const existing = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", project.workspaceId).eq("projectId", project._id).eq("canonicalUrl", canonical))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert("sourceRefs", {
    workspaceId: project.workspaceId,
    projectId: project._id,
    origin: "supplied",
    platform: "customerData",
    kind: "dataset",
    url,
    canonicalUrl: canonical,
    availability: "available",
    ...fields,
  });
}

/** Observe and compute: the CRM connected for the run's organization or client, through the shared read view. */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  if (!project) return { failCode: "no_project" };
  const crm = await crmFor(ctx, { workspaceId: run.workspaceId, clientId: run.clientId });
  if (!crm) {
    const value = noCrm(project._id);
    return { resultCode: "no_crm", artifact: record("forensics", value) };
  }
  const now = Date.now();
  const since = now - WINDOW_DAYS * DAY;
  const [pipelines, deals, activities, appointments, contacts] = await Promise.all([crm.pipelines(), crm.deals(), crm.activities({ since }), crm.appointments({ from: since, to: now }), crm.contacts({ addedSince: since })]);
  const sourceId = await saveCrmSource(ctx, project, run._id, { id: crm.connection.id, label: crm.connection.label, accountName: crm.connection.accountName, lastReadAt: crm.connection.lastReadAt }, `${deals.length} deals, ${activities.length} activities and ${appointments.length} booked calls read from your CRM.`);
  const value = computeForensics(
    {
      crm: { label: crm.connection.label, accountName: crm.connection.accountName, currency: crm.connection.currency },
      stageHistory: crm.connection.capabilities.stageHistory,
      pipelines,
      deals,
      activities,
      appointments,
      contacts: contacts.map((row) => ({ ref: row.ref, addedAt: row.addedAt })),
      now,
      windowDays: WINDOW_DAYS,
      stalledDays: STALLED_DAYS,
      sourceId,
    },
    project._id,
  );
  return { resultCode: value.hasData ? "ok" : "no_data", resultId: String(value.figures.length), artifact: record("forensics", value) };
};

const check: MutationTool = async (ctx, run, steps) => {
  const forensics = await forensicsOf(ctx.db, run, steps);
  if (!forensics) return { failCode: "no_data_record" };
  const draft = await reviewAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.review));
  const result = runChecks(draft, forensics);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/** Each figure as a claim: Your data, marked computed when code worked it out. */
function figureClaims(figures: Figure[]): Claim[] {
  return figures.map((row) => ({
    claimKey: `figure-${row.id}`,
    statement: `${row.label}: ${row.display}${row.computed && row.formula ? ` (computed: ${row.formula})` : ""}${row.period ? `, ${row.period}` : ""}.`,
    basis: "firstParty",
    ...(row.computed ? { computed: true } : {}),
    sourceRefIds: row.sourceRefIds,
  }));
}

/** The claims one version of the review makes, before the evidence rules screen them. */
function reviewClaims(review: Review | null, forensics: ForensicsRecord): Claim[] {
  const byId = new Map(forensics.figures.map((row) => [row.id, row]));
  const cite = (ids: string[]) => ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);
  const sources = (figures: Figure[]) => [...new Set(figures.flatMap((row) => row.sourceRefIds))];
  const claims = figureClaims(forensics.figures);
  forensics.missing.filter((text) => text.startsWith(NOT_ENOUGH_DATA)).forEach((text, i) => claims.push({ claimKey: `missing-${i + 1}`, statement: text, basis: "insufficient" }));
  if (!review) return claims;
  const yours = (claimKey: string, statement: string, figures: Figure[]): Claim =>
    figures.length
      ? { claimKey, statement, basis: "firstParty", ...(figures.some((row) => row.computed) ? { computed: true } : {}), sourceRefIds: sources(figures) }
      : { claimKey, statement: statement.startsWith(NOT_ENOUGH_DATA) ? statement : `${NOT_ENOUGH_DATA}: ${statement}`, basis: "insufficient" };
  claims.push(yours("stall", forensics.stall ? `Most deals stop at ${forensics.stall.name}: ${review.stallReason}` : review.stallReason, cite(review.stallFigureIds)));
  review.findings.forEach((row, i) => claims.push(yours(`finding-${i + 1}`, row.statement, cite(row.figureIds))));
  review.steps.forEach((row, i) => {
    const figures = cite(row.figureIds);
    const statement = `${PLAN_WORDS[row.phase]}: ${row.action}. ${row.problem} Watch ${row.targetMetric}; target: ${row.target}`;
    claims.push(figures.length ? { claimKey: `step-${i + 1}`, statement, basis: "inferred", sourceRefIds: sources(figures) } : { claimKey: `step-${i + 1}`, statement: row.problem.startsWith(NOT_ENOUGH_DATA) ? row.problem : `${NOT_ENOUGH_DATA}: ${statement}`, basis: "insufficient" });
  });
  return claims;
}

async function writeVersion(ctx: MutationCtx, run: Doc<"agentRuns">, assetId: Id<"assets">, version: number, body: string, claims: Claim[]) {
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

const EMPTY_REVIEW: Review = { summary: "", stallReason: "", stallFigureIds: [], findings: [], steps: [], limits: [] };

/**
 * Save: a pipelineReview asset with one evidence row per claim. With no CRM or too few deals, one version
 * says "Not enough data" and what to do. Otherwise version 1 is the first draft with its checks, and a
 * revision, when one ran, is version 2. A review that passed waits for approval (it feeds tasks); one that
 * did not is Needs Review.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  const forensics = await forensicsOf(ctx.db, run, steps);
  if (!project || !forensics) return { failCode: "no_project" };
  const title = forensics.crm ? `Pipeline review: ${forensics.crm.accountName}` : "Pipeline review";
  const base = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}), kind: "pipelineReview" as const, title: title.slice(0, 200), createdByRun: run._id, createdAt: Date.now() };

  if (!forensics.hasData) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    const dropped = await writeVersion(ctx, run, assetId, 1, renderNotEnough(forensics), [{ claimKey: "not-enough-data", statement: forensics.missing.join(" ") || NOT_ENOUGH_DATA, basis: "insufficient" }]);
    return { resultId: assetId, resultCode: "not_enough_data", artifact: record("review", { review: null, missing: forensics.missing, dropped }) };
  }

  const first = await reviewAt(ctx, run, latestDone(steps, PHASE.review));
  const second = await reviewAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const final = second ?? first;
  const passed = finalChecks.passed && final !== null;

  const notes: string[] = [];
  if (!first) notes.push("The review could not be written within the run's budget. The figures below are still your own, computed in code.");
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");

  const assetId = await ctx.db.insert("assets", { ...base, status: passed ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, renderReview(first ?? EMPTY_REVIEW, forensics, first ? firstChecks : { passed: false, results: [] }, notes), reviewClaims(first, forensics));
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, renderReview(second, forensics, finalChecks, []), reviewClaims(second, forensics)) : [];
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("review", { review: final, checks: finalChecks, versions: second ? 2 : 1, dropped: second ? droppedSecond : droppedFirst }),
  };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const PF_MUTATION_TOOLS: Record<string, MutationTool> = {
  "pf.read": read,
  "pf.check": check,
  "pf.save": save,
};
