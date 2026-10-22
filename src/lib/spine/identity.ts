import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Scribe's identity matcher. Every source describes a person with some of
 * these keys, and a lead is the same person when the keys agree. It never
 * guesses: two leads claiming the same person, or a phone number alone, go to
 * a person to decide.
 */

export type IdentityKind = "email" | "phone" | "crm";

/** Where a key came from, shown next to it on the Lead Record. */
export type IdentitySource = "crm" | "calendar" | "gmail" | "outlook" | "transcript" | "form" | "upload" | "manual" | "webhook";

export type IdentityKey = { kind: IdentityKind; value: string };

export type SourcePerson = {
  source: IdentitySource;
  email?: string | null;
  phone?: string | null;
  /** The CRM and its contact id, for example { system: "hubspot", id: "901" }. */
  crm?: { system: string; id: string } | null;
  /** Calendar attendees are matched by their email. */
  attendeeEmail?: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** E.164, read in the workspace's country when the number has no country code. */
export function normalizePhone(value: string | null | undefined, country: CountryCode = "US"): string | null {
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value.trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

export function crmKey(system: string, id: string): string | null {
  const s = system.trim().toLowerCase();
  const v = id.trim();
  return s && v ? `${s}:${v}` : null;
}

export function identityKeys(person: SourcePerson, country: CountryCode = "US"): IdentityKey[] {
  const keys: IdentityKey[] = [];
  const seen = new Set<string>();
  const add = (kind: IdentityKind, value: string | null) => {
    if (!value || seen.has(`${kind}|${value}`)) return;
    seen.add(`${kind}|${value}`);
    keys.push({ kind, value });
  };
  if (person.crm) add("crm", crmKey(person.crm.system, person.crm.id));
  add("email", normalizeEmail(person.email));
  add("email", normalizeEmail(person.attendeeEmail));
  add("phone", normalizePhone(person.phone, country));
  return keys;
}

/** Leads already holding each key. A shared office phone can point at several. */
export type IdentityIndex = (key: IdentityKey) => readonly string[];

export type IdentityDecision =
  | { kind: "match"; leadId: string; via: IdentityKind[] }
  | { kind: "new" }
  | { kind: "review"; reason: "conflict" | "phone_only"; leadIds: string[] }
  | { kind: "unusable" };

/**
 * One lead behind every matching key, found by a CRM id or an email: the same
 * person. Several leads: a person decides, and nothing is merged on its own.
 * Only a phone in common: a person decides, because families and offices
 * share numbers.
 */
export function decideIdentity(keys: IdentityKey[], index: IdentityIndex): IdentityDecision {
  if (keys.length === 0) return { kind: "unusable" };
  const byLead = new Map<string, Set<IdentityKind>>();
  for (const key of keys) {
    for (const leadId of index(key)) {
      const kinds = byLead.get(leadId) ?? new Set<IdentityKind>();
      kinds.add(key.kind);
      byLead.set(leadId, kinds);
    }
  }
  if (byLead.size === 0) return { kind: "new" };
  const leadIds = [...byLead.keys()].sort();
  if (byLead.size > 1) return { kind: "review", reason: "conflict", leadIds };
  const [leadId] = leadIds;
  const via = [...byLead.get(leadId)!].sort() as IdentityKind[];
  if (!via.includes("crm") && !via.includes("email")) return { kind: "review", reason: "phone_only", leadIds };
  return { kind: "match", leadId, via };
}

/** A merge keeps everything needed to undo it: which keys moved, and what the merged lead looked like. */
export type MergeSnapshot = {
  version: 1;
  survivorLeadId: string;
  mergedLeadId: string;
  movedKeys: IdentityKey[];
  mergedLead: Record<string, unknown>;
};

export function planMerge(args: {
  survivorLeadId: string;
  mergedLeadId: string;
  mergedKeys: IdentityKey[];
  survivorKeys: IdentityKey[];
  mergedLead: Record<string, unknown>;
}): MergeSnapshot {
  if (args.survivorLeadId === args.mergedLeadId) throw new Error("A lead cannot be merged into itself.");
  const held = new Set(args.survivorKeys.map((key) => `${key.kind}|${key.value}`));
  return {
    version: 1,
    survivorLeadId: args.survivorLeadId,
    mergedLeadId: args.mergedLeadId,
    movedKeys: args.mergedKeys.filter((key) => !held.has(`${key.kind}|${key.value}`)),
    mergedLead: args.mergedLead,
  };
}

/** Undo gives the merged lead back exactly the keys it brought, and only those. */
export function reverseMerge(snapshot: MergeSnapshot): { leadId: string; restoreKeys: IdentityKey[]; restoreLead: Record<string, unknown> } {
  return { leadId: snapshot.mergedLeadId, restoreKeys: snapshot.movedKeys, restoreLead: snapshot.mergedLead };
}
