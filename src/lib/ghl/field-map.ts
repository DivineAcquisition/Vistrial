export type GhlFieldMap = {
  id: string;
  ghlFieldId: string | null;
  ghlFieldKey: string | null;
  answerKey: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

type CustomField = { id: string | null; key: string | null; value: unknown };

function readCustomFields(contact: Record<string, unknown>): CustomField[] {
  const out: CustomField[] = [];
  const list = contact.customFields ?? contact.customField ?? contact.custom_fields;
  if (Array.isArray(list)) {
    for (const item of list) {
      const rec = asRecord(item);
      if (!rec) continue;
      out.push({
        id: asString(rec.id) || asString(rec.fieldId) || asString(rec.field_id),
        key: asString(rec.key) || asString(rec.fieldKey) || asString(rec.field_key),
        value: rec.value ?? rec.fieldValue ?? rec.field_value,
      });
    }
  } else {
    const rec = asRecord(list);
    if (rec) {
      for (const [key, value] of Object.entries(rec)) {
        const nested = asRecord(value);
        out.push({
          id: key,
          key,
          value: nested ? (nested.value ?? nested.fieldValue ?? value) : value,
        });
      }
    }
  }
  return out;
}

/**
 * Map GHL custom fields onto application_answers using org-configured maps.
 * Identity fields (name, email, phone) are not answers and are handled separately.
 */
export function applyGhlFieldMaps(
  contact: Record<string, unknown>,
  maps: GhlFieldMap[]
): Record<string, unknown> {
  const fields = readCustomFields(contact);
  const answers: Record<string, unknown> = {};
  for (const map of maps) {
    const match = fields.find((field) => {
      if (map.ghlFieldId && field.id && field.id === map.ghlFieldId) return true;
      if (map.ghlFieldKey && field.key && field.key === map.ghlFieldKey) return true;
      if (map.ghlFieldKey && field.id && field.id === map.ghlFieldKey) return true;
      return false;
    });
    if (!match) continue;
    const value = asString(match.value);
    if (value === null) continue;
    answers[map.answerKey] = value;
  }
  return answers;
}

export function mergeAnswers(
  existing: Record<string, unknown>,
  mapped: Record<string, unknown>
): Record<string, unknown> {
  return { ...existing, ...mapped };
}

export function answersEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) sorted[key] = value[key];
  return JSON.stringify(sorted);
}
