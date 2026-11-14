/**
 * Proposal Architect's code-only tools: read one passing call review and the Offer folder; check the proposal;
 * save it as a draft that waits for a person's review (it goes to a lead, so it is never internal work). Nothing
 * here sends anything.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { SALES_CONVERSION } from "../../catalog";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { playbookForSkill } from "../../lib/playbook";
import { canonicalUrl } from "../../lib/sourceRefs";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { computeProposal } from "./compute";
import { renderProposal, settled, viewOf } from "./render";
import { PHASE, readProposal, type ChecksRecord, type Proposal, type ProposalRecord } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };
type Db = MutationCtx["db"] | SkillContext["db"];

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The proposal a run is for, found by the run's own project. */
export async function proposalOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const project = await projectOf(db, run);
  if (!project) return null;
  const row = await db
    .query("proposals")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .first();
  return row && row.workspaceId === run.workspaceId ? row : null;
}

export async function proposalRecordOf(db: Db, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "proposal")) as ProposalRecord | null) : null;
}

async function draftAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Proposal | null> {
  return step ? readProposal(await recordOf(ctx.db, run, step._id, "model")) : null;
}

async function saveSource(ctx: MutationCtx, project: Doc<"researchProjects">, runId: Id<"agentRuns">, url: string, fields: { title: string; excerpt: string; limitation: string }) {
  const canonical = canonicalUrl(url) ?? url;
  const values = { title: fields.title.slice(0, 200), excerpt: fields.excerpt.replace(/\s+/g, " ").trim().slice(0, 300), publisher: "Your business", observedAt: Date.now(), runId, limitation: fields.limitation };
  const existing = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", project.workspaceId).eq("projectId", project._id).eq("canonicalUrl", canonical))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return ctx.db.insert("sourceRefs", { workspaceId: project.workspaceId, projectId: project._id, origin: "supplied", platform: "customerData", kind: "dataset", url, canonicalUrl: canonical, availability: "available", ...values });
}

/** Observe: the call review (it must still pass), the Offer folder, past winning proposals, the voice and the lessons. */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  const row = await proposalOf(ctx.db, run);
  if (!project || !row) return { failCode: "no_proposal" };
  const review = await ctx.db.get(row.reviewId);
  if (!review || review.workspaceId !== run.workspaceId || review.status !== "ready" || !review.view?.checksPassed) return { failCode: "no_review" };
  const scope = { workspaceId: run.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
  const { items, lessons } = await playbookForSkill(ctx, scope);
  const value = computeProposal({
    proposalId: row._id,
    projectId: project._id,
    leadName: row.leadName,
    callDate: new Date(review.createdAt).toISOString().slice(0, 10),
    review: review.view,
    items: items.map((item) => ({ id: item._id, folder: item.folder, kind: item.kind, title: item.title, body: item.body })),
    lessons: lessons.map((lesson) => lesson.text),
  });
  const base = `https://vistrial.io/app/agents/${SALES_CONVERSION}/work`;
  value.refs.review = await saveSource(ctx, project, run._id, `${base}/calls?review=${review._id}`, { title: `Call review: ${review.leadName}`, excerpt: review.view.outcome, limitation: "Dealmaker's review of the call. A quote is the buyer's words only on the lead's own line." });
  if (value.offer.length) value.refs.offer = await saveSource(ctx, project, run._id, `${base}/playbook?folder=offer${row.clientId ? `&client=${row.clientId}` : ""}`, { title: "Your Playbook's Offer folder", excerpt: value.offer.map((item) => item.title).join("; "), limitation: "What you filed about your offer and its prices. Vistrial does not check it against your contracts." });
  const ready = value.offer.some((item) => item.kind === "package") && value.offer.some((item) => item.kind === "price") && value.quotes.length > 0;
  return { resultCode: ready ? "ok" : "not_ready", artifact: record("proposal", value) };
};

const check: MutationTool = async (ctx, run, steps) => {
  const value = await proposalRecordOf(ctx.db, run, steps);
  if (!value) return { failCode: "no_proposal_record" };
  const draft = await draftAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write));
  const result = runChecks(draft, value);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/** The claims one version makes: the lead's needs rest on the review; the offer items are the business's own; the rest is a reading. */
function proposalClaims(draft: Proposal, value: ProposalRecord): Claim[] {
  const parts = settled(draft, value);
  const review = value.refs.review ? [value.refs.review] : [];
  const offer = value.refs.offer ? [value.refs.offer] : [];
  const claims: Claim[] = parts.needs.map((row, i) => ({ claimKey: `need-${i + 1}`, statement: `${row.need} (${row.kind}: "${row.quote}")`, basis: "firstParty" as const, sourceRefIds: review }));
  for (const [key, row] of [["package", parts.pkg], ["price", parts.price], ["guarantee", parts.guarantee]] as const) {
    if (row) claims.push({ claimKey: key, statement: `${row.title}${row.body ? `: ${row.body}` : ""}`, basis: "firstParty", sourceRefIds: offer });
  }
  parts.proof.forEach((row, i) => claims.push({ claimKey: `proof-${i + 1}`, statement: row.title, basis: "firstParty", sourceRefIds: offer }));
  claims.push({ claimKey: "fit", statement: `Why this package fits: ${draft.intro}`, basis: review.length ? "inferred" : "hypothesis", ...(review.length ? { sourceRefIds: review } : {}) });
  return claims.filter((claim) => claim.basis !== "firstParty" || (claim.sourceRefIds ?? []).length > 0);
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

/** Save: a proposal asset, waiting for a person's review, and its view on the proposal's row. */
const save: MutationTool = async (ctx, run, steps) => {
  const value = await proposalRecordOf(ctx.db, run, steps);
  const row = await proposalOf(ctx.db, run);
  if (!value || !row) return { failCode: "no_proposal" };
  const first = await draftAt(ctx, run, latestDone(steps, PHASE.write));
  const second = await draftAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const final = second ?? first;
  const passed = finalChecks.passed && final !== null;
  const base = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}), kind: "proposal" as const, title: `Proposal: ${value.leadName}`.slice(0, 200), createdByRun: run._id, createdAt: Date.now() };

  if (!final) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body: `# Proposal: ${value.leadName}\n\nThe proposal could not be written: ${value.offer.some((item) => item.kind === "price") ? "it did not fit its budget" : "the Offer folder needs a package and the price a proposal may use"}.`, createdBy: "agent" });
    await ctx.db.patch(row._id, { status: "failed", assetId, finishedAt: Date.now() });
    return { resultId: assetId, resultCode: "needs_review", artifact: record("saved", { proposal: null }) };
  }

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");
  const view = viewOf(final, value, passed);
  const assetId = await ctx.db.insert("assets", { ...base, status: passed && view ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const dropped = await writeVersion(ctx, run, assetId, 1, renderProposal(first ?? final, value, firstChecks, notes), proposalClaims(first ?? final, value));
  if (second) await writeVersion(ctx, run, assetId, 2, renderProposal(second, value, finalChecks, passed ? [] : notes), proposalClaims(second, value));
  await ctx.db.patch(row._id, { status: "ready", assetId, ...(view ? { view } : {}), finishedAt: Date.now() });
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("saved", { proposal: final, checks: finalChecks, dropped }) };
};

export const PA_MUTATION_TOOLS: Record<string, MutationTool> = { "pa.read": read, "pa.check": check, "pa.save": save };
