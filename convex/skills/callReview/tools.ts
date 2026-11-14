/**
 * Conversation Intelligence's code-only tools: read one call (its transcript and the closer's notes), the deal
 * through the shared CRM layer and the Playbook; check the model's review; and save it. Saving files what the
 * buyer said as readiness facts, the promises as commitments, the recap as a draft in Comms (a person approves
 * it), and CRM updates as proposals through the act door. Nothing here sends anything or changes the CRM.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { SALES_CONVERSION } from "../../catalog";
import { fileAgentDraft } from "../../comms";
import { proposeCrmAction } from "../../lib/crm/act";
import { crmFor } from "../../lib/crm/read";
import type { ReviewView } from "../../lib/dealmaker/reviewView";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { itemsOf } from "../../lib/playbook";
import { canonicalUrl } from "../../lib/sourceRefs";
import { transcriptUrl } from "../../transcripts";
import { moneyIn } from "../dealBriefing/checks";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { computeReview, type ReviewInput } from "./compute";
import { renderReview, settled, viewOf } from "./render";
import { FIT_WORDS, NOT_ENOUGH_DATA, PHASE, readReview, type ChecksRecord, type Review, type ReviewRecord } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };
type Db = MutationCtx["db"] | SkillContext["db"];

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });
const OUTCOME_WORDS: Record<string, string> = { nextCall: "Booked another call", proposal: "Asked for a proposal", thinking: "Wants time to think", yes: "Said yes", no: "Said no", notFit: "Not a fit", noShow: "Did not show" };

/** The review a run is for, found by the run's own project. */
export async function callReviewOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const project = await projectOf(db, run);
  if (!project) return null;
  const row = await db
    .query("callReviews")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .first();
  return row && row.workspaceId === run.workspaceId ? row : null;
}

export async function reviewRecordOf(db: Db, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "review")) as ReviewRecord | null) : null;
}

async function reviewAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Review | null> {
  return step ? readReview(await recordOf(ctx.db, run, step._id, "model")) : null;
}

async function saveSource(ctx: MutationCtx, project: Doc<"researchProjects">, runId: Id<"agentRuns">, url: string, fields: { title: string; excerpt: string; observedAt: number; limitation: string }) {
  const canonical = canonicalUrl(url) ?? url;
  const values = { title: fields.title.slice(0, 200), excerpt: fields.excerpt.replace(/\s+/g, " ").trim().slice(0, 300), publisher: "Your business", observedAt: fields.observedAt, runId, limitation: fields.limitation };
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

/** Observe: the call, the closer's notes, the deal through the CRM layer, and the Playbook. */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  const review = await callReviewOf(ctx.db, run);
  if (!project || !review) return { failCode: "no_review" };
  const scope = { workspaceId: run.workspaceId, ...(review.clientId ? { clientId: review.clientId } : {}) };
  const transcript = review.transcriptId ? await ctx.db.get(review.transcriptId) : null;
  // A transcript must still be shared with Dealmaker and belong to this client.
  const usable = transcript && transcript.workspaceId === run.workspaceId && transcript.clientId === review.clientId && (transcript.agents ?? []).includes(SALES_CONVERSION) ? transcript : null;
  const note = review.callNoteId ? await ctx.db.get(review.callNoteId) : null;
  const crm = await crmFor(ctx, scope);
  const deal = crm && review.dealRef ? await crm.deal(review.dealRef) : null;
  const pipeline = deal ? (await crm!.pipelines()).find((row) => row.ref === deal.pipelineRef) : null;
  const input: ReviewInput = {
    reviewId: review._id,
    projectId: project._id,
    leadName: review.leadName,
    callDate: usable?.callDate ?? (note ? new Date(note.createdAt).toISOString().slice(0, 10) : null),
    crm: crm ? { label: crm.connection.label, accountName: crm.connection.accountName, currency: crm.connection.currency } : null,
    deal: deal && deal.contactRef === review.contactRef ? { ref: deal.ref, pipelineRef: deal.pipelineRef, stageRef: deal.stageRef, status: deal.status, value: deal.value } : null,
    stages: pipeline ? pipeline.stages.map((row) => ({ ref: row.ref, name: row.name })) : [],
    contactRef: review.contactRef ?? null,
    transcript: usable ? { title: `${usable.title}${usable.callDate ? ` (${usable.callDate})` : ""}`, text: usable.text } : null,
    notes:
      note && note.workspaceId === run.workspaceId
        ? { by: note.writtenBy, outcome: OUTCOME_WORDS[note.outcome] ?? note.outcome, nextStep: note.nextStep ?? null, fit: note.fit.map((row) => ({ field: FIT_WORDS[row.field], value: row.value })), objections: note.objections.map((row) => row.title), memo: note.memo?.transcript ?? null }
        : null,
    playbook: (await itemsOf(ctx, scope)).map((row) => ({ id: row._id, folder: row.folder, kind: row.kind, stage: row.stage ?? null, title: row.title, body: row.body, basis: row.basis })),
  };
  const value = computeReview(input);
  if (usable) value.refs.t1 = await saveSource(ctx, project, run._id, transcriptUrl(usable._id), { title: `Your call: ${usable.title}`, excerpt: usable.text, observedAt: usable.createdAt, limitation: "A transcript you provided. Vistrial cannot check it against the recording." });
  if (note) value.refs.n1 = await saveSource(ctx, project, run._id, `https://vistrial.io/app/agents/${SALES_CONVERSION}/work/calls?note=${note._id}`, { title: `Call notes from ${note.writtenBy}`, excerpt: value.sources.find((row) => row.id === "n1")?.text ?? "", observedAt: note.createdAt, limitation: `${note.writtenBy}'s own account of the call, as written. It is not the buyer's words.` });
  return { resultCode: value.sources.length ? "ok" : "no_sources", resultId: String(value.sources.length), artifact: record("review", value) };
};

const check: MutationTool = async (ctx, run, steps) => {
  const value = await reviewRecordOf(ctx.db, run, steps);
  if (!value) return { failCode: "no_review_record" };
  const draft = await reviewAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write));
  const result = runChecks(draft, value);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/** The claims one version of the review makes, before the evidence rules screen them. */
function reviewClaims(review: Review, value: ReviewRecord): Claim[] {
  const parts = settled(review, value);
  const refs = (id: string) => (value.refs[id] ? [value.refs[id]] : []);
  const all = Object.values(value.refs);
  const claims: Claim[] = [];
  const reading = (claimKey: string, statement: string): Claim => (all.length ? { claimKey, statement, basis: "inferred", sourceRefIds: all } : { claimKey, statement, basis: "hypothesis" });
  claims.push(reading("outcome", `Outcome: ${review.outcome}`));
  if (review.nextStep) claims.push(reading("next-step", `Next step: ${review.nextStep}`));
  value.talk?.forEach((row, i) => claims.push({ claimKey: `talk-${i + 1}`, statement: `${row.name} spoke ${row.words} words (${row.share}%) and asked ${row.questions} question(s) (Measured result).`, basis: "firstParty", computed: true, sourceRefIds: refs("t1") }));
  for (const row of parts.fit) {
    claims.push(row.said && "sourceId" in row ? { claimKey: `fit-${row.field}`, statement: `${row.label}: ${row.finding} (${row.kind}: "${row.quote}")`, basis: "firstParty", sourceRefIds: refs(row.sourceId as string) } : { claimKey: `fit-${row.field}`, statement: `${NOT_ENOUGH_DATA}: ${row.label.toLowerCase()} was not raised on the call.`, basis: "insufficient" });
  }
  parts.objections.forEach((row, i) => claims.push({ claimKey: `objection-${i + 1}`, statement: `Objection: ${row.text} (${row.kind}: "${row.quote}")${row.answered ? "; answered on the call" : "; not answered on the call"}.`, basis: "firstParty", sourceRefIds: refs(row.sourceId) }));
  parts.commitments.forEach((row, i) => claims.push({ claimKey: `commitment-${i + 1}`, statement: `${row.owner === "us" ? "We" : value.leadName}: ${row.what} (${row.kind}: "${row.quote}")`, basis: "firstParty", sourceRefIds: refs(row.sourceId) }));
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

/**
 * What a passing review files beyond itself: readiness facts (the buyer's words, or the closer's account),
 * commitments, the recap as a Comms draft, and CRM updates as proposals. A review that failed its checks files
 * nothing; a person reads it first.
 */
async function file(ctx: MutationCtx, run: Doc<"agentRuns">, review: Review, value: ReviewRecord, row: Doc<"callReviews">) {
  const parts = settled(review, value);
  const scope = { workspaceId: run.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
  const now = Date.now();
  const sourceRef = `callReview:${row._id}`;
  const sources = new Map(value.sources.map((item) => [item.id, item]));
  const requester = (
    await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
      .take(200)
  ).find((member) => member.userId === row.createdBy && member.active);
  if (value.deal) {
    for (const fit of parts.fit) {
      if (!fit.said || !("sourceId" in fit)) continue;
      const source = sources.get(fit.sourceId as string);
      await ctx.db.insert("dealFacts", { ...scope, dealRef: value.deal.ref, field: fit.field, value: fit.finding.slice(0, 300), kind: source?.type === "call" ? "buyer" : "rep", ...(source?.type === "notes" && source.by ? { author: source.by } : {}), sourceRef, recordedBy: "agent", recordedAt: now });
    }
    for (const item of parts.commitments) {
      const owner = item.owner === "lead" ? "lead" : requester?._id;
      if (!owner) continue;
      await ctx.db.insert("dealCommitments", { ...scope, dealRef: value.deal.ref, text: item.what.slice(0, 300), owner, ...(item.due ? { due: item.due } : {}), sourceRef, createdBy: "agent", createdAt: now });
    }
  }

  // The recap goes to Comms as a draft; a person approves it there. Anything with a price is the price kind.
  let recap: ReviewView["recap"];
  if (review.recap.body) {
    const draftId = value.contactRef
      ? await fileAgentDraft(ctx, {
          ...scope,
          contactRef: value.contactRef,
          ...(value.deal ? { dealRef: value.deal.ref } : {}),
          kind: moneyIn(`${review.recap.subject} ${review.recap.body}`).length ? "price" : "followUp",
          channel: "email",
          title: review.recap.subject,
          body: review.recap.body,
          why: `A recap of the call${value.callDate ? ` on ${value.callDate}` : ""}, from Dealmaker's call review.`,
          trigger: "callReview",
        })
      : undefined;
    recap = { subject: review.recap.subject, body: review.recap.body, ...(draftId ? { draftId } : {}) };
  }

  // CRM updates, only with a deal: the stage the call points to, and won or lost on the buyer's own words.
  const updates: ReviewView["updates"] = [];
  if (value.deal) {
    const words = { lead: value.leadName };
    const stage = value.stages.find((item) => item.ref === review.stage.stageRef);
    if (stage && stage.ref !== value.deal.stageRef) {
      const outcome = await proposeCrmAction(ctx, { ...scope, agentSlug: SALES_CONVERSION }, { kind: "move_stage", dealId: value.deal.ref, pipelineId: value.deal.pipelineRef, stageId: stage.ref, why: review.stage.why || `The call review points to ${stage.name}.` }, { ...words, stage: stage.name });
      updates.push({ words: `Move the deal to ${stage.name}`, state: outcome.ok ? "proposed" : "doItYourself", detail: outcome.ok ? "Waiting for approval." : outcome.doItYourself, label: "Inference" });
    }
    if (review.decision.status && value.deal.status === "open") {
      const outcome = await proposeCrmAction(ctx, { ...scope, agentSlug: SALES_CONVERSION }, { kind: "set_status", dealId: value.deal.ref, status: review.decision.status, why: `On the call: "${review.decision.quote}"` }, words);
      updates.push({ words: `Mark the deal ${review.decision.status}`, state: outcome.ok ? "proposed" : "doItYourself", detail: outcome.ok ? "Waiting for the Owner." : outcome.doItYourself, label: "Your data" });
    }
  }
  return { updates, recap };
}

/**
 * Save: a callReview asset with one evidence row per claim, then what the review files. It never leaves Vistrial
 * itself, so it waits for no approval (answer 12.3); what it files waits for its own.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const value = await reviewRecordOf(ctx.db, run, steps);
  const row = await callReviewOf(ctx.db, run);
  if (!value || !row) return { failCode: "no_review" };
  const first = await reviewAt(ctx, run, latestDone(steps, PHASE.write));
  const second = await reviewAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const final = second ?? first;
  const passed = finalChecks.passed && final !== null;
  const base = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}), kind: "callReview" as const, title: `Call review: ${value.leadName}${value.callDate ? `, ${value.callDate}` : ""}`.slice(0, 200), createdByRun: run._id, createdAt: Date.now() };

  if (!final) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body: `# Call review: ${value.leadName}\n\nThe review could not be written within its budget. Nothing was filed.`, createdBy: "agent" });
    await ctx.db.patch(row._id, { status: "failed", assetId, finishedAt: Date.now() });
    return { resultId: assetId, resultCode: "needs_review", artifact: record("saved", { review: null }) };
  }

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");
  if (!passed) notes.push("Nothing was filed from this review: no readiness, commitments, recap or CRM update. Check it first.");

  const filed = passed ? await file(ctx, run, final, value, row) : { updates: [], recap: undefined };
  const assetId = await ctx.db.insert("assets", { ...base, status: passed ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const dropped = await writeVersion(ctx, run, assetId, 1, renderReview(first ?? final, value, firstChecks, second ? [] : filed.updates, notes), reviewClaims(first ?? final, value));
  if (second) await writeVersion(ctx, run, assetId, 2, renderReview(second, value, finalChecks, filed.updates, passed ? [] : notes), reviewClaims(second, value));
  await ctx.db.patch(row._id, { status: "ready", assetId, view: viewOf(final, value, passed, filed.updates, filed.recap), coaching: final.coaching, finishedAt: Date.now() });
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("saved", { review: final, checks: finalChecks, dropped }) };
};

export const CR_MUTATION_TOOLS: Record<string, MutationTool> = { "cr.read": read, "cr.check": check, "cr.save": save };
