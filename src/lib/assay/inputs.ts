/**
 * The only lead fields Assay may read. A workspace maps its own field names
 * onto these keys; anything else is ignored and reported. Nothing here is a
 * person's identity: no names, no demographics, no zip code, no income, no
 * age, no health details. Location appears only as service fit.
 */

export type InputType = "boolean" | "number" | "text";

export type ApprovedInput = {
  key: string;
  label: string;
  type: InputType;
  /** Plain language for the staff screen and the Owner's read-only page. */
  help: string;
};

export const APPROVED_INPUTS = [
  { key: "service_offered", label: "Service requested is one the business offers", type: "boolean", help: "Matched from the service the lead asked for against the business's offers." },
  { key: "service_value", label: "Value of the service requested", type: "number", help: "The top of the price range for the matched offer." },
  { key: "estimated_value", label: "Estimated job or deal value", type: "number", help: "A value from the CRM or a mapped form field." },
  { key: "in_service_area", label: "Inside the service area", type: "boolean", help: "Service fit only. Never used as a measure of a neighborhood." },
  { key: "travel_distance", label: "Travel distance (miles)", type: "number", help: "Service fit only." },
  { key: "lead_source", label: "Lead source", type: "text", help: "Scored by how this source has converted here, once it has enough history." },
  { key: "contact_complete", label: "Working phone or email", type: "boolean", help: "The lead can be reached." },
  { key: "decision_maker", label: "Decision maker identified", type: "boolean", help: "From the CRM or a call." },
  { key: "property_owner", label: "Owns the property", type: "boolean", help: "From a CRM field or a call." },
  { key: "application_submitted", label: "Application submitted", type: "boolean", help: "The lead filled in the application." },
  { key: "target_client", label: "Matches the target client", type: "boolean", help: "From mapped application fields." },
  { key: "high_value_interest", label: "Interested in a higher value service or package", type: "boolean", help: "From a mapped field." },
] as const satisfies readonly ApprovedInput[];

export type ApprovedInputKey = (typeof APPROVED_INPUTS)[number]["key"];

const BY_KEY = new Map<string, ApprovedInput>(APPROVED_INPUTS.map((input) => [input.key, input]));

export function approvedInput(key: string): ApprovedInput | null {
  return BY_KEY.get(key) ?? null;
}

export function isApprovedInput(key: string): key is ApprovedInputKey {
  return BY_KEY.has(key);
}

/**
 * Words that mark a field Assay must never read, whatever it is mapped to.
 * Matched against whole words of the field name, so "language" is caught but
 * "page" is not.
 */
export const BLOCKED_INPUT_TERMS = [
  "name",
  "first",
  "last",
  "surname",
  "gender",
  "sex",
  "age",
  "dob",
  "birth",
  "birthday",
  "birthdate",
  "race",
  "ethnicity",
  "ethnic",
  "religion",
  "religious",
  "language",
  "nationality",
  "citizenship",
  "disability",
  "disabled",
  "zip",
  "zipcode",
  "postal",
  "postcode",
  "income",
  "salary",
  "wage",
  "wealth",
  "net",
  "worth",
  "credit",
  "health",
  "medical",
  "condition",
  "diagnosis",
  "medication",
  "pregnant",
  "pregnancy",
  "marital",
  "married",
  "spouse",
  "children",
  "kids",
  "family",
  "minimum",
  "minor",
] as const;

function words(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when a source field name looks like a protected attribute or a stand-in for one. */
export function isBlockedFieldName(name: string): boolean {
  const parts = words(name);
  const blocked = new Set<string>(BLOCKED_INPUT_TERMS);
  if (parts.some((part) => blocked.has(part))) return true;
  const joined = parts.join("");
  return ["zipcode", "postalcode", "dateofbirth", "networth", "householdincome"].some((term) => joined.includes(term));
}

export type FieldMapEntry = { source: string; input: string };

export type FieldMapCheck = {
  accepted: Array<{ source: string; input: ApprovedInputKey }>;
  /** Mapped to something that is not an approved input, or from a blocked field. Ignored and reported. */
  ignored: Array<{ source: string; input: string; reason: "not_approved" | "blocked_field" }>;
};

/** Split a workspace's field map into what Assay may read and what it ignores. */
export function checkFieldMap(entries: FieldMapEntry[]): FieldMapCheck {
  const accepted: FieldMapCheck["accepted"] = [];
  const ignored: FieldMapCheck["ignored"] = [];
  for (const entry of entries) {
    const source = entry.source.trim();
    const input = entry.input.trim();
    if (!source) continue;
    if (isBlockedFieldName(source)) {
      ignored.push({ source, input, reason: "blocked_field" });
    } else if (!isApprovedInput(input)) {
      ignored.push({ source, input, reason: "not_approved" });
    } else {
      accepted.push({ source, input });
    }
  }
  return { accepted, ignored };
}
