import "server-only";

import { ghlRequest } from "@/lib/ghl/client";
import type { LiveField } from "@/lib/ghl/propose-maps";
import type { GhlDb } from "@/lib/ghl/tokens";

/** Enough contacts to see a pattern, few enough to keep this a single call. */
const SAMPLE_CONTACTS = 20;
const SAMPLES_PER_FIELD = 3;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asDisplayValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(asDisplayValue).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

/**
 * Real answers for each custom field, pulled from recent contacts.
 *
 * Field definitions alone are not enough to propose a mapping anyone can
 * check — "Q3 response" tells you nothing, but seeing "Next 30 days" in it
 * tells you everything. Values are read only to show the user an example.
 */
export async function loadLiveFields(
  db: GhlDb,
  orgId: string,
  locationId: string,
  definitions: Array<{ id: string; name: string; key?: string }>
): Promise<LiveField[]> {
  const samples = new Map<string, string[]>();

  const result = await ghlRequest<{ contacts?: unknown[] }>(db, orgId, "/contacts/search", {
    method: "POST",
    body: JSON.stringify({ locationId, page: 1, pageLimit: SAMPLE_CONTACTS }),
  });

  if (result.ok && Array.isArray(result.json?.contacts)) {
    for (const raw of result.json.contacts) {
      const contact = asRecord(raw);
      if (!contact) continue;
      const list = contact.customFields ?? contact.customField ?? contact.custom_fields;
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const field = asRecord(item);
        if (!field) continue;
        const id =
          asDisplayValue(field.id) ?? asDisplayValue(field.fieldId) ?? asDisplayValue(field.field_id);
        if (!id) continue;
        const value = asDisplayValue(field.value ?? field.fieldValue ?? field.field_value);
        if (!value) continue;
        const seen = samples.get(id) ?? [];
        if (seen.length < SAMPLES_PER_FIELD && !seen.includes(value)) {
          seen.push(value);
          samples.set(id, seen);
        }
      }
    }
  }

  return definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    key: definition.key,
    samples: samples.get(definition.id) ?? [],
  }));
}
