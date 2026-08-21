import "server-only";

import { ghlRequest, type GhlApiResult } from "@/lib/ghl/client";
import { isAutomationOutbound, mapAppointmentOutcome, mapMessageChannel } from "@/lib/ghl/message-meta";
import { stripMessageBodies } from "@/lib/ghl/history-meta";
import type { GhlDb } from "@/lib/ghl/tokens";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pick(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

export type HistoryContact = {
  id: string;
  createdAt: string | null;
  source: string | null;
  campaign: string | null;
};

export type HistoryOpportunity = {
  id: string;
  contactId: string | null;
  status: string | null;
  monetaryValue: number | null;
  currency: string;
  occurredAt: string;
  won: boolean;
};

export type HistoryAppointment = {
  id: string;
  contactId: string | null;
  scheduledAt: string | null;
  occurredAt: string | null;
  outcome: "held" | "no_show" | "cancelled" | "rescheduled" | null;
};

export type HistoryMessage = {
  id: string;
  contactId: string | null;
  conversationId: string | null;
  direction: "inbound" | "outbound";
  channel: "sms" | "email" | "call" | "dm" | "voicemail" | "other";
  human: boolean;
  userId: string | null;
  occurredAt: string;
};

export async function searchContactsPage(
  db: GhlDb,
  orgId: string,
  locationId: string,
  page: number
): Promise<{ contacts: HistoryContact[]; hasMore: boolean }> {
  const result = await ghlRequest<{ contacts?: unknown[]; meta?: { nextPage?: number; total?: number } }>(
    db,
    orgId,
    "/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({ locationId, page, pageLimit: 100 }),
    }
  );
  const contacts = Array.isArray(result.json?.contacts) ? result.json.contacts : [];
  return {
    contacts: contacts.map(parseContact).filter((row): row is HistoryContact => Boolean(row)),
    hasMore: contacts.length === 100,
  };
}

export async function searchOpportunitiesPage(
  db: GhlDb,
  orgId: string,
  locationId: string,
  startAfterId: string | null
): Promise<{ rows: HistoryOpportunity[]; next: string | null }> {
  const params = new URLSearchParams({ location_id: locationId, limit: "100" });
  if (startAfterId) params.set("startAfterId", startAfterId);
  const result = await ghlRequest<{ opportunities?: unknown[] }>(
    db,
    orgId,
    `/opportunities/search?${params.toString()}`
  );
  const rows = (result.json?.opportunities ?? []).map(parseOpportunity).filter((row): row is HistoryOpportunity => Boolean(row));
  const next = rows.length === 100 ? rows[rows.length - 1]?.id ?? null : null;
  return { rows, next };
}

export async function listCalendars(
  db: GhlDb,
  orgId: string,
  locationId: string
): Promise<string[]> {
  const result = await ghlRequest<{ calendars?: Array<{ id?: string }> }>(
    db,
    orgId,
    `/calendars/?locationId=${encodeURIComponent(locationId)}`
  );
  return (result.json?.calendars ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
}

export async function listCalendarEvents(
  db: GhlDb,
  orgId: string,
  locationId: string,
  calendarId: string,
  startMs: number,
  endMs: number
): Promise<HistoryAppointment[]> {
  const params = new URLSearchParams({
    locationId,
    calendarId,
    startTime: String(startMs),
    endTime: String(endMs),
  });
  const result = await ghlRequest<{ events?: unknown[] }>(
    db,
    orgId,
    `/calendars/events?${params.toString()}`
  );
  return (result.json?.events ?? [])
    .map(parseAppointment)
    .filter((row): row is HistoryAppointment => Boolean(row));
}

export async function searchConversationsPage(
  db: GhlDb,
  orgId: string,
  locationId: string,
  startAfter: string | null
): Promise<{ ids: Array<{ id: string; contactId: string | null }>; next: string | null }> {
  const params = new URLSearchParams({ locationId, limit: "20" });
  if (startAfter) params.set("startAfterDate", startAfter);
  const result = await ghlRequest<{ conversations?: Array<Record<string, unknown>> }>(
    db,
    orgId,
    `/conversations/search?${params.toString()}`
  );
  const conversations = result.json?.conversations ?? [];
  const ids = conversations.map((row) => ({
    id: asString(row.id) ?? "",
    contactId: pick(row, ["contactId", "contact_id"]),
  })).filter((row) => row.id);
  const lastDate = pick(conversations[conversations.length - 1] ?? null, [
    "lastMessageDate",
    "dateUpdated",
    "dateAdded",
  ]);
  return { ids, next: conversations.length === 20 ? lastDate : null };
}

export async function listConversationMessages(
  db: GhlDb,
  orgId: string,
  conversationId: string
): Promise<HistoryMessage[]> {
  const result: GhlApiResult<unknown> = await ghlRequest(
    db,
    orgId,
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { version: "2021-04-15" }
  );
  const stripped = stripMessageBodies(result.json);
  const root = asRecord(stripped);
  const messages = Array.isArray(root?.messages)
    ? root.messages
    : Array.isArray(asRecord(root?.messages)?.messages)
      ? (asRecord(root?.messages)?.messages as unknown[])
      : [];
  return messages.map((row) => parseMessage(row, conversationId)).filter((row): row is HistoryMessage => Boolean(row));
}

function parseContact(raw: unknown): HistoryContact | null {
  const row = asRecord(raw);
  const id = pick(row, ["id", "contactId"]);
  if (!id) return null;
  const attribution = asRecord(row?.attributionSource ?? row?.attribution ?? null);
  return {
    id,
    createdAt: pick(row, ["dateAdded", "date_added", "createdAt"]),
    source: pick(row, ["source"]) ?? pick(attribution, ["sessionSource", "medium", "source"]),
    campaign: pick(row, ["campaign"]) ?? pick(attribution, ["campaign", "utmCampaign"]),
  };
}

function parseOpportunity(raw: unknown): HistoryOpportunity | null {
  const row = asRecord(raw);
  const id = pick(row, ["id"]);
  if (!id) return null;
  const status = (pick(row, ["status", "opportunityStatus"]) ?? "").toLowerCase();
  const valueRaw = row?.monetaryValue ?? row?.value;
  const monetaryValue = typeof valueRaw === "number" ? valueRaw : typeof valueRaw === "string" ? Number(valueRaw) : null;
  return {
    id,
    contactId: pick(row, ["contactId", "contact_id"]),
    status,
    monetaryValue: monetaryValue !== null && Number.isFinite(monetaryValue) ? monetaryValue : null,
    currency: pick(row, ["currency"]) ?? "usd",
    occurredAt:
      pick(row, ["lastStatusChangeAt", "updatedAt", "dateAdded", "createdAt"]) ?? new Date().toISOString(),
    won: status === "won" || status.includes("won") || status === "closed",
  };
}

function parseAppointment(raw: unknown): HistoryAppointment | null {
  const row = asRecord(raw);
  const id = pick(row, ["id"]);
  if (!id) return null;
  const start = pick(row, ["startTime", "appointmentStartTime", "start_time"]);
  return {
    id,
    contactId: pick(asRecord(row?.contact), ["id"]) ?? pick(row, ["contactId", "contact_id"]),
    scheduledAt: start,
    occurredAt: pick(row, ["endTime", "appointmentEndTime"]) ?? start,
    outcome: mapAppointmentOutcome(pick(row, ["appointmentStatus", "status"])),
  };
}

function parseMessage(raw: unknown, conversationId: string): HistoryMessage | null {
  const row = asRecord(stripMessageBodies(raw));
  if (!row) return null;
  const id = pick(row, ["id", "messageId"]);
  if (!id) return null;
  const directionRaw = (pick(row, ["direction", "type"]) ?? "").toLowerCase();
  const direction = directionRaw.includes("in") ? "inbound" : "outbound";
  const payload = row;
  const automated = isAutomationOutbound(payload);
  const userId = pick(row, ["userId", "user_id"]);
  return {
    id,
    contactId: pick(row, ["contactId", "contact_id"]),
    conversationId,
    direction,
    channel: mapMessageChannel(pick(row, ["messageType", "type", "channel"])),
    human: direction === "outbound" && Boolean(userId) && !automated,
    userId,
    occurredAt: pick(row, ["dateAdded", "timestamp", "createdAt"]) ?? new Date().toISOString(),
  };
}
