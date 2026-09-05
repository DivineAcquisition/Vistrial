import "server-only";

import {
  listCalendarEvents,
  listCalendars,
  listConversationMessages,
  searchConversationsPage,
} from "@/lib/ghl/history";
import { loadConnection } from "@/lib/ghl/tokens";
import { loadForsightSource, type ForsightDb } from "@/lib/forsight/sources";

/**
 * GoHighLevel, read through the connection Vistrial already has.
 *
 * There is no second OAuth app, no Forsight-specific credential and nothing in
 * the source record but which calendar to read: `ghlRequest` resolves a
 * per-sub-account token from `ghl_connections` and refreshes it on the way
 * past. Forsight never writes to GHL.
 *
 * Message *content* is never read, counted only. That rule holds across the
 * whole product and Forsight is not an exception: the shared history helpers
 * strip bodies before parsing, and nothing below keeps anything but a
 * direction, a channel and a timestamp.
 */

/** Bounds the live read so a page render cannot walk a location's entire conversation history. */
const MAX_CONVERSATION_PAGES = 5;
const MAX_CONVERSATIONS = 100;

export type GhlAppointments = {
  booked: number;
  showed: number;
  noShowed: number;
  cancelled: number;
};

export type GhlMessages = {
  outboundSms: number;
  outboundEmail: number;
  outboundOther: number;
  inbound: number;
  /** True when the walk hit its cap, so these are floors and not totals. */
  partial: boolean;
};

export type GhlActivity = {
  calendarLabel: string;
  appointments: GhlAppointments;
  messages: GhlMessages;
};

export type GhlActivityResult =
  | { state: "ok"; activity: GhlActivity }
  | { state: "not_tracked" }
  | { state: "unavailable"; reason: string };

async function rateAllows(db: ForsightDb, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc("try_consume_ghl_rate", { p_org_id: orgId });
  if (error) return false;
  return data === true;
}

export function countAppointments(
  events: Array<{ outcome: "held" | "no_show" | "cancelled" | "rescheduled" | null }>
): GhlAppointments {
  const counts: GhlAppointments = { booked: 0, showed: 0, noShowed: 0, cancelled: 0 };
  for (const event of events) {
    counts.booked += 1;
    if (event.outcome === "held") counts.showed += 1;
    else if (event.outcome === "no_show") counts.noShowed += 1;
    else if (event.outcome === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

export function countMessages(
  messages: Array<{ direction: "inbound" | "outbound"; channel: string; occurredAt: string }>,
  window: { from: string; to: string },
  partial: boolean
): GhlMessages {
  const counts: GhlMessages = {
    outboundSms: 0,
    outboundEmail: 0,
    outboundOther: 0,
    inbound: 0,
    partial,
  };

  for (const message of messages) {
    if (message.occurredAt < window.from || message.occurredAt > window.to) continue;
    if (message.direction === "inbound") {
      counts.inbound += 1;
      continue;
    }
    if (message.channel === "sms") counts.outboundSms += 1;
    else if (message.channel === "email") counts.outboundEmail += 1;
    else counts.outboundOther += 1;
  }

  return counts;
}

/**
 * Appointments by status and message volume for a window. Read-only and live.
 */
export async function loadGhlActivity(
  db: ForsightDb,
  args: { orgId: string; from: string; to: string }
): Promise<GhlActivityResult> {
  try {
    const source = await loadForsightSource(db, args.orgId, "ghl");
    if (!source || source.type !== "ghl") return { state: "not_tracked" };

    const connection = await loadConnection(db, args.orgId);
    if (!connection?.location_id || connection.status !== "active") {
      return {
        state: "unavailable",
        reason:
          "This workspace's LeadConnector connection is not active, so appointments and message counts cannot be read.",
      };
    }

    const locationId = connection.location_id;
    const startMs = Date.parse(`${args.from}T00:00:00Z`);
    const endMs = Date.parse(`${args.to}T23:59:59Z`);

    const calendarIds = source.calendarId
      ? [source.calendarId]
      : await listCalendars(db, args.orgId, locationId);

    const events: Array<{ outcome: "held" | "no_show" | "cancelled" | "rescheduled" | null }> = [];
    for (const calendarId of calendarIds) {
      if (!(await rateAllows(db, args.orgId))) break;
      events.push(...(await listCalendarEvents(db, args.orgId, locationId, calendarId, startMs, endMs)));
    }

    const messages = await walkMessages(db, args.orgId, locationId, args.from);

    return {
      state: "ok",
      activity: {
        calendarLabel: source.calendarId
          ? source.label?.trim() || source.calendarId
          : `${calendarIds.length} calendar${calendarIds.length === 1 ? "" : "s"}`,
        appointments: countAppointments(events),
        messages: countMessages(messages.rows, { from: args.from, to: `${args.to}T23:59:59Z` }, messages.partial),
      },
    };
  } catch (error) {
    return {
      state: "unavailable",
      reason: error instanceof Error ? error.message : "LeadConnector could not be reached.",
    };
  }
}

/**
 * GHL has no aggregate message-count endpoint, so the only way to a count is
 * to walk conversations. That is bounded here: a dashboard read must not turn
 * into an unbounded crawl, and a count that stopped early says so rather than
 * pretending to be a total.
 */
async function walkMessages(
  db: ForsightDb,
  orgId: string,
  locationId: string,
  from: string
): Promise<{
  rows: Array<{ direction: "inbound" | "outbound"; channel: string; occurredAt: string }>;
  partial: boolean;
}> {
  const rows: Array<{ direction: "inbound" | "outbound"; channel: string; occurredAt: string }> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let partial = false;

  for (let page = 0; page < MAX_CONVERSATION_PAGES; page += 1) {
    if (!(await rateAllows(db, orgId))) {
      partial = true;
      break;
    }
    const search: Awaited<ReturnType<typeof searchConversationsPage>> =
      await searchConversationsPage(db, orgId, locationId, cursor);
    if (search.ids.length === 0) break;

    for (const conversation of search.ids) {
      if (seen.size >= MAX_CONVERSATIONS) {
        partial = true;
        break;
      }
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);

      if (!(await rateAllows(db, orgId))) {
        partial = true;
        break;
      }
      const messages = await listConversationMessages(db, orgId, conversation.id);
      for (const message of messages) {
        if (message.occurredAt < from) continue;
        rows.push({
          direction: message.direction,
          channel: message.channel,
          occurredAt: message.occurredAt,
        });
      }
    }

    if (partial || !search.next) break;
    cursor = search.next;
  }

  return { rows, partial };
}