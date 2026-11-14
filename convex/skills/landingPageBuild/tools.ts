/**
 * Landing Page Build's code steps: gather everything Vistrial knows about the business (no website to read),
 * check the page against the framework, and save it. The model only writes; these decide what counts.
 */
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { latest, latestDone, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { bareTitle, focusOf, isFirstPackageRef, FIRST_PACKAGE_REF } from "../offerIntelligence/firstPackage";
import { readAnalysis } from "../offerIntelligence/shapes";
import { dropUnprovenResults, runChecks } from "./checks";
import { renderPage } from "./render";
import { PHASE, readLayout, type BuildContext, type ChecksRecord, type ContextItem, type PageLayout } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });
const MAX_FACTS = 40;
const MAX_CLAIMS = 24;

/** Facts that are about the business itself, as the person confirmed or a connected account recorded them. */
const FACT_WORDS: Record<string, string> = {
  businessName: "Business name",
  researchMarket: "What the business sells",
  researchGeography: "Where it works",
  audience: "Who it serves",
  mainGoal: "The owner's main goal",
  ownerRole: "The owner's role",
  proof: "Proof on record",
  guarantees: "Guarantees on record",
  socialLinks: "Social profiles",
  offerDetails: "The owner's words on what they sell",
};

/** The structured offer analysis the package's offer run wrote, for its "Win customers" idea. */
async function acquisitionIdea(ctx: MutationCtx, run: Doc<"agentRuns">) {
  if (!isFirstPackageRef(run.inputRef)) return null;
  const packageId = ctx.db.normalizeId("firstPackages", run.inputRef.slice(FIRST_PACKAGE_REF.length));
  const pkg = packageId ? await ctx.db.get(packageId) : null;
  if (!pkg?.offers.runId || pkg.workspaceId !== run.workspaceId) return null;
  const artifacts = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", pkg.offers.runId!))
    .take(300);
  for (const row of artifacts.reverse()) {
    if (row.kind !== "model" || !row.body) continue;
    try {
      const analysis = readAnalysis(JSON.parse(row.body));
      const change = analysis?.changes.find((item) => focusOf(item.title) === "acquisition");
      if (change) return { title: bareTitle(change.title), text: `${change.proposedChange} Why it fits: ${change.fit.text}` };
    } catch {
      // Not this one.
    }
  }
  return null;
}

/** Observe: everything on record about the business, each item with an id the page must cite. */
const context: MutationTool = async (ctx, run) => {
  const workspace = await ctx.db.get(run.workspaceId);
  const items: ContextItem[] = [];
  const gaps: string[] = [];

  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  if (profile) {
    for (const [key, label] of [["offer", "What the business sells"], ["audience", "Who it serves"], ["geography", "Where it works"], ["priceNotes", "Prices it states"], ["brandVoice", "How it speaks"]] as const) {
      if (profile[key].trim()) items.push({ id: `profile.${key}`, kind: "profile", text: `${label}: ${profile[key].trim()}` });
    }
  }

  const facts: Doc<"businessFacts">[] = [];
  for (const status of ["verified", "unverified"] as const) {
    facts.push(
      ...(await ctx.db
        .query("businessFacts")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", status))
        .order("desc")
        .take(MAX_FACTS)),
    );
  }
  for (const fact of facts.filter((row) => !row.deletedAt).slice(0, MAX_FACTS)) {
    items.push({ id: `fact.${fact._id}`, kind: "fact", text: `${FACT_WORDS[fact.factKey] ?? fact.factKey}: ${fact.value}`, ...(fact.factKey === "proof" ? { proof: true } : {}) });
  }

  const cards = await ctx.db
    .query("offerCards")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
    .order("desc")
    .take(20);
  for (const card of cards.filter((row) => !row.archived && !row.clientId)) {
    const version = await ctx.db
      .query("offerCardVersions")
      .withIndex("by_workspace_card", (q) => q.eq("workspaceId", run.workspaceId).eq("cardId", card._id).eq("version", card.currentVersion))
      .unique();
    if (version) items.push({ id: `offer.${card._id}`, kind: "offer", text: `A stated offer: ${version.name}${version.price ? `, ${version.price}` : ", no price stated"}${version.included.length ? `. Includes: ${version.included.join(", ")}` : ""}${version.guarantee ? `. Guarantee: ${version.guarantee}` : ""}` });
  }

  // The approved research: its claims, as the approved version states them.
  const reports = await ctx.db
    .query("assets")
    .withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", run.workspaceId).eq("kind", "marketReport").eq("status", "approved"))
    .order("desc")
    .take(2);
  let claims = 0;
  for (const report of reports) {
    const version = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", run.workspaceId).eq("assetId", report._id))
      .filter((q) => q.eq(q.field("version"), report.currentVersion))
      .first();
    if (!version) continue;
    const evidence = await ctx.db
      .query("evidence")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", run.workspaceId).eq("assetVersionId", version._id))
      .take(MAX_CLAIMS);
    for (const row of evidence) {
      if (!row.statement || claims >= MAX_CLAIMS) continue;
      claims += 1;
      items.push({ id: `research.${claims}`, kind: "research", text: `${row.basis === "firstParty" ? "The business's own data" : "Research finding"}: ${row.statement}` });
    }
  }
  if (claims === 0) gaps.push("No approved research is on record, so the page leans only on what the owner confirmed.");

  // The business's own ad results, from a connected Meta account, as totals.
  const meta = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
    .unique();
  if (meta?.status === "connected" && meta.adAccountId) {
    const snapshot = await ctx.db
      .query("metaAdSnapshots")
      .withIndex("by_workspace_account", (q) => q.eq("workspaceId", run.workspaceId).eq("adAccountId", meta.adAccountId!))
      .unique();
    if (snapshot && snapshot.totals.spend > 0) items.push({ id: "data.meta", kind: "data", text: `The business's own Meta ad results: ${JSON.stringify(snapshot.totals)} (${snapshot.currency})` });
  }

  const idea = await acquisitionIdea(ctx, run);
  if (idea) items.push({ id: "idea", kind: "idea", text: `The offer idea to win customers: ${idea.title}. ${idea.text}` });
  const firstOffer = items.find((item) => item.kind === "offer");
  const selling = idea ? { from: "idea", title: idea.title, text: idea.text } : firstOffer ? { from: firstOffer.id, title: firstOffer.text.replace(/^A stated offer: /, ""), text: firstOffer.text } : { from: "profile.offer", title: profile?.offer ?? "", text: profile?.offer ?? "" };
  if (!items.some((item) => item.proof)) gaps.push("No testimonials or results are on record, so the Results section is left out.");
  if (!items.some((item) => /\$|€|£|price/i.test(item.text) && (item.kind === "offer" || item.id === "profile.priceNotes"))) gaps.push("No price is on record: the offer section says the price is given on the call.");

  const value: BuildContext = { businessName: workspace?.name ?? "", selling, items, gaps };
  if (!selling.title) return { failCode: "no_offer" };
  return { resultCode: "ok", resultId: String(items.length), artifact: record("context", value) };
};

export async function contextOf(ctx: Pick<MutationCtx, "db">, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: Step[]) {
  const step = latestDone(steps, PHASE.context);
  return step ? ((await recordOf(ctx.db, run, step._id, "context")) as BuildContext | null) : null;
}

async function layoutAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null, built: BuildContext) {
  if (!step) return null;
  const read = readLayout(await recordOf(ctx.db, run, step._id, "model"));
  return read ? dropUnprovenResults(read, built) : null;
}

/** Validate: the framework's rules, in code. */
const check: MutationTool = async (ctx, run, steps) => {
  const built = await contextOf(ctx, run, steps);
  if (!built) return { failCode: "no_context" };
  const write = latestDone(steps, latest(steps, PHASE.revise) ? PHASE.revise : PHASE.write);
  const page = await layoutAt(ctx, run, write, built);
  const result = runChecks(page?.layout ?? null, built);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

export type SavedPage = { layout: PageLayout; checks: ChecksRecord; context: BuildContext; droppedResults: number };

/** Save: the page as a landingPage asset, ready for approval when its checks passed; Needs Review when not. */
const save: MutationTool = async (ctx, run, steps) => {
  const built = await contextOf(ctx, run, steps);
  if (!built) return { failCode: "no_context" };
  const second = latestDone(steps, PHASE.revise);
  const page = await layoutAt(ctx, run, second ?? latestDone(steps, PHASE.write), built);
  const checkStep = latestDone(steps, second ? PHASE.recheck : PHASE.check);
  const checks = (checkStep ? ((await recordOf(ctx.db, run, checkStep._id, "checks")) as ChecksRecord | null) : null) ?? { passed: false, results: [] };
  const passed = checks.passed && page !== null;
  const title = `Landing page: ${built.selling.title || built.businessName}`.slice(0, 200);
  const assetId: Id<"assets"> = await ctx.db.insert("assets", {
    workspaceId: run.workspaceId,
    ...(run.clientId ? { clientId: run.clientId } : {}),
    kind: "landingPage",
    title,
    status: passed ? "draft" : "needsReview",
    currentVersion: 1,
    createdByRun: run._id,
    createdAt: Date.now(),
  });
  const body = page ? renderPage(page.layout, built, checks, page.dropped) : `# ${title}\n\n## Needs review\n\nThe page could not be written within the run's budget.\n`;
  await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body, createdBy: "agent" });
  const saved: SavedPage | null = page ? { layout: page.layout, checks, context: built, droppedResults: page.dropped } : null;
  return { resultId: assetId, resultCode: passed ? "ok" : "needs_review", artifact: record("page", saved) };
};

export const LPB_MUTATION_TOOLS: Record<string, MutationTool> = {
  "lpb.context": context,
  "lpb.check": check,
  "lpb.save": save,
};
