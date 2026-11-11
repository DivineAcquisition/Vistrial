/**
 * Booked calls from a connected calendar: Google Calendar and Calendly, read-only. Vistrial fetches the
 * least it can, reduces it to counts per week in memory, and saves only those counts. No event title,
 * guest name or email address is stored. Nothing is created, changed or cancelled at the provider.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "./_generated/server";
import { liveToken } from "./integrationActions";
import { memberAction, workspaceQuery } from "./lib/builders";
import { notAllowed, userError } from "./lib/errors";
import {
  noShowCandidates,
  summarizeCalendly,
  summarizeGoogle,
  windowFor,
  type BookingsSnapshot,
  type CalendlyEvent,
  type GoogleEvent,
} from "./lib/integrations/bookings";

export const CALENDAR_PROVIDERS = ["google_calendar", "calendly"] as const;
type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];
export function isCalendarProvider(value: string): value is CalendarProvider {
  return (CALENDAR_PROVIDERS as readonly string[]).includes(value);
}

const TIMEOUT_MS = 20_000;
const GOOGLE_PAGES = 8;
const CALENDLY_PAGES = 10;
/** Calendly's Free plan allows 50 requests a minute; one read stays well under it. */
const NO_SHOW_CHECKS = 30;

type Got = { ok: true; body: Record<string, unknown> } | { ok: false; code: string };

/** A GET with the connection's token. Answers become short codes; the provider's words are not kept. */
async function get(url: string, token: string): Promise<Got> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, code: "connection_failed" };
  }
  if (response.status === 401) return { ok: false, code: "token_rejected" };
  if (response.status === 403) return { ok: false, code: "permission_missing" };
  if (response.status === 429) return { ok: false, code: "rate_limited" };
  if (!response.ok) return { ok: false, code: response.status >= 500 ? "provider_down" : "read_failed" };
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return body ? { ok: true, body } : { ok: false, code: "read_failed" };
}

type Read = { ok: true; snapshot: BookingsSnapshot } | { ok: false; code: string };

async function readGoogle(token: string, ownerEmail: string, now: number): Promise<Read> {
  const { from, to } = windowFor(now);
  const events: GoogleEvent[] = [];
  let pageToken: string | null = null;
  let truncated = false;
  for (let page = 0; page < GOOGLE_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "250",
      // Only what the counts need. Titles, descriptions, locations and guest names are never requested.
      fields: "nextPageToken,items(status,eventType,start(dateTime,date),attendees(email,self,resource,responseStatus))",
      ...(pageToken ? { pageToken } : {}),
    });
    const result = await get(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token);
    if (!result.ok) return result;
    events.push(...((result.body.items as GoogleEvent[] | undefined) ?? []));
    pageToken = typeof result.body.nextPageToken === "string" ? result.body.nextPageToken : null;
    if (!pageToken) break;
    if (page === GOOGLE_PAGES - 1) truncated = true;
  }
  return { ok: true, snapshot: summarizeGoogle(events, ownerEmail, now, truncated) };
}

async function readCalendly(token: string, userUri: string, now: number): Promise<Read> {
  const { from, to } = windowFor(now);
  const events: CalendlyEvent[] = [];
  let next: string | null = `https://api.calendly.com/scheduled_events?${new URLSearchParams({
    user: userUri,
    min_start_time: from.toISOString(),
    max_start_time: to.toISOString(),
    count: "100",
    sort: "start_time:asc",
  })}`;
  let truncated = false;
  for (let page = 0; next && page < CALENDLY_PAGES; page++) {
    const result = await get(next, token);
    if (!result.ok) return result;
    for (const row of (result.body.collection as CalendlyEvent[] | undefined) ?? []) {
      // Kept in memory for counting: the event's address, its type name, status and start. Nothing else.
      events.push({ uri: row.uri, name: row.name, status: row.status, start_time: row.start_time });
    }
    const following = (result.body.pagination as { next_page?: unknown } | undefined)?.next_page;
    next = typeof following === "string" && following.startsWith("https://api.calendly.com/") ? following : null;
    if (next && page === CALENDLY_PAGES - 1) truncated = true;
  }

  // A no-show is a mark the host puts on an invitee, so it takes one request per call to see it.
  const candidates = noShowCandidates(events, now, NO_SHOW_CHECKS);
  const noShows = new Set<string>();
  let checked = 0;
  for (const uri of candidates.check) {
    if (!uri.startsWith("https://api.calendly.com/scheduled_events/")) continue;
    const result = await get(`${uri}/invitees?count=100`, token);
    if (!result.ok) {
      if (result.code === "token_rejected") return result;
      // A rate limit or a blip ends the checking; what was counted so far stands and the screen says how many.
      break;
    }
    checked++;
    const invitees = (result.body.collection as { no_show?: unknown }[] | undefined) ?? [];
    if (invitees.some((invitee) => invitee.no_show)) noShows.add(uri);
  }
  return { ok: true, snapshot: summarizeCalendly(events, noShows, { checked, of: candidates.of }, now, truncated) };
}

/** Reads one connected calendar and saves its counts. Returns a short code. */
async function sync(ctx: ActionCtx, workspaceId: Id<"workspaces">, provider: CalendarProvider): Promise<{ code: string }> {
  const live = await liveToken(ctx, workspaceId, provider);
  if (!live.ok) return { code: live.code };
  const now = Date.now();
  const read = provider === "google_calendar" ? await readGoogle(live.token, live.connection.accountLabel, now) : await readCalendly(live.token, live.connection.accountId, now);
  if (read.ok) await ctx.runMutation(internal.integrations.saveSnapshot, { workspaceId, provider, kind: "bookings", data: read.snapshot });
  const code = read.ok ? "ok" : read.code;
  await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code });
  return { code };
}

/** Reads a connected calendar again now. Owner or Manager. */
export const syncNow = memberAction({
  args: { provider: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (role !== "owner" && role !== "manager") notAllowed();
    if (!isCalendarProvider(args.provider)) throw userError("That is not a calendar connection.");
    const result = await sync(ctx, ctx.workspaceId, args.provider);
    if (result.code === "not_connected") throw userError("Connect it first.");
    return result;
  },
});

/** The first read after a sign-in, and each scheduled one. Internal. */
export const syncOne = internalAction({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => {
    if (!isCalendarProvider(args.provider)) return { code: "not_a_calendar" };
    return sync(ctx, args.workspaceId, args.provider);
  },
});

export const connectedCalendars = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("integrationConnections").take(500);
    return rows.filter((row) => row.status === "connected" && isCalendarProvider(row.provider)).map((row) => ({ workspaceId: row.workspaceId, provider: row.provider }));
  },
});

/** Keeps each connected calendar's counts fresh. Runs on a schedule. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ synced: number }> => {
    const rows: { workspaceId: Id<"workspaces">; provider: string }[] = await ctx.runQuery(internal.bookings.connectedCalendars, {});
    for (const row of rows) {
      if (isCalendarProvider(row.provider)) await sync(ctx, row.workspaceId, row.provider);
    }
    return { synced: rows.length };
  },
});

/**
 * The saved counts for this workspace's calendars. No screen shows these yet: the Connections cards are
 * kept simple on purpose, and this query is here for the Sales conversion area that will present them.
 */
export const view = workspaceQuery({
  args: {},
  handler: async (ctx): Promise<{ canRefresh: boolean; calendars: { provider: string; syncedAt: number; snapshot: BookingsSnapshot }[] }> => {
    const calendars: { provider: string; syncedAt: number; snapshot: BookingsSnapshot }[] = [];
    for (const provider of CALENDAR_PROVIDERS) {
      const row = await ctx.db
        .query("integrationSnapshots")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", provider).eq("kind", "bookings"))
        .unique();
      if (row) calendars.push({ provider, syncedAt: row.syncedAt, snapshot: row.data as BookingsSnapshot });
    }
    return { canRefresh: ctx.member.role !== "rep", calendars };
  },
});
