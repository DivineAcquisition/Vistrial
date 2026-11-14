/**
 * A link to each pre-call brief on the booked call's Google Calendar event (Dealmaker; docs/rebuild/dealmaker.md,
 * 0.8 "Delivered" and 0.10 item 5): off by default, and only an Owner turns it on. Turning it on needs Google
 * Calendar connected with the extra permission to change events the connected person owns; without Google set up
 * on this deployment it says "Not set up yet".
 *
 * When a brief is saved for a booked call, `addLink` finds the event that starts at the call's time (with the
 * lead as a guest, when their email is known) and adds one line linking the brief to its description. It reads
 * that description once, in passing, to add the line, and keeps nothing from the event. It never creates,
 * moves or cancels an event, and never emails a guest.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { liveToken } from "./integrationActions";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { CALENDAR_LINK_SCOPE, PROVIDERS, readiness } from "./lib/integrations/providers";
import { DEFAULT_APP_URL } from "./lib/reminderEmail";
import { settingsOf } from "./playbookInterview";

export const LINK_ACTION = "dealmaker.brief_link";

export type LinkState = "notSetUp" | "noCalendar" | "needsPermission" | "off" | "on";

export const LINK_WORDS: Record<LinkState, string> = {
  notSetUp: "Not set up yet: Google sign-in is not configured on Vistrial.",
  noCalendar: "Connect Google Calendar in Connections first.",
  needsPermission: "Google Calendar is connected for counts only. Allow brief links to let Vistrial add the link to events.",
  off: "Off. Briefs stay on the Calls tab and in the closer's email.",
  on: "On. Each brief's link is added to its call's event in Google Calendar.",
};

/** The brief's line on an event, and the marker that keeps it from being added twice. */
export function linkLine(url: string) {
  return `Pre-call brief (Vistrial): ${url}`;
}

export function withLink(description: string | null | undefined, url: string) {
  const text = description ?? "";
  if (text.includes(url)) return null;
  return text.trim() ? `${text.trimEnd()}\n\n${linkLine(url)}` : linkLine(url);
}

/** Whether the brief links may be on, and what stands in the way, for the organization or a client. */
export const status = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let clientId: Id<"clients"> | undefined;
    if (args.clientId) {
      const client = await clientHere(ctx, ctx.workspaceId, args.clientId);
      clientId = client._id;
    }
    ctx.clients.require(clientId);
    const settings = await settingsOf(ctx, { workspaceId: ctx.workspaceId, ...(clientId ? { clientId } : {}) });
    const connection = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", "google_calendar"))
      .first();
    const state: LinkState =
      readiness(PROVIDERS.google_calendar) === "not_set_up"
        ? "notSetUp"
        : !connection || connection.status !== "connected"
          ? "noCalendar"
          : !connection.scopes.includes(CALENDAR_LINK_SCOPE)
            ? "needsPermission"
            : settings?.calendarBriefLinks
              ? "on"
              : "off";
    return { state, words: LINK_WORDS[state], canChange: ctx.role === "owner" };
  },
});

/** The Owner's switch. It is saved even before the permission is granted; nothing is added until it is. */
export const setLinks = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), on: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.role !== "owner") throw userError("Only an Owner can change brief links on the calendar.");
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const row = await settingsOf(ctx, scope);
    const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, { calendarBriefLinks: args.on, ...stamp });
    else await ctx.db.insert("dealmakerSettings", { ...scope, calendarBriefLinks: args.on, ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "dealmaker.brief_links_on" : "dealmaker.brief_links_off", subject: forClient.clientId ?? ctx.workspaceId });
    return null;
  },
});

/** What `addLink` needs: the call's time, the lead's email, and whether the Owner's switch is on. */
export const linkTarget = internalQuery({
  args: { briefingId: v.id("dealBriefings") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.briefingId);
    if (!row || row.status !== "ready" || !row.startsAt || row.calendarLink) return null;
    const scope = { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
    if (!(await settingsOf(ctx, scope))?.calendarBriefLinks) return null;
    const crm = await crmFor(ctx, scope);
    const contact = crm && row.contactRef ? await crm.contact(row.contactRef) : null;
    return { workspaceId: row.workspaceId, startsAt: row.startsAt, leadEmail: contact?.email?.toLowerCase() ?? null };
  },
});

export const recordLink = internalMutation({
  args: { briefingId: v.id("dealBriefings"), state: v.union(v.literal("added"), v.literal("noEvent"), v.literal("failed")) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.briefingId);
    if (!row) notFound();
    await ctx.db.patch(row._id, { calendarLink: { state: args.state, at: Date.now() } });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "calendar", action: LINK_ACTION, subject: row._id, count: args.state === "added" ? 1 : 0 });
    return null;
  },
});

type GoogleEvent = { id?: string; start?: { dateTime?: string }; description?: string; attendees?: { email?: string }[]; organizer?: { self?: boolean } };

/**
 * Adds the brief's link to the event that starts at the call's time, on the connected person's own calendar.
 * With the lead's email known, only an event with them as a guest. Never throws.
 */
export const addLink = internalAction({
  args: { briefingId: v.id("dealBriefings") },
  handler: async (ctx, args): Promise<null> => {
    try {
      const target = await ctx.runQuery(internal.briefCalendar.linkTarget, { briefingId: args.briefingId });
      if (!target) return null;
      const live = await liveToken(ctx, target.workspaceId, "google_calendar");
      if (!live.ok || !live.connection.scopes.includes(CALENDAR_LINK_SCOPE)) {
        await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "failed" });
        return null;
      }
      const headers = { Authorization: `Bearer ${live.token}`, "Content-Type": "application/json" };
      const window = new URLSearchParams({
        timeMin: new Date(target.startsAt - 60_000).toISOString(),
        timeMax: new Date(target.startsAt + 60_000).toISOString(),
        singleEvents: "true",
        maxResults: "10",
        fields: "items(id,start,description,attendees(email),organizer(self))",
      });
      const listed = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${window}`, { headers });
      if (!listed.ok) {
        await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "failed" });
        return null;
      }
      const items = (((await listed.json()) as { items?: GoogleEvent[] }).items ?? []).filter((event) => event.id && event.start?.dateTime && Date.parse(event.start.dateTime) === target.startsAt && event.organizer?.self !== false);
      const event = target.leadEmail ? items.find((item) => (item.attendees ?? []).some((guest) => guest.email?.toLowerCase() === target.leadEmail)) : items.length === 1 ? items[0] : undefined;
      if (!event) {
        await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "noEvent" });
        return null;
      }
      const url = `${(process.env.SITE_URL?.trim() || DEFAULT_APP_URL).replace(/\/$/, "")}/app/agents/sales-conversion/work/calls?brief=${encodeURIComponent(args.briefingId)}`;
      const description = withLink(event.description, url);
      if (description !== null) {
        const patched = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event.id!)}?sendUpdates=none`, { method: "PATCH", headers, body: JSON.stringify({ description }) });
        if (!patched.ok) {
          await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "failed" });
          return null;
        }
      }
      await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "added" });
    } catch {
      console.error("Brief link not added: Google Calendar could not be reached.");
      await ctx.runMutation(internal.briefCalendar.recordLink, { briefingId: args.briefingId, state: "failed" });
    }
    return null;
  },
});
