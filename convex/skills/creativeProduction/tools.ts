import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { contentOf as kitContent } from "../../brandKits";
import { testsForKit } from "../../creativeTests";
import { describeDecision } from "../../decisions";
import { readBusinessContext } from "../../lib/businessContext";
import { runCaps } from "../../lib/capRows";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { contentOf as offerContent } from "../../offers";
import { latest, latestDone, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { claimStands, runChecks } from "./checks";
import { renderCreative } from "./render";
import { PHASE, readCreative, type ChecksRecord, type CreativeContext, type CreativeRecord, type CreativeSet, type ReferenceView } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The request a run was started for. A run's `inputRef` holds its id. */
export async function requestOf(ctx: Pick<MutationCtx, "db">, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const id = ctx.db.normalizeId("creativeRequests", run.inputRef);
  const request = id ? await ctx.db.get(id) : null;
  return request && request.workspaceId === run.workspaceId ? request : null;
}

export async function contextOf(db: MutationCtx["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  return step ? ((await recordOf(db, run, step._id, "context")) as CreativeContext | null) : null;
}

function referenceView(row: Doc<"sourceRefs">): ReferenceView {
  return {
    sourceRefId: row._id,
    referenceId: null,
    beats: [],
    words: "",
    platform: row.platform,
    kind: row.kind,
    title: row.title,
    publisher: row.publisher ?? null,
    url: row.url,
    excerpt: row.excerpt ?? null,
    structure: {
      hook: row.classification?.hook ?? null,
      offer: row.classification?.offer ?? null,
      callToAction: row.classification?.callToAction ?? null,
      format: row.classification?.format ?? null,
      audience: row.classification?.audienceHypothesis ?? null,
    },
  };
}

/** A reference the person added, from its breakdown. Its words are kept apart so they are compared against and never shown as copy to reuse. */
function addedReferenceView(row: Doc<"creativeReferences">): ReferenceView | null {
  const breakdown = row.breakdown;
  if (row.status !== "ready" || !breakdown) return null;
  return {
    sourceRefId: null,
    referenceId: row._id,
    platform: row.platform,
    kind: row.mediaKind,
    title: breakdown.title || row.title,
    publisher: breakdown.advertiser || null,
    url: row.url ?? null,
    excerpt: null,
    structure: {
      hook: breakdown.hook.type || null,
      offer: breakdown.offer || null,
      callToAction: [breakdown.cta.words, breakdown.cta.placement && `(${breakdown.cta.placement})`].filter(Boolean).join(" ") || null,
      format: [breakdown.format, breakdown.lengthSeconds ? `${breakdown.lengthSeconds} seconds` : ""].filter(Boolean).join(", ") || null,
      audience: breakdown.audience || null,
    },
    beats: breakdown.beats.map((beat) => [beat.seconds && `${beat.seconds}s`, beat.what].filter(Boolean).join(": ")),
    words: [breakdown.hook.words, ...breakdown.onScreenText, breakdown.spoken].filter(Boolean).join(". "),
  };
}

/**
 * Observe: the request, the brand kit version it named, the reference ad or the offer it starts from, and
 * the business context. Everything a creative may say comes from here. A request whose brand, reference or
 * offer is gone stops the run: a creative is never made for a brand it cannot read.
 */
const contextRead: MutationTool = async (ctx, run) => {
  const request = await requestOf(ctx, run);
  if (!request) return { failCode: "no_creative_request" };
  const kit = await ctx.db.get(request.kitId);
  if (!kit || kit.workspaceId !== run.workspaceId || kit.archived) return { failCode: "brand_missing" };
  const kitVersion = await ctx.db
    .query("brandKitVersions")
    .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", run.workspaceId).eq("kitId", kit._id).eq("version", request.kitVersion))
    .unique();
  if (!kitVersion) return { failCode: "brand_missing" };

  let reference: ReferenceView | null = null;
  if (request.sourceRefId) {
    const source = await ctx.db.get(request.sourceRefId);
    // The business's own results are never a reference ad.
    if (!source || source.workspaceId !== run.workspaceId || source.platform === "customerData") return { failCode: "reference_missing" };
    reference = referenceView(source);
  }
  if (request.referenceId) {
    const added = await ctx.db.get(request.referenceId);
    reference = added && added.workspaceId === run.workspaceId ? addedReferenceView(added) : null;
    if (!reference) return { failCode: "reference_missing" };
  }
  let offer: CreativeContext["offer"] = null;
  if (request.offerCardId) {
    const card = await ctx.db.get(request.offerCardId);
    if (!card || card.workspaceId !== run.workspaceId) return { failCode: "offer_missing" };
    const version = await ctx.db
      .query("offerCardVersions")
      .withIndex("by_workspace_card", (q) => q.eq("workspaceId", run.workspaceId).eq("cardId", card._id).eq("version", request.offerVersion ?? card.currentVersion))
      .unique();
    if (!version) return { failCode: "offer_missing" };
    offer = { cardId: card._id, version: version.version, content: offerContent(version) };
  }
  if (!reference && !offer) return { failCode: "no_creative_request" };

  const business = await readBusinessContext(ctx, run, null);
  const profile = business.profile;
  const competitors = (profile?.competitors ?? []).map((row) => row.name.trim()).filter((name) => name.length >= 3);
  const advertiser = reference?.publisher?.trim() ?? "";
  const context: CreativeContext = {
    requestId: request._id,
    dial: request.dial,
    note: request.note ?? "",
    kit: { id: kit._id, kind: kit.kind, version: kitVersion.version, content: kitContent(kitVersion) },
    reference,
    offer,
    profile: profile ? { versionId: profile._id, offer: profile.offer, audience: profile.audience, brandVoice: profile.brandVoice, competitors } : null,
    facts: business.facts.map((row) => ({ id: row._id, factKey: row.factKey, value: row.value, status: row.status })),
    outcomes: business.decisions.filter((row) => row.outcome).map(describeDecision).slice(0, 10),
    tests: await testsForKit(ctx, run.workspaceId, kit._id),
    blockedNames: [...new Set([...competitors, ...(advertiser.length >= 3 ? [advertiser] : [])])],
  };
  return { resultCode: "ok", resultId: request._id, artifact: record("context", context) };
};

/** The creative the run last wrote: the revision if one ran, otherwise the first draft. */
async function creativeAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<CreativeSet | null> {
  return step ? readCreative(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/** Validate: the completion checks, in code. */
const check: MutationTool = async (ctx, run, steps) => {
  const context = await contextOf(ctx.db, run, steps);
  if (!context) return { failCode: "no_creative_request" };
  const caps = await runCaps(ctx, run);
  const creative = await creativeAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write));
  const result = runChecks({ creative, context, runCostCents: run.costCents, capCents: caps.maxCostCentsPerRun });
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/**
 * The claims one version of a creative makes. The structure cites the reference ad it was modelled on; each
 * variation is an untested hypothesis; each factual line in the copy cites the context record its fact or
 * offer was read from. A listed claim that does not stand is left out, and the check names it.
 */
export function creativeClaims(creative: CreativeSet | null, context: CreativeContext, contextRecordId: string | null): Claim[] {
  const kit = context.kit.content;
  const claims: Claim[] = [{ claimKey: "brand", statement: `Made for ${kit.name}, brand kit version ${context.kit.version}.`, computed: true }];
  if (!creative) return claims;
  if (context.reference) {
    const statement = `Structure modelled on "${context.reference.title}": ${[creative.structure.hookType && `hook type ${creative.structure.hookType}`, creative.structure.format && `format ${creative.structure.format}`].filter(Boolean).join(", ") || "its hook and format"}. The wording is new.`;
    // A research source is cited itself. A reference the person added is cited through the run's own record of its breakdown.
    if (context.reference.sourceRefId) claims.push({ claimKey: "structure", statement, basis: "observed", sourceRefIds: [context.reference.sourceRefId] });
    else if (contextRecordId) claims.push({ claimKey: "structure", statement, sourceId: contextRecordId, fetchedAt: Date.now() });
  }
  for (const row of creative.variations) {
    if (row.hypothesis) claims.push({ claimKey: `variation-${row.key}`, statement: `${row.key}: ${row.hypothesis}`, basis: "hypothesis" });
  }
  if (contextRecordId) {
    creative.claims.filter((claim) => claimStands(claim, context)).forEach((claim, index) => {
      claims.push({ claimKey: `claim-${index + 1}`, statement: claim.text, sourceId: contextRecordId, fetchedAt: Date.now() });
    });
  }
  return claims;
}

export async function writeVersion(ctx: MutationCtx, run: Pick<Doc<"agentRuns">, "workspaceId">, assetId: Id<"assets">, version: number, body: string, claims: Claim[], createdBy: "agent" | "person" = "agent") {
  const screened = await screenClaims(ctx, run.workspaceId, claims);
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version, body, createdBy });
  for (const claim of screened.kept) {
    const ids = (claim.sourceRefIds ?? []).map((raw) => ctx.db.normalizeId("sourceRefs", raw)).filter((id): id is Id<"sourceRefs"> => id !== null);
    await ctx.db.insert("evidence", {
      workspaceId: run.workspaceId,
      assetVersionId: versionId,
      claimKey: claim.claimKey,
      statement: claim.statement,
      ...(claim.basis ? { basis: claim.basis } : {}),
      ...(claim.sourceId ? { sourceId: claim.sourceId, fetchedAt: claim.fetchedAt } : {}),
      ...(claim.computed ? { computed: true } : {}),
      ...(ids.length ? { sourceRefIds: ids } : {}),
    });
  }
  return screened.dropped;
}

async function contextRecordId(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  if (!step) return null;
  const rows = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(300);
  return rows.find((row) => row.stepId === step._id && row.kind === "context")?._id ?? null;
}

const EMPTY_CHECKS: ChecksRecord = { passed: false, results: [] };

/**
 * Save: the creative as an ad copy set. Version 1 is the first draft with its own checks; a revision is
 * version 2 with the second checks. One that passed waits for approval; one that did not is Needs Review,
 * with the failed checks named. Nothing is published: a person approves it and takes it from there.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const context = await contextOf(ctx.db, run, steps);
  const request = await requestOf(ctx, run);
  if (!context || !request) return { failCode: "no_creative_request" };
  const first = await creativeAt(ctx, run, latestDone(steps, PHASE.write));
  const second = await creativeAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (step: Step | null) => (step ? (((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) ?? EMPTY_CHECKS) : EMPTY_CHECKS);
  const firstChecks = await checksAt(latestDone(steps, PHASE.check));
  const recheck = latestDone(steps, PHASE.recheck);
  const finalChecks = recheck ? await checksAt(recheck) : firstChecks;
  const finalCreative = second ?? first;
  const passed = finalChecks.passed && finalCreative !== null;

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!first) notes.push("The first draft could not be written within the run's budget.");
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");

  const kit = context.kit.content;
  const from = context.reference ? `from "${context.reference.title}"` : `for ${context.offer?.content.name ?? "your offer"}`;
  const assetId = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    kind: "adCopySet",
    title: `${kit.name}: ad set ${from}`.slice(0, 200),
    status: passed ? "draft" : "needsReview",
    currentVersion: second ? 2 : 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const recordId = await contextRecordId(ctx, run, steps);
  const bodyFor = (creative: CreativeSet | null, checks: ChecksRecord, versionNotes: string[]) =>
    creative ? renderCreative(creative, context, checks, versionNotes) : `# Ad set for ${kit.name}\n\n## Needs review\n\n${versionNotes.map((note) => `- ${note}`).join("\n")}\n`;
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, bodyFor(first, firstChecks, notes), creativeClaims(first, context, recordId));
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, bodyFor(second, finalChecks, []), creativeClaims(second, context, recordId)) : [];
  await ctx.db.patch(request._id, { assetId });

  const saved: CreativeRecord & { dropped: unknown } = {
    creative: finalCreative,
    checks: finalChecks,
    versions: second ? 2 : 1,
    dial: context.dial,
    kit: { id: context.kit.id, name: kit.name, kind: context.kit.kind, version: context.kit.version },
    reference: context.reference ? { sourceRefId: context.reference.sourceRefId, referenceId: context.reference.referenceId, title: context.reference.title, url: context.reference.url, platform: context.reference.platform, publisher: context.reference.publisher } : null,
    offer: context.offer ? { cardId: context.offer.cardId, name: context.offer.content.name, version: context.offer.version } : null,
    disclaimers: kit.disclaimers,
    dropped: second ? droppedSecond : droppedFirst,
  };
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("creative", saved) };
};

/** Creative Production's code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const CREATIVE_TOOLS: Record<string, MutationTool> = {
  "cp.context": contextRead,
  "cp.check": check,
  "cp.save": save,
};
