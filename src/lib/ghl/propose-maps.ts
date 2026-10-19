import { approvedInput, isBlockedFieldName, type ApprovedInputKey } from "@/lib/assay/inputs";

/**
 * A field as it exists in the connected CRM, with whatever real answers we
 * found on recent contacts. The samples are the whole point: a mapping the
 * user cannot see an example of is a mapping they cannot check.
 */
export type LiveField = {
  id: string;
  name: string;
  key?: string;
  samples: string[];
};

/** The approved inputs a CRM field can fill. Assay reads nothing else from a form. */
export const MAPPABLE_INPUTS = [
  "property_owner",
  "in_service_area",
  "travel_distance",
  "estimated_value",
  "decision_maker",
  "target_client",
  "high_value_interest",
] as const satisfies readonly ApprovedInputKey[];

export type MappableInput = (typeof MAPPABLE_INPUTS)[number];

export function isMappableInput(value: string): value is MappableInput {
  return (MAPPABLE_INPUTS as readonly string[]).includes(value);
}

export type ProposedMap = {
  fieldId: string;
  fieldKey: string | null;
  /** The CRM's own name for the field. Never our name for it. */
  fieldName: string;
  input: MappableInput;
  /** A real answer someone gave, or null when no contact has answered yet. */
  example: string | null;
  /** How sure we are, which decides whether it is pre-checked. */
  confident: boolean;
};

/**
 * Words that mean each input, in the language a form actually uses. Only the
 * question's own name is read. Answers that look like money are never taken
 * as a value, because they may be about the person rather than the job.
 */
const INPUT_HINTS: Array<{ input: MappableInput; phrases: string[] }> = [
  { input: "property_owner", phrases: ["own or rent", "homeowner", "home owner", "do you own", "owner occupied", "property owner"] },
  { input: "in_service_area", phrases: ["service area", "in our area", "serviceable", "area we serve"] },
  { input: "travel_distance", phrases: ["distance", "miles away", "how far"] },
  { input: "estimated_value", phrases: ["job value", "project value", "estimated value", "deal value", "quote amount", "job size"] },
  { input: "decision_maker", phrases: ["decision maker", "who decides", "make the decision", "sign off", "who else"] },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function inputFromName(name: string, key: string | null): MappableInput | null {
  const haystack = `${normalize(name)} ${normalize(key ?? "")}`;
  for (const hint of INPUT_HINTS) {
    for (const phrase of hint.phrases) {
      if (haystack.includes(phrase)) return hint.input;
    }
  }
  return null;
}

/**
 * Propose one mapping per field we can place from its name. A field that
 * looks like a personal detail (a name, age, zip code, income, health) is
 * never proposed, whatever it is called.
 */
export function proposeFieldMaps(fields: LiveField[]): ProposedMap[] {
  const out: ProposedMap[] = [];
  const claimed = new Set<MappableInput>();
  for (const field of fields) {
    const key = field.key ?? null;
    if (isBlockedFieldName(field.name) || (key && isBlockedFieldName(key))) continue;
    const input = inputFromName(field.name, key);
    if (!input || claimed.has(input)) continue;
    claimed.add(input);
    out.push({
      fieldId: field.id,
      fieldKey: key,
      fieldName: field.name,
      input,
      example: field.samples.find((value) => value.trim().length > 0) ?? null,
      confident: true,
    });
  }
  return out;
}

export function inputPlain(input: MappableInput): string {
  return (approvedInput(input)?.label ?? input).toLowerCase();
}

/** The mapping as a sentence, which is the only form most people will read. */
export function mappingSentence(map: Pick<ProposedMap, "fieldName" | "input" | "example">): string {
  const base = `We'll read “${map.fieldName}” as: ${inputPlain(map.input)}.`;
  return map.example ? `${base} Example answer: “${map.example}”.` : base;
}

/** Which inputs nothing was proposed for, so the screen can say so plainly. */
export function unmappedInputs(maps: ProposedMap[]): MappableInput[] {
  const claimed = new Set(maps.map((map) => map.input));
  return INPUT_HINTS.map((hint) => hint.input).filter((input) => !claimed.has(input));
}
