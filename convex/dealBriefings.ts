/**
 * Pre-call briefs on request (Dealmaker, Deal Briefing; docs/rebuild/dealmaker.md, 0.8 and 4.3). A person picks
 * a lead (and, when there is one, the booked call) from the CRM, or, with no CRM connected, types who the lead
 * is (answer 12.8). They may add the setter's hand-off, kept as that person's account. The brief runs as
 * Dealmaker's work, so it starts only once Dealmaker is live and on, after the budget is confirmed.
 *
 * Automatic briefs before each booked call (a switch, off by default, with a monthly cap) come later.
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
import { BRIEF_LIMITS, SKILL_SLUG } from "./skills/dealBriefing/shapes";

const DAY = 86_400_000;

export const BRIEF_TEXT = {
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  pickLead: "Pick the lead from your CRM.",
  notRead: "Vistrial has not read that lead from your CRM. Read it again, then try.",
  notTheirs: "That deal is not this lead's.",
  noCall: "That booked call is not this lead's, or Vistrial has not read it.",
  noCrmNeedsWho: "No CRM is connected here. Say who the lead is and what you know about them.",
  tooLong: `Keep each note under ${BRIEF_LIMITS.noteChars} characters.`,
  running: "A brief for this call is already being written.",
} as const;

async function budgetCaps(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(SKILL_SLUG) });
  return capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice });
}

/** The most one brief may use, in credits, shown before a person confirms. */
export const quote = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const caps = await budgetCaps(ctx);
    return { maxCredits: priceFor(caps.maxCostCentsPerRun) };
  },
});

function note(text: string | undefined) {
  const value = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (value.length > BRIEF_LIMITS.noteChars) throw userError(BRIEF_TEXT.tooLong);
  return value || undefined;
}

/**
 * Asks Dealmaker for a brief. With a CRM: the lead must be one Vistrial read, the deal theirs, the booked call
 * theirs. Without one: a name and what the person knows. A brief already being written for the same call is
 * not started twice.
 */
export const request = workspaceMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    contactRef: v.optional(v.string()),
    dealRef: v.optional(v.string()),
    appointmentRef: v.optional(v.string()),
    /** Without a CRM: who the lead is, and what the person knows about them. */
    leadName: v.optional(v.string()),
    about: v.optional(v.string()),
    /** The setter's hand-off: what they found, in their words. */
    handoff: v.optional(v.string()),
    confirmedCredits: v.number(),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const caps = await budgetCaps(ctx);
    if (args.confirmedCredits !== priceFor(caps.maxCostCentsPerRun)) throw userError(BRIEF_TEXT.budgetMoved);
    const handoff = note(args.handoff);
    const about = note(args.about);
    const now = Date.now();

    const crm = await crmFor(ctx, scope);
    let leadName: string;
    let startsAt: number | undefined;
    if (crm) {
      if (!args.contactRef) throw userError(BRIEF_TEXT.pickLead);
      const contact = await crm.contact(args.contactRef);
      if (!contact) throw userError(BRIEF_TEXT.notRead);
      if (args.dealRef !== undefined) {
        const deal = await crm.deal(args.dealRef);
        if (!deal || deal.contactRef !== contact.ref) throw userError(BRIEF_TEXT.notTheirs);
      }
      if (args.appointmentRef !== undefined) {
        const span = BRIEF_LIMITS.appointmentDays * DAY;
        const call = (await crm.appointments({ from: now - span, to: now + span })).find((row) => row.ref === args.appointmentRef);
        if (!call || call.contactRef !== contact.ref) throw userError(BRIEF_TEXT.noCall);
        startsAt = call.startsAt;
        const open = await ctx.db
          .query("dealBriefings")
          .withIndex("by_workspace_appointment", (q) => q.eq("workspaceId", ctx.workspaceId).eq("appointmentRef", args.appointmentRef))
          .collect();
        if (open.some((row) => row.status === "running" && row.clientId === forClient.clientId)) throw userError(BRIEF_TEXT.running);
      }
      leadName = (contact.name ?? contact.email ?? "This lead").slice(0, BRIEF_LIMITS.leadName);
    } else {
      const name = (args.leadName ?? "").replace(/\s+/g, " ").trim().slice(0, BRIEF_LIMITS.leadName);
      if (!name || !about) throw userError(BRIEF_TEXT.noCrmNeedsWho);
      leadName = name;
    }

    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      title: `Pre-call brief: ${leadName}`.slice(0, 80),
      objective: "Prepare the closer for one booked sales call.",
      market: "",
      geography: "",
      competitors: [],
      platforms: ["customerData"],
      suppliedUrls: [],
      status: "draft",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    const briefingId = await ctx.db.insert("dealBriefings", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      projectId,
      ...(crm && args.contactRef ? { contactRef: args.contactRef } : {}),
      ...(crm && args.dealRef ? { dealRef: args.dealRef } : {}),
      ...(crm && args.appointmentRef ? { appointmentRef: args.appointmentRef } : {}),
      ...(startsAt !== undefined ? { startsAt } : {}),
      leadName,
      ...(about && !crm ? { about } : {}),
      ...(handoff ? { handoff } : {}),
      ...(handoff || (about && !crm) ? { writtenBy: ctx.member.displayName } : {}),
      trigger: "request",
      status: "running",
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    const runId = await startRunFor(ctx, {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      role: ctx.member.role,
      agentSlug: SALES_CONVERSION,
      skillSlug: SKILL_SLUG,
      projectId,
    });
    await ctx.db.patch(briefingId, { runId });
    // The audit row names the brief only, never the lead.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealBriefing.requested", subject: briefingId });
    return { briefingId, runId };
  },
});
