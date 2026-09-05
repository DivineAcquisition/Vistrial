import { createHash } from "node:crypto";

import type { Json } from "@/types/database";

export type ParsedWebhook = {
  parsed: boolean;
  payload: Json;
  eventType: string;
  providerEventId: string;
  locationId: string | null;
  contactId: string | null;
  contactKey: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const found = asString(record[key]);
    if (found) return found;
  }
  return null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!record) return null;
  return asRecord(record[key]);
}

export function hashRawBody(raw: string): string {
  return `sha256:${createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 40)}`;
}

/**
 * Pull storage metadata from a webhook body. This is not domain resolution:
 * it only fills columns the ingest insert needs (type, provider id, location).
 */
export function parseWebhookPayload(raw: string): ParsedWebhook {
  let parsedValue: unknown;
  let parsed = true;
  try {
    parsedValue = JSON.parse(raw);
  } catch {
    parsed = false;
    parsedValue = { _unparsed: true, bytes: raw.length };
  }

  const payload: Json =
    parsedValue === null || typeof parsedValue !== "object"
      ? { _value: parsedValue as Json }
      : (parsedValue as Json);

  const root = asRecord(payload);
  const data = nested(root, "data") ?? nested(root, "appointment") ?? nested(root, "contact");
  const eventType =
    pickString(root, ["type", "eventType", "event"]) ?? (parsed ? "unknown" : "unparsed");
  const providerEventId =
    pickString(root, ["webhookId", "webhook_id", "id"]) ?? hashRawBody(raw);
  const locationId =
    pickString(root, ["locationId", "location_id"]) ?? pickString(data, ["locationId", "location_id"]);
  const contactId =
    pickString(root, ["contactId", "contact_id"]) ??
    pickString(data, ["contactId", "contact_id", "id"]) ??
    pickString(nested(root, "contact"), ["id"]);

  return {
    parsed,
    payload: stripMessageBodies(payload),
    eventType,
    providerEventId,
    locationId,
    contactId,
    // The lock that serialises a contact's events keys off this. It must not
    // vary with whichever fields a given event type happens to carry, or a
    // create and its own update take different locks and race.
    contactKey: contactId,
  };
}

/** Conversational copy is never stored. Identity fields used to upsert leads stay. */
const BODY_KEY =
  /^(body|html|text|content|raw|rawbody|raw_body|messagebody|message_body|attachments|sms|emailbody|email_body)$/i;

function stripMessageBodies(value: Json, depth = 0): Json {
  if (depth > 8 || value === null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => stripMessageBodies(item as Json, depth + 1));
  }

  const out: Record<string, Json> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (BODY_KEY.test(key)) {
      out[key] = { redacted: true };
      continue;
    }
    if (key.toLowerCase() === "message" && typeof nested === "string") {
      out[key] = { redacted: true };
      continue;
    }
    out[key] = stripMessageBodies(nested as Json, depth + 1);
  }
  return out;
}

export function asJsonRecord(value: Json): Record<string, unknown> {
  return asRecord(value) ?? {};
}
