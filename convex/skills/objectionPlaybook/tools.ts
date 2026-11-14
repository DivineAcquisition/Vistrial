/**
 * The Objection Playbook's code-only tools: read the objections heard (counted in code from the business's own
 * calls), the Offer folder, the voice and the approved lessons; check the talk tracks; save them as a draft
 * that waits for a person's review. Nothing here reaches a lead or changes the Playbook's items.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { SALES_CONVERSION } from "../../catalog";
import { heardCalls } from "../../lib/dealmaker/objectionCalls";
import { objectionPlaybook } from "../../lib/dealmaker/objections";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { playbookForSkill } from "../../lib/playbook";
import { canonicalUrl } from "../../lib/sourceRefs";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { computeTracks } from "./compute";
import { renderTracks, settledTracks, tracksOf } from "./render";
import { PHASE, readTracks, type ChecksRecord, type TrackRecord, type Tracks } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };
type Db = MutationCtx["db"] | SkillContext["db"];

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The objection run a run is for, found by the run's own project. */
export async function objectionRunOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const project = await projectOf(db, run);
  if (!project) return null;
  const row = await db
    .query("objectionRuns")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .first();
  return row && row.workspaceId === run.workspaceId ? row : null;
}

export async function trackRecordOf(db: Db, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "tracks")) as TrackRecord | null) : null;
}

async function draftAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Tracks | null> {
  return step ? readTracks(await recordOf(ctx.db, run, step._id, "model")) : null;
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

/** Observe: the objections heard, counted in code, and what a talk track may stand on. */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  const row = await objectionRunOf(ctx.db, run);
  if (!project || !row) return { failCode: "no_objection_run" };
  const scope = { workspaceId: run.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
  const { items, lessons } = await playbookForSkill(ctx, scope);
  const objections = items.filter((item) => item.kind === "objection");
  const figures = objectionPlaybook({
    items: objections.map((item) => ({ id: item._id, title: item.title, tag: item.tag ?? null, starter: item.source.type === "starter" })),
    calls: await heardCalls(ctx, scope),
    // The model never sees leads' names or reps.
    showLeads: false,
    showReps: false,
  });
  const value = computeTracks({
    playbookId: row._id,
    projectId: project._id,
    calls: figures.calls,
    rows: figures.rows,
    items: items.map((item) => ({ id: item._id, folder: item.folder, kind: item.kind, title: item.title, body: item.body })),
    lessons: lessons.map((lesson) => lesson.text),
  });
  const playbookUrl = `https://vistrial.io/app/agents/${SALES_CONVERSION}/work/playbook?folder=objections${row.clientId ? `&client=${row.clientId}` : ""}`;
  value.refs.calls = await saveSource(ctx, project, run._id, playbookUrl, { title: "Your reviewed calls and call notes", excerpt: `${figures.calls} call(s) reviewed or noted.`, limitation: "Counted in code from your call reviews and the closer's notes. A quote is the buyer's words only on the lead's own line." });
  if (value.offer.length) value.refs.offer = await saveSource(ctx, project, run._id, `https://vistrial.io/app/agents/${SALES_CONVERSION}/work/playbook?folder=offer${row.clientId ? `&client=${row.clientId}` : ""}`, { title: "Your Playbook's Offer folder", excerpt: value.offer.map((item) => item.title).join("; "), limitation: "What you filed about your offer. Vistrial does not check it against your contracts." });
  return { resultCode: value.objections.length ? "ok" : "no_objections", resultId: String(value.objections.length), artifact: record("tracks", value) };
};

const check: MutationTool = async (ctx, run, steps) => {
  const value = await trackRecordOf(ctx.db, run, steps);
  if (!value) return { failCode: "no_track_record" };
  const draft = await draftAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write));
  const result = runChecks(draft, value);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/** The claims one version makes: each count is the business's own data; each talk track an untested hypothesis. */
function trackClaims(draft: Tracks, value: TrackRecord): Claim[] {
  const calls = value.refs.calls ? [value.refs.calls] : [];
  const claims: Claim[] = value.objections.map((row) => ({ claimKey: `heard-${row.id}`, statement: `${row.title}: heard on ${row.heard} call(s) (Measured result).`, basis: "firstParty" as const, computed: true, sourceRefIds: calls }));
  settledTracks(draft, value).forEach((row, i) => claims.push({ claimKey: `track-${i + 1}`, statement: `Talk track for "${row.objection.title}": ${row.track}`, basis: "hypothesis" }));
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

/** Save: an objectionPlaybook asset (it waits for a person's review), and the talk tracks on the run's row. */
const save: MutationTool = async (ctx, run, steps) => {
  const value = await trackRecordOf(ctx.db, run, steps);
  const row = await objectionRunOf(ctx.db, run);
  if (!value || !row) return { failCode: "no_objection_run" };
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
  const base = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}), kind: "objectionPlaybook" as const, title: "Objection playbook", createdByRun: run._id, createdAt: Date.now() };

  if (!final) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body: "# Objection playbook\n\nThe talk tracks could not be written within the budget.", createdBy: "agent" });
    await ctx.db.patch(row._id, { status: "failed", assetId, finishedAt: Date.now() });
    return { resultId: assetId, resultCode: "needs_review", artifact: record("saved", { tracks: null }) };
  }

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");
  if (!passed) notes.push("These talk tracks are not shown in the Playbook until they pass. Check them first.");

  const assetId = await ctx.db.insert("assets", { ...base, status: passed ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const dropped = await writeVersion(ctx, run, assetId, 1, renderTracks(first ?? final, value, firstChecks, notes), trackClaims(first ?? final, value));
  if (second) await writeVersion(ctx, run, assetId, 2, renderTracks(second, value, finalChecks, passed ? [] : notes), trackClaims(second, value));
  await ctx.db.patch(row._id, { status: "ready", assetId, checksPassed: passed, tracks: passed ? tracksOf(final, value) : [], missing: value.missing, finishedAt: Date.now() });
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("saved", { tracks: final, checks: finalChecks, dropped }) };
};

export const OBP_MUTATION_TOOLS: Record<string, MutationTool> = { "obp.read": read, "obp.check": check, "obp.save": save };
