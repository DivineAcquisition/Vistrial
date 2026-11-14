/**
 * Dealmaker's Calendar (build step 17): the booked calls of one week from the CRM's appointments, each with
 * its status and its brief, today's calls, and show-rate figures. Worked out in code on every read and
 * filtered to the deals the person's home shows. Nothing here contacts anyone or changes the CRM.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceQuery } from "./lib/builders";
import { clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { BRIEF_LABEL, DAY, SHOW_RATE_DAYS, STATUS_LABEL, WEEKS_RANGE, briefBadge, dayKey, dayLabel, showFigures, timeLabel, weekDays, windowOf, type BriefState } from "./lib/dealmaker/calendar";
import { dealScope, type TeamRow } from "./lib/dealmaker/roles";
import { settingsOf } from "./playbookInterview";

type ReadCtx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };

async function readScope(ctx: ReadCtx, clientId: Id<"clients"> | undefined) {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** A brief's state as a person reads it: a brief still "running" whose run has ended without saving failed. */
async function briefState(ctx: Pick<QueryCtx, "db">, row: Doc<"dealBriefings"> | undefined): Promise<BriefState> {
  if (!row) return "none";
  if (row.status === "ready") return row.view && !row.view.checksPassed ? "needsReview" : "ready";
  if (row.status === "failed") return "failed";
  const run = row.runId ? await ctx.db.get(row.runId) : null;
  return run && (run.status === "failed" || run.status === "stopped" || run.status === "completed") ? "failed" : "running";
}

/** One week of booked calls, `week` weeks from this one, for the organization or a client. */
export const week = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")), week: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const crm = await crmFor(ctx, scope);
    const settings = await settingsOf(ctx, scope);
    const team = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    const home = dealScope(ctx.member.role, team);
    if (!crm) return { connected: false as const, scopeWhy: home.why };
    if (!crm.connection.capabilities.appointments) return { connected: true as const, appointments: false as const, crm: { label: crm.connection.label }, scopeWhy: home.why };

    const now = Date.now();
    const timezone = crm.connection.timezone ?? null;
    const offset = Math.max(-WEEKS_RANGE, Math.min(WEEKS_RANGE, Math.round(args.week ?? 0)));
    const days = weekDays(now, timezone, offset);
    const window = windowOf(days);
    const [inWeek, past, deals] = await Promise.all([crm.appointments(window), crm.appointments({ from: now - SHOW_RATE_DAYS * DAY, to: now }), crm.deals()]);

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

    const briefs = await ctx.db
      .query("dealBriefings")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(500);
    const briefOf = new Map<string, Doc<"dealBriefings">>();
    for (const row of briefs) if (row.appointmentRef && !briefOf.has(row.appointmentRef)) briefOf.set(row.appointmentRef, row);

    const pipelines = await crm.pipelines();
    const stageName = new Map(pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => [`${pipeline.ref}:${stage.ref}`, stage.name] as const)));
    const todayKey = dayKey(now, timezone);
    const daySet = new Set(days);
    type CalendarCall = {
      ref: string;
      day: string;
      startsAt: number;
      time: string;
      status: (typeof inWeek)[number]["status"];
      statusLabel: string;
      leadName: string;
      stage: string | null;
      brief: ReturnType<typeof briefBadge>;
      briefLabel: string;
      past: boolean;
    };
    const calls: CalendarCall[] = [];
    for (const call of inWeek) {
      const key = dayKey(call.startsAt, timezone);
      if (!daySet.has(key) || !mine(call.contactRef)) continue;
      const contact = call.contactRef ? await crm.contact(call.contactRef) : null;
      const deal = call.contactRef ? (dealOf.get(call.contactRef) ?? null) : null;
      const badge = briefBadge(await briefState(ctx, briefOf.get(call.ref)), call.startsAt, now, call.status);
      calls.push({
        ref: call.ref,
        day: key,
        startsAt: call.startsAt,
        time: timeLabel(call.startsAt, timezone),
        status: call.status,
        statusLabel: STATUS_LABEL[call.status],
        leadName: contact?.name ?? contact?.email ?? "A lead",
        stage: deal ? (stageName.get(`${deal.pipelineRef}:${deal.stageRef}`) ?? null) : null,
        brief: badge,
        briefLabel: BRIEF_LABEL[badge],
        past: call.startsAt <= now,
      });
      if (calls.length >= 200) break;
    }

    const figures = showFigures(
      past.filter((row) => mine(row.contactRef)),
      now,
    );
    const thisWeek = offset === 0 ? calls.filter((row) => !row.past && row.status !== "cancelled") : [];
    return {
      connected: true as const,
      appointments: true as const,
      crm: { label: crm.connection.label },
      scopeWhy: home.why,
      timezone: timezone ?? "UTC",
      week: offset,
      weeksRange: WEEKS_RANGE,
      today: todayKey,
      days: days.map((key) => ({ key, label: dayLabel(key), isToday: key === todayKey, calls: calls.filter((row) => row.day === key) })),
      todayCalls: calls.filter((row) => row.day === todayKey),
      figures: {
        ...figures,
        // For the week still ahead: how many booked calls the lead has confirmed, and how many briefs are due.
        upcoming: thisWeek.length,
        confirmed: thisWeek.filter((row) => row.status === "confirmed").length,
        briefsDue: thisWeek.filter((row) => row.brief === "due").length,
      },
    };
  },
});
