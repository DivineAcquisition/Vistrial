import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Turning one CRM contact into an imported lead, and the data problems worth a
 * person's decision. Pure, so the rules are tested without a CRM.
 */

export type CrmContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  doNotContact: boolean;
  timezone: string | null;
};

function text(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function anyDnd(record: Record<string, unknown>): boolean {
  if (record.dnd === true) return true;
  const settings = (record.dndSettings ?? record.dnd_settings) as Record<string, { status?: string }> | undefined;
  if (settings && typeof settings === "object") {
    return Object.values(settings).some((entry) => typeof entry?.status === "string" && entry.status.toLowerCase() === "active");
  }
  return false;
}

export function parseCrmContact(raw: unknown): CrmContact | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = text(record, ["id", "contactId"]);
  if (!id) return null;
  const timezone = text(record, ["timezone", "timeZone"]);
  return {
    id,
    firstName: text(record, ["firstName", "first_name", "firstNameRaw"]),
    lastName: text(record, ["lastName", "last_name", "lastNameRaw"]),
    email: text(record, ["email"])?.toLowerCase() ?? null,
    phone: text(record, ["phone"]),
    source: text(record, ["source"]),
    createdAt: text(record, ["dateAdded", "date_added", "createdAt"]),
    lastActivityAt: text(record, ["lastActivity", "dateUpdated", "updatedAt"]) ?? text(record, ["dateAdded"]),
    doNotContact: anyDnd(record),
    timezone,
  };
}

export function displayLabel(contact: Pick<CrmContact, "firstName" | "lastName" | "email" | "phone">): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return (name || contact.email || contact.phone || "A contact without a name").slice(0, 120);
}

export function normalizedPhone(phone: string | null): string | null {
  if (!phone) return null;
  const parsed = parsePhoneNumberFromString(phone, "US");
  return parsed?.isValid() ? parsed.number : null;
}

export type ProblemKind = "no_contact_details" | "invalid_phone" | "invalid_email" | "possible_duplicate" | "could_not_read";

export const PROBLEM_LABEL: Record<ProblemKind, { one: string; many: string; choice: string }> = {
  no_contact_details: {
    one: "lead has no phone number or email",
    many: "leads have no phone number or email",
    choice: "Vistrial can keep them for your records, but nobody can be reminded to contact them.",
  },
  invalid_phone: {
    one: "lead has a phone number that does not look right",
    many: "leads have phone numbers that do not look right",
    choice: "Fix the number in your CRM and import again, or keep them as they are.",
  },
  invalid_email: {
    one: "lead has an email address that does not look right",
    many: "leads have email addresses that do not look right",
    choice: "Fix the address in your CRM and import again, or keep them as they are.",
  },
  possible_duplicate: {
    one: "lead may be a duplicate of another lead",
    many: "leads may be duplicates of other leads",
    choice: "Keep both, or leave the extra one out.",
  },
  could_not_read: {
    one: "contact could not be read from your CRM",
    many: "contacts could not be read from your CRM",
    choice: "Your team will look at these.",
  },
};

export function problemsFor(contact: CrmContact): ProblemKind[] {
  const problems: ProblemKind[] = [];
  if (!contact.phone && !contact.email) problems.push("no_contact_details");
  if (contact.phone && !normalizedPhone(contact.phone)) problems.push("invalid_phone");
  if (contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) problems.push("invalid_email");
  return problems;
}

export function inWindow(createdAt: string | null, windowStart: string): boolean {
  if (!createdAt) return true;
  const at = Date.parse(createdAt);
  return Number.isNaN(at) || at >= Date.parse(windowStart);
}

/** Open leads active recently get a full case file from Scribe; the rest keep a basic one. */
export function aiEligible(contact: CrmContact, activeDays: number, now = Date.now()): boolean {
  const at = contact.lastActivityAt ? Date.parse(contact.lastActivityAt) : Number.NaN;
  return !contact.doNotContact && !Number.isNaN(at) && now - at <= activeDays * 86_400_000;
}

/** A starting case file from CRM fields alone. No AI, no cost. */
export function basicCaseFileSummary(contact: CrmContact): string {
  const parts = ["Brought in from your CRM."];
  if (contact.createdAt && !Number.isNaN(Date.parse(contact.createdAt))) {
    parts.push(`First added ${new Date(contact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`);
  }
  if (contact.source) parts.push(`Came from ${contact.source}.`);
  if (contact.doNotContact) parts.push("Marked do-not-contact in your CRM, so Vistrial will never draft a message for them.");
  parts.push("This is a basic case file from the CRM details only.");
  return parts.join(" ");
}

export type SkipReason = "outside_window" | "already_in_vistrial" | "unreadable";

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  outside_window: "older than the time you chose",
  already_in_vistrial: "already in Vistrial",
  unreadable: "could not be read",
};
