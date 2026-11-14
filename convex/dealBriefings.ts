/**
 * Pre-call briefs on request (Dealmaker, Deal Briefing; docs/rebuild/dealmaker.md, 0.8 and 4.3). A person picks
 * a lead (and, when there is one, the booked call) from the CRM, or, with no CRM connected, types who the lead
 * is (answer 12.8). They may add the setter's hand-off, kept as that person's account. The brief runs as
 * Dealmaker's work, so it starts only once Dealmaker is live and on, after the budget is confirmed.
 *
 * Automatic briefs before each booked call (a switch, off by default, with a monthly cap) come later.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { dealScope, type TeamRow } from "./lib/dealmaker/roles";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { requireWork } from "./lib/roles";
import { parsePublicUrl } from "./lib/sourceRefs";
import { settingsOf } from "./playbookInterview";
import { startRunFor } from "./runs";
import { when } from "./skills/dealBriefing/compute";
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
  badSite: "That website is not a public link. Paste the address, starting with https://.",
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
    /** The lead's business website, read in public for the brief. Without one, a work email's domain is used. */
    website: v.optional(v.string()),
    confirmedCredits: v.number(),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const caps = await budgetCaps(ctx);
    if (args.confirmedCredits !== priceFor(caps.maxCostCentsPerRun)) throw userError(BRIEF_TEXT.budgetMoved);
    const handoff = note(args.handoff);
    const website = args.website?.trim() ? parsePublicUrl(args.website.trim()) : null;
    if (args.website?.trim() && !website) throw userError(BRIEF_TEXT.badSite);
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
      ...(website ? { website: website.toString() } : {}),
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

/* ---------------------------------------------------------------------------
 * The Calls tab, before the call (build step 10b)
 * ------------------------------------------------------------------------- */

type ReadCtx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope; member: Doc<"members">; role: string };

/** How far ahead the Calls tab lists booked calls, and how many briefs it lists. */
export const CALLS_AHEAD_DAYS = 7;
/** Calls of the last two days stay listed, so the closer can add their notes after the call. */
export const CALLS_BACK_DAYS = 2;
const RECENT_BRIEFS = 20;

async function readScope(ctx: ReadCtx, clientId: Id<"clients"> | undefined) {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

export type BriefState = "none" | "running" | "ready" | "needsReview" | "failed";

/** A brief's state as a person reads it: a row still "running" whose run has ended without saving failed. */
async function stateOf(ctx: Pick<QueryCtx, "db">, row: Doc<"dealBriefings">): Promise<BriefState> {
  if (row.status === "ready") return row.view && !row.view.checksPassed ? "needsReview" : "ready";
  if (row.status === "failed") return "failed";
  const run = row.runId ? await ctx.db.get(row.runId) : null;
  return run && (run.status === "failed" || run.status === "stopped" || run.status === "completed") ? "failed" : "running";
}

function briefRow(row: Doc<"dealBriefings">, state: BriefState, timezone: string | null) {
  return { id: row._id, leadName: row.leadName, when: row.startsAt ? when(row.startsAt, timezone) : null, state, createdAt: row.createdAt };
}

/**
 * The booked calls of the next week with each one's brief, filtered to the deals the person's home shows
 * (an Owner, an Admin or a sales lead sees every call; a setter or closer sees calls with their own deals),
 * and the briefs made lately. Without a CRM it lists the briefs only, and says how to brief a lead by name.
 */
export const calls = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const briefRows = (
      await ctx.db
        .query("dealBriefings")
        .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
        .order("desc")
        .take(RECENT_BRIEFS * 5)
    ).slice(0, RECENT_BRIEFS * 5);
    const crm = await crmFor(ctx, scope);
    const timezone = crm?.connection.timezone ?? null;
    const caps = await budgetCaps(ctx);
    const base = { canRequest: ctx.role !== "viewer", maxCredits: priceFor(caps.maxCostCentsPerRun) };

    // The latest brief per booked call; the rest are listed as recent briefs.
    const byCall = new Map<string, Doc<"dealBriefings">>();
    for (const row of briefRows) if (row.appointmentRef && !byCall.has(row.appointmentRef)) byCall.set(row.appointmentRef, row);

    const settings = await settingsOf(ctx, scope);
    const team = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    const home = dealScope(ctx.member.role, team);
    const visible = (row: Doc<"dealBriefings">) => home.kind === "all" || row.createdBy === ctx.identity.subject;
    const recent = await Promise.all(briefRows.filter(visible).slice(0, RECENT_BRIEFS).map(async (row) => briefRow(row, await stateOf(ctx, row), timezone)));

    if (!crm) return { ...base, connected: false as const, scopeWhy: home.why, upcoming: [], recent };

    const now = Date.now();
    const [appointments, deals, pipelines] = await Promise.all([crm.appointments({ from: now - CALLS_BACK_DAYS * 86_400_000, to: now + CALLS_AHEAD_DAYS * 86_400_000 }), crm.deals({ open: true }), crm.pipelines()]);
    const stageName = new Map(pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => [`${pipeline.ref}:${stage.ref}`, stage.name] as const)));
    const dealOf = new Map<string, (typeof deals)[number]>();
    for (const deal of deals) if (deal.contactRef && (!dealOf.has(deal.contactRef) || (deal.updatedAt ?? 0) > (dealOf.get(deal.contactRef)!.updatedAt ?? 0))) dealOf.set(deal.contactRef, deal);
    const mine = (contactRef: string | null) => {
      if (home.kind === "all") return true;
      if (home.kind === "none" || !contactRef) return false;
      return dealOf.get(contactRef)?.ownerRef === home.crmUserRef;
    };
    const noted = new Set(
      (
        await ctx.db
          .query("callNotes")
          .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
          .order("desc")
          .take(200)
      ).flatMap((row) => (row.appointmentRef ? [row.appointmentRef] : [])),
    );
    const upcoming = [];
    for (const call of appointments) {
      if (call.status === "cancelled" || !call.contactRef || !mine(call.contactRef)) continue;
      const contact = await crm.contact(call.contactRef);
      if (!contact) continue;
      const deal = dealOf.get(call.contactRef) ?? null;
      const brief = byCall.get(call.ref) ?? null;
      upcoming.push({
        ref: call.ref,
        startsAt: call.startsAt,
        when: when(call.startsAt, timezone),
        status: call.status,
        contactRef: contact.ref,
        dealRef: deal?.ref ?? null,
        leadName: contact.name ?? contact.email ?? "A lead",
        source: contact.source,
        stage: deal ? (stageName.get(`${deal.pipelineRef}:${deal.stageRef}`) ?? null) : null,
        brief: brief ? briefRow(brief, await stateOf(ctx, brief), timezone) : null,
        /** The call has started: the closer may add their notes. */
        past: call.startsAt <= now,
        noted: noted.has(call.ref),
      });
      if (upcoming.length >= 50) break;
    }
    return { ...base, connected: true as const, crm: { label: crm.connection.label, accountName: crm.connection.accountName }, scopeWhy: home.why, upcoming, recent };
  },
});

/** One brief as the Calls tab draws it. A person who may see the brief's client may read it. */
export const brief = workspaceQuery({
  args: { briefingId: v.id("dealBriefings") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.briefingId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    const crm = await crmFor(ctx, { workspaceId: ctx.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) });
    return { ...briefRow(row, await stateOf(ctx, row), crm?.connection.timezone ?? null), view: row.view ?? null, assetId: row.assetId ?? null };
  },
});
