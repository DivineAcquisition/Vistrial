import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { readBusinessContext } from "../../lib/businessContext";
import { runCaps } from "../../lib/capRows";
import { INSUFFICIENT_PREFIX, screenClaims, sourceRefsInWorkspace, type ClaimInput, type ClaimProblem } from "../../lib/evidence";
import { liveFact } from "../../lib/facts";
import { describeDecision } from "../../decisions";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { CHANNEL_WORDS, channelOfPlatform, channelsInText, type Channel } from "./channels";
import { runChecks } from "./checks";
import { renderAnalysis } from "./render";
import { MAX_REPORTS, MAX_SOURCES, PHASE, readAnalysis, type ChecksRecord, type OfferAnalysis, type OfferContext, type SourceLite } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The channel a source shows an offer on: from its platform, or, for the business's own data, its origin. */
function channelOf(row: Doc<"sourceRefs">): Channel | null {
  if (row.platform !== "customerData") return channelOfPlatform(row.platform);
  // Meta results are paid social; an uploaded file's channel is not known, so it counts for any.
  return row.url.startsWith("https://adsmanager.facebook.com/") ? "paidSocial" : null;
}

function lite(row: Doc<"sourceRefs">): SourceLite {
  return {
    id: row._id,
    platform: row.platform,
    title: row.title,
    publisher: row.publisher ?? null,
    url: row.url,
    excerpt: row.excerpt ?? null,
    offerReading: row.classification?.offer ?? null,
    observed: new Date(row.observedAt).toISOString().slice(0, 10),
    channel: channelOf(row),
  };
}

/** The channels the business gets customers from: its profile, the owner's answer, and connected ad accounts. */
function businessChannels(profileChannels: string, answered: string, ownSources: SourceLite[]) {
  const found = new Map<Channel, string>();
  for (const channel of channelsInText(profileChannels)) found.set(channel, "profile");
  for (const channel of channelsInText(answered)) if (!found.has(channel)) found.set(channel, "owner");
  if (ownSources.some((row) => row.channel === "paidSocial") && !found.has("paidSocial")) found.set("paidSocial", "connected Meta ads");
  return [...found.entries()].map(([channel, from]) => ({ channel, from }));
}

export async function contextOf(db: MutationCtx["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  return step ? ((await recordOf(db, run, step._id, "context")) as OfferContext | null) : null;
}

/** The analysis the run last wrote: the revision if one ran, otherwise the first draft. */
async function analysisOf(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]): Promise<OfferAnalysis | null> {
  const step = latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write);
  return step ? readAnalysis(await recordOf(ctx.db, run, step._id, "model")) : null;
}

async function checksOf(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<ChecksRecord | null> {
  return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
}

/**
 * Observe: the approved market reports and the sources they cite, then the business context shared with
 * Market Intelligence (profile, facts, the business's own results, past outcomes). With no approved report,
 * or none that cites a competitor source, the run stops here: the analysis never invents a competitor offer.
 */
const contextRead: MutationTool = async (ctx, run) => {
  const approved = await ctx.db
    .query("assets")
    .withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", run.workspaceId).eq("kind", "marketReport").eq("status", "approved"))
    .order("desc")
    .take(MAX_REPORTS);
  if (approved.length === 0) return { failCode: "no_approved_research" };

  const reports: OfferContext["reports"] = [];
  const cited: string[] = [];
  let baseProject: Doc<"researchProjects"> | null = null;
  for (const asset of approved) {
    // The version a person approved is the asset's current one.
    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", run.workspaceId).eq("assetId", asset._id))
      .take(50);
    const version = versions.find((row) => row.version === asset.currentVersion);
    if (!version) continue;
    const evidence = await ctx.db
      .query("evidence")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", run.workspaceId).eq("assetVersionId", version._id))
      .take(100);
    for (const row of evidence) for (const id of row.sourceRefIds ?? []) if (!cited.includes(id)) cited.push(id);
    const sourceRun = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
    const project = sourceRun && sourceRun.workspaceId === run.workspaceId ? await projectOf(ctx.db, sourceRun) : null;
    baseProject ??= project;
    reports.push({
      assetId: asset._id,
      title: asset.title,
      version: asset.currentVersion,
      projectId: project?._id ?? null,
      claims: evidence.map((row) => row.statement ?? "").filter(Boolean).slice(0, 15),
    });
  }
  // Only what the approved versions cite, in this workspace, and never the business's own data.
  const researchSources = (await sourceRefsInWorkspace(ctx, run.workspaceId, cited))
    .filter((row) => row.platform !== "customerData")
    .slice(0, MAX_SOURCES)
    .map(lite);
  if (researchSources.length === 0) return { failCode: "no_research_sources" };

  const business = await readBusinessContext(ctx, run, baseProject);
  // The business's own results this run just saved or refreshed: a revoked grant leaves nothing here.
  const ownSources = baseProject
    ? (
        await ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project_platform", (q) => q.eq("workspaceId", run.workspaceId).eq("projectId", baseProject._id).eq("platform", "customerData"))
          .take(30)
      )
        .filter((row) => row.runId === run._id)
        .map(lite)
    : [];
  const offerDetails = (await liveFact(ctx, run.workspaceId, "offerDetails"))?.value ?? "";
  const answeredChannels = (await liveFact(ctx, run.workspaceId, "acquisitionChannels"))?.value ?? "";
  const profile = business.profile;
  const channels = businessChannels(profile?.channels ?? "", answeredChannels, ownSources);
  const gaps = [...(profile?.offer.trim() || offerDetails ? [] : ["offerDetails"]), ...(channels.length ? [] : ["acquisitionChannels"])];
  const assumptions = [...business.assumptions];
  if (gaps.includes("acquisitionChannels")) assumptions.push("Where customers come from is not on record, so every change is marked as a new channel to try.");
  if (gaps.includes("offerDetails")) assumptions.push("What the business sells is not on record, so the current offer reads \"Not enough data\".");
  else if (!profile?.priceNotes.trim() && !offerDetails) assumptions.push("No price is on record, so the price reads \"Not stated\".");

  const context: OfferContext = {
    reports,
    researchSources,
    ownSources,
    baseProjectId: baseProject?._id ?? null,
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
    facts: business.facts.map((row) => ({ id: row._id, factKey: row.factKey, value: row.value, status: row.status, sourceType: row.sourceType, recordedAt: row.recordedAt })),
    channels,
    decisions: business.decisions.map((row) => ({ id: row._id, text: describeDecision(row), tried: Boolean(row.outcome) })),
    offerDetails,
    gaps,
    known: business.known,
    missing: [...gaps.map((key) => ({ key, blocking: true })), ...business.missing],
    assumptions,
  };
  return { resultCode: gaps.length ? "missing_context" : "ok", resultId: String(reports.length), artifact: record("context", context) };
};

/** Validate: the completion checks, in code. */
const check: MutationTool = async (ctx, run, steps) => {
  const context = await contextOf(ctx.db, run, steps);
  if (!context) return { failCode: "no_approved_research" };
  const caps = await runCaps(ctx, run);
  const result = runChecks({ analysis: await analysisOf(ctx, run, steps), context, runCostCents: run.costCents, capCents: caps.maxCostCentsPerRun });
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

function insufficient(statement: string) {
  return statement.startsWith(INSUFFICIENT_PREFIX) ? statement : `${INSUFFICIENT_PREFIX}: ${statement}`;
}

/** A claim with a basis: sources only where the basis carries them. */
function based(claimKey: string, statement: string, basis: NonNullable<ClaimInput["basis"]>, ids: string[]): Claim {
  if (basis === "insufficient") return { claimKey, statement: insufficient(statement), basis };
  return { claimKey, statement, basis, ...(ids.length ? { sourceRefIds: ids } : {}) };
}

/**
 * The claims one version of the analysis makes, before the evidence rules screen them. The current offer
 * cites the business's own data, or the confirmed profile or the context record it was read from.
 */
function analysisClaims(analysis: OfferAnalysis | null, context: OfferContext, contextRecordId: string | null): Claim[] {
  const claims: Claim[] = [
    {
      claimKey: "count-research",
      statement: `${context.reports.length} approved market report${context.reports.length === 1 ? "" : "s"} and ${context.researchSources.length} of ${context.reports.length === 1 ? "its" : "their"} sources were read.`,
      basis: "observed",
      computed: true,
      sourceRefIds: context.researchSources.map((row) => row.id),
    },
  ];
  if (!analysis) return claims;
  const offer = analysis.currentOffer;
  const offerText = `What you sell: ${offer.product || "not stated"}. Price: ${offer.price || "not stated"}. Guarantee: ${offer.guarantee || "not stated"}. Terms: ${offer.terms || "not stated"}.`;
  const hasStated = context.profile !== null || context.offerDetails !== "" || context.facts.length > 0;
  if (offer.basis === "firstParty" && offer.sourceRefIds.length) claims.push(based("current-offer", offerText, "firstParty", offer.sourceRefIds));
  else if (offer.basis === "stated" && hasStated && (context.profile || contextRecordId)) {
    claims.push({ claimKey: "current-offer", statement: offerText, sourceId: context.profile?.versionId ?? contextRecordId!, fetchedAt: Date.now() });
  } else claims.push(based("current-offer", "What you sell, its price and its terms are not on record.", "insufficient", []));
  analysis.competitorOffers.forEach((row, i) => {
    const terms = [row.price && `price ${row.price}`, row.guarantee && `guarantee ${row.guarantee}`].filter(Boolean).join(", ");
    claims.push(based(`competitor-offer-${i + 1}`, `${row.competitor}: ${row.offer}${terms ? ` (${terms})` : ""}`, row.basis ?? "observed", row.sourceRefIds));
  });
  analysis.gapsAndRisks.forEach((row, i) => {
    claims.push(based(`${row.kind}-${i + 1}`, row.statement, row.basis ?? "hypothesis", row.sourceRefIds));
  });
  analysis.changes.forEach((row, i) => {
    const channel = row.channel ? ` (${CHANNEL_WORDS[row.channel]}${row.newChannel ? ", new channel" : ""})` : "";
    claims.push(based(`change-${i + 1}`, `${row.title}${channel}. ${row.proposedChange}`, row.evidence.basis ?? "hypothesis", row.evidence.sourceRefIds));
  });
  return claims;
}

/**
 * Before the shared evidence rules: a competitor offer may cite only the approved research, and any claim
 * only the approved research or the business's own data. A real source from elsewhere in the workspace, such
 * as an unapproved report's, is dropped like a made-up one.
 */
function allowedSources(claims: Claim[], context: OfferContext) {
  const research = new Set(context.researchSources.map((row) => row.id));
  const own = new Set(context.ownSources.map((row) => row.id));
  const kept: Claim[] = [];
  const dropped: { claimKey: string; problem: ClaimProblem }[] = [];
  for (const claim of claims) {
    const ids = claim.sourceRefIds ?? [];
    const ok = claim.claimKey.startsWith("competitor-offer-") ? ids.every((id) => research.has(id)) : ids.every((id) => research.has(id) || own.has(id));
    if (ok) kept.push(claim);
    else dropped.push({ claimKey: claim.claimKey, problem: "source_not_found" });
  }
  return { kept, dropped };
}

async function writeVersion(ctx: MutationCtx, run: Doc<"agentRuns">, assetId: Id<"assets">, version: number, body: string, claims: Claim[], context: OfferContext) {
  const allowed = allowedSources(claims, context);
  const screened = await screenClaims(ctx, run.workspaceId, allowed.kept);
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version, body, createdBy: "agent" });
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
  return [...allowed.dropped, ...screened.dropped];
}

/** The context step's record row, which a current-offer claim read from facts cites. */
async function contextRecordId(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  if (!step) return null;
  const rows = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(300);
  return rows.find((row) => row.stepId === step._id && row.kind === "context")?._id ?? null;
}

/**
 * Save: the analysis as an offerAnalysis asset. Version 1 is the first draft with its own checks; a revision
 * is version 2 with the second checks. One that passed waits for approval; one that did not is Needs Review,
 * with the failed checks named. Claims that break an evidence rule are dropped and counted.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const context = await contextOf(ctx.db, run, steps);
  if (!context) return { failCode: "no_approved_research" };
  const writeStep = latestDone(steps, PHASE.write);
  const reviseStep = latestDone(steps, PHASE.revise);
  const first = writeStep ? readAnalysis(await recordOf(ctx.db, run, writeStep._id, "model")) : null;
  const second = reviseStep ? readAnalysis(await recordOf(ctx.db, run, reviseStep._id, "model")) : null;
  const firstChecks = (await checksOf(ctx, run, latestDone(steps, PHASE.check))) ?? { passed: false, results: [] };
  const recheck = latestDone(steps, PHASE.recheck);
  const finalChecks = recheck ? ((await checksOf(ctx, run, recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const finalAnalysis = second ?? first;
  const passed = finalChecks.passed && finalAnalysis !== null;

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!first) notes.push("The first draft could not be written within the run's budget.");
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");

  const offerName = context.profile?.offer.trim() || context.offerDetails.trim() || "your offer";
  const assetId = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    kind: "offerAnalysis",
    title: `Offer analysis: ${offerName}`.slice(0, 200),
    status: passed ? "draft" : "needsReview",
    currentVersion: second ? 2 : 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const recordId = await contextRecordId(ctx, run, steps);
  const bodyFor = (analysis: OfferAnalysis | null, checks: ChecksRecord, versionNotes: string[]) =>
    analysis ? renderAnalysis(analysis, context, checks, versionNotes) : `# Offer analysis\n\n## Needs review\n\n${versionNotes.map((note) => `- ${note}`).join("\n")}\n`;
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, bodyFor(first, firstChecks, notes), analysisClaims(first, context, recordId), context);
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, bodyFor(second, finalChecks, []), analysisClaims(second, context, recordId), context) : [];
  // Tells Owners and Admins by email that it waits for them. Scheduled, so a send failure never fails the run.
  await ctx.scheduler.runAfter(0, internal.emailReminders.sendReportReady, { assetId });
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("analysis", {
      analysis: finalAnalysis,
      checks: finalChecks,
      versions: second ? 2 : 1,
      dropped: second ? droppedSecond : droppedFirst,
      contextUsed: finalAnalysis?.contextUsed ?? null,
    }),
  };
};

/** Offer Intelligence's code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const OFFER_TOOLS: Record<string, MutationTool> = {
  "oi.context": contextRead,
  "oi.check": check,
  "oi.save": save,
};
