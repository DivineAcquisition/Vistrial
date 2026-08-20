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
    parsedValue = { _unparsed: true, raw };
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
    payload,
    eventType,
    providerEventId,
    locationId,
    contactId,
    contactKey: locationId && contactId ? `${locationId}:${contactId}` : contactId,
  };
}

export function asJsonRecord(value: Json): Record<string, unknown> {
  return asRecord(value) ?? {};
}
