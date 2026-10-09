/**
 * What Relay may say, each traced to where it came from. Relay writes only
 * from these; the checks refuse a draft that cites anything else.
 */

export type RelayChannel = "sms" | "email";

export type FactSensitivity = "financial" | "health" | "legal" | "personal";

export type RelayFact = {
  key: string;
  label: string;
  value: string;
  source: "lead" | "case_file" | "workspace";
  /** The words from the call this came from, when there are any. */
  quote: string | null;
  sensitivity: FactSensitivity | null;
};

export type CaseFieldRow = {
  field_key: string;
  label: string;
  value: unknown;
  state: string;
  quote: string | null;
};

const SENSITIVE_PATTERNS: Array<{ kind: FactSensitivity; re: RegExp }> = [
  { kind: "health", re: /\b(health|medical|diagnos\w*|illness|sick|pregnan\w*|therap\w*|medication|disabilit\w*|injur\w*|surgery|mental)\b/i },
  { kind: "legal", re: /\b(lawsuit|legal|attorney|lawyer|court|arrest\w*|criminal|divorce|bankrupt\w*)\b/i },
  {
    kind: "financial",
    re: /\b(budget|income|salary|revenue|debt|credit|loan|savings|net worth|afford\w*|price|cost|invest\w*|money|\$\s?\d)/i,
  },
  { kind: "personal", re: /\b(ssn|social security|passport|date of birth|birthday|religio\w*|immigra\w*)\b/i },
];

export function factSensitivity(text: string): FactSensitivity | null {
  for (const { kind, re } of SENSITIVE_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

/**
 * Texts are read on lock screens and shared phones, so nothing sensitive goes
 * in one. Email may mention money the lead raised, never health or legal.
 */
export function allowedOnChannel(fact: RelayFact, channel: RelayChannel): boolean {
  if (!fact.sensitivity) return true;
  if (channel === "sms") return false;
  return fact.sensitivity === "financial";
}

export function formatFactValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    const parts = value.map(formatFactValue).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return formatFactValue(record.value ?? record.text ?? record.label ?? null);
  }
  return null;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function buildFacts(input: {
  lead: { first_name: string | null; offer_name: string | null };
  caseFile: { summary: string | null; next_step: string | null } | null;
  fields: CaseFieldRow[];
  businessName: string | null;
  senderName: string | null;
}): RelayFact[] {
  const facts: RelayFact[] = [];
  const add = (fact: Omit<RelayFact, "sensitivity"> & { sensitivity?: FactSensitivity | null }) => {
    const value = clip(fact.value, 400);
    if (!value) return;
    facts.push({ ...fact, value, sensitivity: fact.sensitivity ?? factSensitivity(`${fact.label} ${value}`) });
  };

  if (input.lead.first_name?.trim()) {
    add({ key: "lead.first_name", label: "Lead's first name", value: input.lead.first_name, source: "lead", quote: null, sensitivity: null });
  }
  if (input.lead.offer_name?.trim()) {
    add({ key: "lead.offer", label: "What they asked about", value: input.lead.offer_name, source: "lead", quote: null });
  }
  if (input.businessName?.trim()) {
    add({ key: "workspace.business_name", label: "Business name", value: input.businessName, source: "workspace", quote: null, sensitivity: null });
  }
  if (input.senderName?.trim()) {
    add({ key: "workspace.sender", label: "Messages come from", value: input.senderName, source: "workspace", quote: null, sensitivity: null });
  }
  if (input.caseFile?.next_step?.trim()) {
    add({ key: "case.next_step", label: "Agreed next step", value: input.caseFile.next_step, source: "case_file", quote: null });
  }
  if (input.caseFile?.summary?.trim()) {
    add({ key: "case.summary", label: "Call summary", value: input.caseFile.summary, source: "case_file", quote: null });
  }
  const seen = new Set(facts.map((fact) => fact.key));
  for (const field of input.fields) {
    if (field.state !== "present") continue;
    const key = `field.${field.field_key}`;
    if (seen.has(key)) continue;
    const value = formatFactValue(field.value);
    if (!value) continue;
    seen.add(key);
    add({ key, label: field.label || field.field_key, value, source: "case_file", quote: field.quote ? clip(field.quote, 300) : null });
    if (facts.length >= 30) break;
  }
  return facts;
}

export function factsForChannel(facts: RelayFact[], channel: RelayChannel): RelayFact[] {
  return facts.filter((fact) => allowedOnChannel(fact, channel));
}

/** Texts when there is a number to text, otherwise email. */
export function pickChannel(lead: { phone: string | null; email: string | null }): RelayChannel | null {
  if (lead.phone && /\d{7,}/.test(lead.phone.replace(/\D/g, ""))) return "sms";
  if (lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) return "email";
  return null;
}
