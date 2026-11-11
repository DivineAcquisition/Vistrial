/**
 * Gathers the business's own data for one diagnosis and saves each piece as a "Your data" source on the
 * diagnosis project, so every figure can cite where it came from. Reads this workspace's rows only; nothing
 * here calls Meta or any other outside service, and nothing in the business's accounts is changed.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { GROWTH_ARCHITECT } from "../../catalog";
import { changesBetween, currentFigures, decisionsForContext, describeDecision } from "../../decisions";
import { saveUploadSourcesFor } from "../../resultUploads";
import { canonicalUrl } from "../../lib/sourceRefs";
import { saveFirstPartySources } from "../marketIntelligence/firstParty";
import type { DecisionInput, MetaInput, MetaState } from "./compute";

/** Where a decision and its outcome can be read in the product. Used as the source link. */
export function decisionUrl(decision: Pick<Doc<"decisions">, "_id" | "projectId">) {
  return `https://vistrial.io/app/agents/${GROWTH_ARCHITECT}/sessions/${decision.projectId}?decision=${decision._id}`;
}

async function metaState(ctx: MutationCtx, workspaceId: Id<"workspaces">): Promise<MetaState> {
  const connection = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (!connection) return "none";
  if (connection.status !== "connected") return "needsReconnect";
  if (!connection.adAccountId) return "noAccount";
  if (!(connection.agents ?? [GROWTH_ARCHITECT]).includes(GROWTH_ARCHITECT)) return "notGranted";
  return "ok";
}

/**
 * The Meta results as saved by the shared first-party step, with the source ids it saved. Null when there
 * is no granted connection with spend in its last read.
 */
async function metaInput(ctx: MutationCtx, workspaceId: Id<"workspaces">, project: Doc<"researchProjects">, runId: Id<"agentRuns">): Promise<{ state: MetaState; input: MetaInput | null }> {
  const state = await metaState(ctx, workspaceId);
  if (state !== "ok") return { state, input: null };
  const summary = await saveFirstPartySources(ctx, workspaceId, project, runId);
  if (!summary) return { state: "noSpend", input: null };
  const connection = (await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique())!;
  const snapshot = (await ctx.db
    .query("metaAdSnapshots")
    .withIndex("by_workspace_account", (q) => q.eq("workspaceId", workspaceId).eq("adAccountId", connection.adAccountId!))
    .unique())!;
  // Find the sources the shared step saved on this project: the account, and a campaign by its id.
  const own = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_project_platform", (q) => q.eq("workspaceId", workspaceId).eq("projectId", project._id).eq("platform", "customerData"))
    .take(100);
  const meta = own.filter((row) => row.url.startsWith("https://adsmanager.facebook.com/"));
  const account = meta.find((row) => !row.url.includes("selected_campaign_ids="));
  if (!account) return { state: "noSpend", input: null };
  const campaignSourceIds: Record<string, string> = {};
  for (const campaign of snapshot.campaigns) {
    const row = meta.find((item) => new URL(item.url).searchParams.get("selected_campaign_ids") === campaign.id);
    if (row) campaignSourceIds[campaign.id] = row._id;
  }
  return {
    state,
    input: { snapshot, account: connection.adAccountName ?? connection.adAccountId!, accountSourceId: account._id, campaignSourceIds },
  };
}

/** Saves a decision, with what was tried and the measured change, as a "Your data" source on the project. */
async function saveDecisionSource(ctx: MutationCtx, project: Doc<"researchProjects">, runId: Id<"agentRuns">, decision: Doc<"decisions">, text: string) {
  const url = decisionUrl(decision);
  const canonical = canonicalUrl(url) ?? url;
  const fields = {
    title: `Your decision: ${decision.proposedAction}`.replace(/\s+/g, " ").slice(0, 200),
    excerpt: text.replace(/\s+/g, " ").slice(0, 300),
    publisher: "Your business",
    observedAt: decision.outcome?.recordedAt ?? decision.createdAt,
    runId,
    limitation: "What you decided and recorded in Vistrial. Figures are your own, measured before and after.",
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

/** Everything the compute step needs, read from this workspace only, with each piece saved as a source. */
export async function gatherFirstParty(ctx: MutationCtx, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "agentSlug">, project: Doc<"researchProjects">) {
  const meta = await metaInput(ctx, run.workspaceId, project, run._id);
  const uploads = (await saveUploadSourcesFor(ctx, { workspaceId: run.workspaceId, projectId: project._id, runId: run._id, agentSlug: run.agentSlug }))
    .filter((row) => row.upload.summary)
    .map((row) => ({ upload: row.upload, sourceId: row.sourceId as string }));
  const now = await currentFigures(ctx, run.workspaceId, project.clientId);
  const decisions: DecisionInput[] = [];
  for (const decision of await decisionsForContext(ctx, run.workspaceId)) {
    // A recorded outcome is measured against its own after-figures; an open one against today's.
    const changes = decision.outcome ? changesBetween(decision.baseline, decision.outcome.after) : changesBetween(decision.baseline, now);
    const text = describeDecision(decision);
    const sourceId = await saveDecisionSource(ctx, project, run._id, decision, text);
    decisions.push({ decision, sourceId, text, changes, measuredTo: decision.outcome ? "outcome" : "now" });
  }
  return { meta: meta.input, metaState: meta.state, uploads, decisions };
}
