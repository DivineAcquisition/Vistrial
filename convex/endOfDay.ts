/**
 * End-of-day reports (build step 12d). `today` is the report as each person's home shows it: every call for an
 * Owner, Admin or sales lead (with a row per rep), and a closer's own deals' calls for a closer. Once a day,
 * after 18:00 in the CRM's time zone, a cron posts the organization's or client's report to the Briefing:
 * counts only, no person's name. Counted in code; nothing here runs a model.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { dealmakerOn } from "./autoBriefs";
import { SALES_CONVERSION } from "./catalog";
import { post } from "./lib/briefing";
import { workspaceQuery } from "./lib/builders";
import { clientHere } from "./lib/clients";
import { crmFor, type CrmView } from "./lib/crm/read";
import { DAY, dayKey, dayLabel, windowOf } from "./lib/dealmaker/calendar";
import { POST_HOUR, byRep, endOfDay, localHour, type DayCall } from "./lib/dealmaker/endOfDay";
import { crmUserNames, dealScope, type DealScope, type TeamRow } from "./lib/dealmaker/roles";
import { isAdmin } from "./lib/roles";
import { settingsOf } from "./playbookInterview";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

/** A note or review counts for a call when it is about the same lead and made from an hour before it. */
const LEAD_MARGIN = 3_600_000;

async function readRows(ctx: Pick<QueryCtx, "db">, scope: Scope, since: number) {
  const byClient = <T extends "callNotes" | "callReviews" | "dealBriefings">(table: T) =>
    ctx.db
      .query(table)
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId).gte("createdAt", since))
      .take(1000);
  const [notes, reviews, briefs] = await Promise.all([byClient("callNotes"), byClient("callReviews"), byClient("dealBriefings")]);
  return { notes: notes as Doc<"callNotes">[], reviews: reviews as Doc<"callReviews">[], briefs: briefs as Doc<"dealBriefings">[] };
}

/** The day's report for one organization or client, as the home given shows it. */
async function build(ctx: Pick<QueryCtx, "db">, scope: Scope, crm: CrmView, home: DealScope, now: number) {
  const timezone = crm.connection.timezone ?? null;
  const todayKey = dayKey(now, timezone);
  const tomorrowKey = dayKey(now + DAY, timezone);
  const window = windowOf([todayKey, tomorrowKey]);
  const [appointments, deals] = await Promise.all([crm.appointments(window), crm.deals()]);

  // The deal each lead's call is about: the open one most recently changed, else the latest.
  const dealOf = new Map<string, (typeof deals)[number]>();
  for (const deal of deals) {
    if (!deal.contactRef) continue;
    const held = dealOf.get(deal.contactRef);
    const better = !held || (held.status !== "open" && deal.status === "open") || (held.status === deal.status && (deal.updatedAt ?? 0) > (held.updatedAt ?? 0));
    if (better) dealOf.set(deal.contactRef, deal);
  }
  const mine = (contactRef: string | null) => {
    if (home.kind === "all") return true;
    if (home.kind === "none" || !contactRef) return false;
    return dealOf.get(contactRef)?.ownerRef === home.crmUserRef;
  };

  const rows = await readRows(ctx, scope, window.from - DAY);
  const dayCall = (call: (typeof appointments)[number]): DayCall => {
    const lead = (row: { contactRef?: string; createdAt: number }) => !!call.contactRef && row.contactRef === call.contactRef && row.createdAt >= call.startsAt - LEAD_MARGIN;
    return {
      startsAt: call.startsAt,
      status: call.status,
      repRef: (call.contactRef && dealOf.get(call.contactRef)?.ownerRef) || null,
      noted: rows.notes.some((row) => row.appointmentRef === call.ref || lead(row)),
      reviewed: rows.reviews.some((row) => lead(row) && row.status === "ready"),
      briefed: rows.briefs.some((row) => row.appointmentRef === call.ref && row.status !== "failed"),
    };
  };
  const ofDay = (key: string) => appointments.filter((call) => dayKey(call.startsAt, timezone) === key && mine(call.contactRef));
  const today = ofDay(todayKey).map(dayCall);
  const tomorrow = ofDay(tomorrowKey).map(dayCall);

  const scoped = new Set(deals.filter((deal) => mine(deal.contactRef ?? null)).map((deal) => deal.ref));
  const leads = new Set(deals.filter((deal) => scoped.has(deal.ref) && deal.contactRef).map((deal) => deal.contactRef as string));
  const isToday = (at: number) => dayKey(at, timezone) === todayKey;

  // Messages: sent today, and still waiting for a person.
  let messagesSent = 0;
  let draftsWaiting = 0;
  for (const status of ["draft", "held", "proposed"] as const) {
    const drafts = await ctx.db
      .query("dealmakerDrafts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", scope.workspaceId).eq("status", status))
      .take(500);
    for (const row of drafts) {
      if (row.clientId !== scope.clientId || !(home.kind === "all" || leads.has(row.contactRef))) continue;
      if (status !== "proposed") {
        draftsWaiting += 1;
        continue;
      }
      const action = row.actionId ? await ctx.db.get(row.actionId) : null;
      if (action?.state === "proposed") draftsWaiting += 1;
      else if (action?.state === "done" && action.doneAt && isToday(action.doneAt)) messagesSent += 1;
    }
  }

  // Promises to leads due today or earlier, not done.
  const promises = await ctx.db
    .query("dealCommitments")
    .withIndex("by_workspace_deal", (q) => q.eq("workspaceId", scope.workspaceId))
    .take(2000);
  const commitmentsDue = promises.filter((row) => row.clientId === scope.clientId && !row.doneAt && row.due && dayKey(row.due, timezone) <= todayKey && scoped.has(row.dealRef)).length;

  const briefsMade = rows.briefs.filter((row) => isToday(row.createdAt) && row.status !== "failed" && (home.kind === "all" || (row.contactRef ? leads.has(row.contactRef) : false))).length;
  const report = endOfDay({ now, today, tomorrow, briefsMade, messagesSent, draftsWaiting, commitmentsDue });
  return { report, today, todayKey, timezone };
}

/** Today's report, as this person's home shows it; with a row per rep for an Owner or Admin. */
export const today = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope: Scope = args.clientId ? { workspaceId: ctx.workspaceId, clientId: (await clientHere(ctx, ctx.workspaceId, args.clientId))._id } : { workspaceId: ctx.workspaceId };
    ctx.clients.require(scope.clientId);
    const crm = await crmFor(ctx, scope);
    const settings = await settingsOf(ctx, scope);
    const team = settings?.team ?? [];
    const home = dealScope(ctx.member.role, team.find((item) => item.memberId === ctx.member._id) as TeamRow | undefined);
    if (!crm) return { connected: false as const, scopeWhy: home.why };
    if (!crm.connection.capabilities.appointments) return { connected: true as const, appointments: false as const, scopeWhy: home.why };
    const now = Date.now();
    const { report, today: calls, todayKey } = await build(ctx, scope, crm, home, now);
    let reps = null;
    if (isAdmin(ctx.member.role)) {
      const refs = [...new Set(calls.map((row) => row.repRef).filter((ref): ref is string => !!ref))].sort();
      const members = await Promise.all(team.map((row) => ctx.db.get(row.memberId as Id<"members">)));
      const names = crmUserNames(refs, team, (memberId) => members.find((member) => member?._id === memberId)?.displayName ?? null);
      reps = byRep(calls, now, (ref) => names.get(ref) ?? null);
    }
    return { connected: true as const, appointments: true as const, scopeWhy: home.why, day: dayLabel(todayKey), ...report, reps };
  },
});

/** Posts each day's report once, after 18:00 in the CRM's time zone. Run by a cron every hour. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const connections = await ctx.db.query("crmConnections").take(2000);
    let posted = 0;
    for (const connection of connections) {
      if (connection.status !== "connected") continue;
      const timezone = connection.timezone ?? null;
      if (localHour(now, timezone) < POST_HOUR) continue;
      const key = `dealmaker-endofday:${connection._id}:${dayKey(now, timezone)}`;
      const done = await ctx.db
        .query("briefingItems")
        .withIndex("by_workspace_key", (q) => q.eq("workspaceId", connection.workspaceId).eq("key", key))
        .first();
      if (done || !(await dealmakerOn(ctx, connection.workspaceId))) continue;
      const scope: Scope = { workspaceId: connection.workspaceId, ...(connection.clientId ? { clientId: connection.clientId } : {}) };
      const crm = await crmFor(ctx, scope);
      if (!crm?.connection.capabilities.appointments) continue;
      const { report } = await build(ctx, scope, crm, { kind: "all", why: "" }, now);
      if (!report.figures.calls && !report.tomorrow.calls) continue;
      await post(ctx, {
        ...scope,
        kind: "finished",
        agentSlug: SALES_CONVERSION,
        title: "Dealmaker · End of day",
        body: [report.headline, ...report.open].join(" "),
        key,
      });
      posted += 1;
    }
    return { posted };
  },
});
