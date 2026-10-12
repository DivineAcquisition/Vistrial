/**
 * Carrier registration for business texting. Vistrial collects these details
 * from the Owner, keeps them encrypted, and the Vistrial team enters them in
 * the CRM's phone registration. Vistrial never asks for or stores a tax ID
 * (EIN): the team collects it directly and enters it only in the CRM.
 *
 * The shape is the same whichever service submits it, so a direct
 * registration integration can be added later without changing what the
 * Owner fills in.
 */

export const REGISTRATION_FIELDS = [
  { key: "legal_name", label: "Legal business name", help: "Exactly as it appears on your business registration.", max: 160, required: true },
  { key: "business_type", label: "Type of business", help: "For example: sole proprietor, LLC, corporation, partnership, or non-profit.", max: 60, required: true, kind: "choice" },
  { key: "industry", label: "Industry", help: "What your business does, in a few words.", max: 120, required: true },
  { key: "street", label: "Street address", help: "The registered business address.", max: 160, required: true },
  { key: "city", label: "City", max: 80, required: true },
  { key: "region", label: "State or region", max: 80, required: true },
  { key: "postal_code", label: "ZIP or postal code", max: 20, required: true },
  { key: "country", label: "Country", max: 60, required: true },
  { key: "website", label: "Website", help: "The carriers check that it is live and matches your business.", max: 200, required: true, kind: "url" },
  { key: "contact_name", label: "Contact name", help: "Who the carriers can contact about this registration.", max: 120, required: true },
  { key: "contact_email", label: "Contact email", max: 200, required: true, kind: "email" },
  { key: "contact_phone", label: "Contact phone", max: 40, required: true, kind: "phone" },
  { key: "use_case", label: "What your texts are for", help: "For example: replying to people who asked about our services, and booking appointments.", max: 500, required: true, kind: "long" },
  { key: "sample_message_1", label: "An example text", help: "A real message you would send. Include your business name.", max: 320, required: true, kind: "long" },
  { key: "sample_message_2", label: "Another example text", max: 320, required: true, kind: "long" },
  { key: "opt_in", label: "How people agree to get texts", help: "For example: a checkbox on our booking form that says they agree to receive texts.", max: 500, required: true, kind: "long" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  help?: string;
  max: number;
  required: boolean;
  kind?: "choice" | "url" | "email" | "phone" | "long";
}>;

export type RegistrationFieldKey = (typeof REGISTRATION_FIELDS)[number]["key"];
export type RegistrationDetails = Partial<Record<RegistrationFieldKey, string>>;

export const BUSINESS_TYPES = ["Sole proprietor", "LLC", "Corporation", "Partnership", "Non-profit", "Other"] as const;

const TAX_ID = /\b(ein|tax\s*id|tin|ssn|social security)\b/i;
const EIN_SHAPE = /\b\d{2}-?\d{7}\b/;

export type RegistrationValidation =
  | { ok: true; details: RegistrationDetails; fieldNames: RegistrationFieldKey[]; complete: boolean }
  | { ok: false; errors: Partial<Record<RegistrationFieldKey | "form", string>> };

/**
 * Cleans what the Owner entered and merges it over what was saved before, so
 * correcting one field never wipes the others. Refuses anything that looks
 * like a tax ID.
 */
export function validateRegistration(input: Record<string, unknown>, previous: RegistrationDetails = {}): RegistrationValidation {
  const errors: Partial<Record<RegistrationFieldKey | "form", string>> = {};
  const next: RegistrationDetails = { ...previous };
  for (const field of REGISTRATION_FIELDS) {
    if (!(field.key in input)) continue;
    const raw = String(input[field.key] ?? "").replace(/\s+/g, " ").trim();
    if (!raw) {
      delete next[field.key];
      continue;
    }
    if (raw.length > field.max) {
      errors[field.key] = `Keep this under ${field.max} characters.`;
      continue;
    }
    if (EIN_SHAPE.test(raw) && field.key !== "contact_phone" && field.key !== "postal_code") {
      errors[field.key] = "This looks like a tax ID. Leave it out; your team will ask you for it directly.";
      continue;
    }
    if ("kind" in field && field.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
      errors[field.key] = "Enter a valid email address.";
      continue;
    }
    if ("kind" in field && field.kind === "url" && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw)) {
      errors[field.key] = "Enter your website address, like example.com.";
      continue;
    }
    if ("kind" in field && field.kind === "phone" && raw.replace(/\D/g, "").length < 7) {
      errors[field.key] = "Enter a phone number with area code.";
      continue;
    }
    next[field.key] = raw;
  }
  for (const key of Object.keys(input)) {
    if (TAX_ID.test(key.replace(/[_\-.]+/g, " "))) errors.form = "Vistrial does not collect tax IDs. Your team will ask you for it directly.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const fieldNames = REGISTRATION_FIELDS.map((field) => field.key).filter((key) => Boolean(next[key]));
  const complete = REGISTRATION_FIELDS.every((field) => !field.required || Boolean(next[field.key]));
  return { ok: true, details: next, fieldNames, complete };
}

export type CarrierStatus = "not_registered" | "pending" | "approved" | "rejected";

export const CARRIER_STATUS_LABEL: Record<CarrierStatus, string> = {
  not_registered: "Not submitted yet",
  pending: "Waiting for carrier approval",
  approved: "Approved",
  rejected: "Not approved yet",
};

export const REJECTION_CODES = [
  "business_details_mismatch",
  "website_problem",
  "opt_in_unclear",
  "sample_messages",
  "use_case_not_allowed",
  "other",
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

/** What the carriers said, and what to do about it, in plain words. */
export const REJECTION_GUIDANCE: Record<RejectionCode, { reason: string; fix: string; fields: RegistrationFieldKey[] }> = {
  business_details_mismatch: {
    reason: "The business name or address did not match the official business records.",
    fix: "Check your legal business name and address match your registration documents exactly, including punctuation like \"LLC\".",
    fields: ["legal_name", "street", "city", "region", "postal_code"],
  },
  website_problem: {
    reason: "The carriers could not confirm your website. It may be down, unfinished, or missing a privacy policy.",
    fix: "Make sure your website loads, shows your business name, and has a privacy policy that mentions text messages.",
    fields: ["website"],
  },
  opt_in_unclear: {
    reason: "It was not clear how people agree to receive your texts.",
    fix: "Describe exactly where people agree, for example the wording of the checkbox on your form.",
    fields: ["opt_in"],
  },
  sample_messages: {
    reason: "The example texts did not match what you said the texts are for, or did not name your business.",
    fix: "Rewrite the examples as real messages you would send, starting with your business name.",
    fields: ["sample_message_1", "sample_message_2", "use_case"],
  },
  use_case_not_allowed: {
    reason: "The carriers do not allow this kind of texting without extra approval.",
    fix: "Your team will talk you through the options. You can carry on with the rest of setup in the meantime.",
    fields: ["use_case"],
  },
  other: {
    reason: "The carriers asked for a change.",
    fix: "Your team will tell you exactly what to change.",
    fields: [],
  },
};

export function isRejectionCode(value: unknown): value is RejectionCode {
  return typeof value === "string" && (REJECTION_CODES as readonly string[]).includes(value);
}
