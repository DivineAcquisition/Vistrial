/**
 * Starting the Follow-up Engine (build step 13b-2): a person asks Dealmaker to draft the next message for every
 * deal that needs one. The deals are chosen in code from the Pipeline board; the drafts land in Comms as
 * Dealmaker's own, and nothing is sent from here. docs/rebuild/dealmaker.md, 0.8 and 4.4.
 */

import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { userError } from "./lib/errors";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { requireWork } from "./lib/roles";
import { startRunFor } from "./runs";
import { SKILL_SLUG } from "./skills/followUpEngine/shapes";

export const FOLLOW_UP_TEXT = {
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  noCrm: "Connect your CRM first. Dealmaker drafts follow-ups for the deals it can read there.",
  running: "Dealmaker is already drafting follow-ups here.",
} as const;

async function budgetCaps(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(SKILL_SLUG) });
  return capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice });
}

/** The most one round of drafting may use, in credits, shown before a person confirms. */
export const quote = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const caps = await budgetCaps(ctx);
    return { maxCredits: priceFor(caps.maxCostCentsPerRun) };
  },
});

/** Drafts the next message for each deal that needs one. Only one round runs at a time for an organization or client. */
export const draft = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), confirmedCredits: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const caps = await budgetCaps(ctx);
    if (args.confirmedCredits !== priceFor(caps.maxCostCentsPerRun)) throw userError(FOLLOW_UP_TEXT.budgetMoved);
    if (!(await crmFor(ctx, scope))) throw userError(FOLLOW_UP_TEXT.noCrm);
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", SALES_CONVERSION))
      .order("desc")
      .take(200);
    if (runs.some((run) => run.skillSlug === SKILL_SLUG && run.clientId === forClient.clientId && ["queued", "running", "waiting"].includes(run.status))) throw userError(FOLLOW_UP_TEXT.running);
    const runId = await startRunFor(ctx, {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      role: ctx.member.role,
      agentSlug: SALES_CONVERSION,
      skillSlug: SKILL_SLUG,
      inputRef: `followUps:${forClient.clientId ?? ctx.workspaceId}`,
      ...forClient,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.followUps_requested", subject: runId });
    return { runId };
  },
});
