import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_MAX_BYTES = 256_000;
export const WEBHOOK_VERSION = 1;

const MESSAGE_KEY =
  /^(body|html|text|content|message|messagebody|message_body|sms|emailbody|email_body|transcript|raw|raw_body|notes|description)$/i;

const ROOT_KNOWN = new Set(["version", "id", "type", "occurred_at", "historic", "person", "fields", "opt_out"]);
const PERSON_KNOWN = new Set(["external_id", "email", "phone", "first_name", "last_name"]);

export type InboundPerson = {
  externalId: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type InboundEvent = {
  version: number;
  id: string;
  type: string;
  occurredAt: string | null;
  historic: boolean;
  person: InboundPerson | null;
  optOut: boolean;
  fields: Record<string, string>;
  ignored: string[];
};

export type InboundParse =
  | { ok: true; event: InboundEvent }
  | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Drops message text at every depth. Returns the field names that were dropped. */
export function stripInboundText(value: unknown, depth = 0): { value: unknown; stripped: string[] } {
  if (depth > 8 || value === null || typeof value !== "object") return { value, stripped: [] };
  if (Array.isArray(value)) {
    const stripped: string[] = [];
    const next = value.slice(0, 100).map((item) => {
      const child = stripInboundText(item, depth + 1);
      stripped.push(...child.stripped);
      return child.value;
    });
    return { value: next, stripped };
  }
  const stripped: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (MESSAGE_KEY.test(key)) {
      stripped.push(key);
      continue;
    }
    const child = stripInboundText(nested, depth + 1);
    stripped.push(...child.stripped);
    out[key] = child.value;
  }
  return { value: out, stripped };
}

export function parseInboundPayload(raw: string): InboundParse {
  if (Buffer.byteLength(raw, "utf8") > WEBHOOK_MAX_BYTES) {
    return { ok: false, reason: "This event is too large." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "This event is not valid JSON." };
  }
  const stripped = stripInboundText(parsed);
  const root = asRecord(stripped.value);
  if (!root) return { ok: false, reason: "This event has to be an object." };

  const ignored = [...stripped.stripped];
  for (const key of Object.keys(root)) {
    if (!ROOT_KNOWN.has(key)) ignored.push(key);
  }

  const version = root.version;
  if (version !== WEBHOOK_VERSION) {
    return { ok: false, reason: "This event uses a payload version Vistrial does not accept." };
  }
  const id = asString(root.id);
  const type = asString(root.type);
  if (!id || !type) return { ok: false, reason: "This event needs an id and a type." };

  const personRaw = asRecord(root.person);
  let person: InboundPerson | null = null;
  if (personRaw) {
    for (const key of Object.keys(personRaw)) {
      if (!PERSON_KNOWN.has(key)) ignored.push(`person.${key}`);
    }
    person = {
      externalId: asString(personRaw.external_id),
      email: asString(personRaw.email)?.toLowerCase() ?? null,
      phone: asString(personRaw.phone),
      firstName: asString(personRaw.first_name),
      lastName: asString(personRaw.last_name),
    };
  }

  const fieldsRaw = asRecord(root.fields);
  const fields: Record<string, string> = {};
  if (fieldsRaw) {
    for (const [key, value] of Object.entries(fieldsRaw)) {
      if (MESSAGE_KEY.test(key)) {
        ignored.push(`fields.${key}`);
        continue;
      }
      const text = asString(value);
      if (text) fields[key] = text;
    }
  }

  return {
    ok: true,
    event: {
      version: WEBHOOK_VERSION,
      id,
      type,
      occurredAt: asString(root.occurred_at),
      historic: root.historic === true,
      person,
      optOut: root.opt_out === true || type === "person.opt_out",
      fields,
      ignored: [...new Set(ignored)],
    },
  };
}

export function signBody(secret: string, raw: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function deliveryOutcome(args: {
  signatureOk: boolean;
  duplicate: boolean;
  parsed: InboundParse;
}): { result: "accepted" | "rejected" | "duplicate"; reason: string } {
  if (!args.signatureOk) return { result: "rejected", reason: "The signature did not match." };
  if (args.duplicate) return { result: "duplicate", reason: "This event was already received." };
  if (!args.parsed.ok) return { result: "rejected", reason: args.parsed.reason };
  return { result: "accepted", reason: "Accepted." };
}

/** A secret for one connection cannot be presented as another connection's. */
export function sameConnection(endpointConnectionId: string, claimedConnectionId: string): boolean {
  return endpointConnectionId === claimedConnectionId;
}
