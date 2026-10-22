/**
 * The Foundation (Prompt 26, Part 3): what the business is trying to achieve.
 * Every field is structured and versioned. Compass drafts, the Owner edits
 * and confirms, and nothing runs off a field until a confirmed version has it.
 */

export const FOUNDATION_SECTIONS = [
  { id: "business", title: "Business", description: "What you sell and how long it takes." },
  { id: "goal", title: "Goal", description: "What this period has to produce." },
  { id: "ideal_customer", title: "Ideal customer", description: "Who you sell to. Approved fields only." },
  { id: "team", title: "Team", description: "Who works the leads and how they are shared." },
  { id: "pipeline", title: "Pipeline", description: "Your stages and what each one means." },
  { id: "targets", title: "Targets", description: "Activity and outcome targets per role." },
  { id: "rules", title: "Rules", description: "Hours, response windows and channels." },
] as const;

export type FoundationSection = (typeof FOUNDATION_SECTIONS)[number]["id"];

export const FIELD_SOURCES = ["crm", "calendar", "transcripts", "industry_default", "compass", "owner"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

export const SOURCE_LABEL: Record<FieldSource, string> = {
  crm: "From your CRM",
  calendar: "From your calendar",
  transcripts: "From your calls",
  industry_default: "Industry default",
  compass: "Compass suggestion",
  owner: "Set by you",
};

export const BUSINESS_TYPES = ["service_company", "saas", "coach", "consultant", "agency", "other"] as const;
export const GOAL_PERIODS = ["month", "quarter", "year"] as const;
export const COMPANY_SIZES = ["solo", "2_10", "11_50", "51_200", "201_plus", "any"] as const;
export const ROUTING_RULES = ["round_robin", "by_source", "crm_owner", "manual"] as const;
export const CHANNELS = ["text", "email", "call", "dm"] as const;

export type Stage = { key: string; label: string; meaning: string; crmStage: string | null };
export type RoleTargets = { calls: number; conversations: number; followUps: number; booked: number; shows: number; closes: number };
export type BusinessHours = { start: string; end: string; days: number[] };

export type FieldKind = "choice" | "text" | "number" | "money" | "percent" | "list" | "stages" | "targets" | "hours" | "channels";

export type FieldSpec = {
  key: string;
  section: FoundationSection;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  help?: string;
  /** The Owner must set it. Compass never drafts it. */
  ownerOnly?: boolean;
  min?: number;
  max?: number;
};

export const FIELDS: FieldSpec[] = [
  { key: "business.type", section: "business", label: "Business type", kind: "choice", options: BUSINESS_TYPES },
  { key: "business.offers", section: "business", label: "Offers", kind: "list", help: "One per line." },
  { key: "business.price_cents", section: "business", label: "Main price point", kind: "money", min: 1 },
  { key: "business.sales_cycle_days", section: "business", label: "Sales cycle (days)", kind: "number", min: 1, max: 365 },
  { key: "goal.period", section: "goal", label: "Goal period", kind: "choice", options: GOAL_PERIODS },
  { key: "goal.revenue_cents", section: "goal", label: "Revenue goal", kind: "money", min: 1, ownerOnly: true },
  { key: "goal.avg_deal_cents", section: "goal", label: "Average deal value", kind: "money", min: 1 },
  { key: "goal.deals_needed", section: "goal", label: "Deals needed", kind: "number", min: 1, max: 100000 },
  { key: "goal.close_rate_pct", section: "goal", label: "Target close rate", kind: "percent", min: 1, max: 100 },
  { key: "icp.industries", section: "ideal_customer", label: "Industries", kind: "list", help: "One per line." },
  { key: "icp.company_size", section: "ideal_customer", label: "Company size", kind: "choice", options: COMPANY_SIZES },
  { key: "icp.roles", section: "ideal_customer", label: "Buyer roles", kind: "list", help: "Job titles, one per line." },
  { key: "icp.regions", section: "ideal_customer", label: "Regions served", kind: "list", help: "States or countries. Not a zip code on its own." },
  { key: "icp.problems", section: "ideal_customer", label: "Problems they come with", kind: "list" },
  { key: "team.routing", section: "team", label: "How leads are shared", kind: "choice", options: ROUTING_RULES },
  { key: "pipeline.stages", section: "pipeline", label: "Stages", kind: "stages" },
  { key: "targets.setter", section: "targets", label: "Setter targets per day", kind: "targets" },
  { key: "targets.closer", section: "targets", label: "Closer targets per week", kind: "targets" },
  { key: "rules.business_hours", section: "rules", label: "Business hours", kind: "hours" },
  { key: "rules.response_minutes", section: "rules", label: "Response window (minutes)", kind: "number", min: 1, max: 10080 },
  { key: "rules.channels", section: "rules", label: "Channels allowed", kind: "channels" },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

export const CHOICE_LABEL: Record<string, string> = {
  service_company: "Service company",
  saas: "SaaS",
  coach: "Coach",
  consultant: "Consultant",
  agency: "Agency",
  other: "Other",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
  solo: "Just the owner",
  "2_10": "2 to 10 people",
  "11_50": "11 to 50 people",
  "51_200": "51 to 200 people",
  "201_plus": "More than 200 people",
  any: "Any size",
  round_robin: "Take turns",
  by_source: "By lead source",
  crm_owner: "Owner set in the CRM",
  manual: "A person assigns each lead",
  text: "Text",
  email: "Email",
  call: "Call",
  dm: "Direct message",
};

/**
 * Words that mark a protected attribute or an inferred trait. The ideal
 * customer may not be described by them (Prompt 26, Part 3).
 */
const BLOCKED_ICP = [
  /\bage[sd]?\b/i,
  /\byears? old\b/i,
  /\bunder \d+|over \d+\b/i,
  /\brace\b|\bethnic/i,
  /\breligio/i,
  /\bgender\b|\bmale\b|\bfemale\b|\bmen\b|\bwomen\b/i,
  /\bpregnan/i,
  /\bdisab/i,
  /\bhealth\b|\bmedical\b|\bdiagnos/i,
  /\bincome\b|\bwealthy\b|\brich\b|\bnet worth\b/i,
  /\bmarried\b|\bsingle\b|\bmarital/i,
  /\bnational origin\b|\bimmigra/i,
  /\bsexual orientation\b|\bgay\b|\blesbian\b|\bstraight\b/i,
];

export function icpProblem(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{5}(-\d{4})?$/.test(trimmed)) return "A zip code on its own cannot describe your customer. Use a region instead.";
  if (BLOCKED_ICP.some((pattern) => pattern.test(trimmed))) {
    return "Describe customers by business, role, region or problem, not by personal traits.";
  }
  return null;
}

export type FieldValue = string | number | string[] | Stage[] | RoleTargets | BusinessHours | null;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNumberIn(value: unknown, spec: FieldSpec): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (spec.min !== undefined && value < spec.min) return false;
  if (spec.max !== undefined && value > spec.max) return false;
  return true;
}

/** Checks one value against its field. Returns a plain problem, or null when it is fine. */
export function fieldProblem(key: string, value: unknown): string | null {
  const spec = FIELD_BY_KEY.get(key);
  if (!spec) return "That field does not exist.";
  if (value === null) return null;
  switch (spec.kind) {
    case "choice":
      return typeof value === "string" && spec.options?.includes(value) ? null : "Pick one of the options.";
    case "text":
      return typeof value === "string" && value.length <= 500 ? null : "Keep it under 500 characters.";
    case "number":
    case "money":
    case "percent":
      return isNumberIn(value, spec) ? null : "That number is out of range.";
    case "list": {
      if (!Array.isArray(value) || value.length > 30 || value.some((item) => typeof item !== "string" || item.trim() === "" || item.length > 120)) {
        return "Up to 30 short lines.";
      }
      if (spec.section === "ideal_customer") {
        for (const item of value as string[]) {
          const problem = icpProblem(item);
          if (problem) return problem;
        }
      }
      return null;
    }
    case "channels":
      return Array.isArray(value) && value.every((item) => (CHANNELS as readonly string[]).includes(item)) ? null : "Pick from the channels listed.";
    case "stages": {
      if (!Array.isArray(value) || value.length === 0 || value.length > 15) return "Between 1 and 15 stages.";
      const keys = new Set<string>();
      for (const stage of value as Stage[]) {
        if (!stage || typeof stage.label !== "string" || !stage.label.trim() || typeof stage.key !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(stage.key)) {
          return "Every stage needs a name.";
        }
        if (keys.has(stage.key)) return "Two stages have the same name.";
        keys.add(stage.key);
        if (typeof stage.meaning !== "string" || stage.meaning.length > 200) return "Keep each meaning under 200 characters.";
      }
      return null;
    }
    case "targets": {
      const targets = value as RoleTargets;
      const keys: Array<keyof RoleTargets> = ["calls", "conversations", "followUps", "booked", "shows", "closes"];
      return keys.every((name) => Number.isInteger(targets?.[name]) && targets[name] >= 0 && targets[name] <= 10000) ? null : "Targets are whole numbers.";
    }
    case "hours": {
      const hours = value as BusinessHours;
      if (!hours || !HM.test(hours.start) || !HM.test(hours.end) || hours.start >= hours.end) return "Opening time comes before closing time.";
      if (!Array.isArray(hours.days) || hours.days.length === 0 || hours.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        return "Pick at least one day.";
      }
      return null;
    }
  }
}

export function stageKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : `stage_${key}`.slice(0, 40);
}

export type StoredField = { key: string; value: FieldValue; source: FieldSource; status: "drafted" | "edited" | "confirmed" };

export type FoundationState = {
  fields: Map<string, StoredField>;
  version: { version: number; confirmedAt: string; note: string } | null;
};

/** What the "Confirm your foundation" card counts. */
export function confirmationCounts(state: FoundationState): { drafted: number; needsOwner: number; confirmed: number; total: number } {
  let drafted = 0;
  let needsOwner = 0;
  let confirmed = 0;
  for (const spec of FIELDS) {
    const stored = state.fields.get(spec.key);
    if (!stored || stored.value === null) {
      needsOwner += 1;
      continue;
    }
    if (stored.status === "confirmed") confirmed += 1;
    else if (stored.status === "drafted") drafted += 1;
    else needsOwner += 1;
  }
  return { drafted, needsOwner, confirmed, total: FIELDS.length };
}

/** A foundation is confirmed when the latest version exists and no field changed since. */
export function isConfirmed(state: FoundationState): boolean {
  if (!state.version) return false;
  for (const stored of state.fields.values()) if (stored.status !== "confirmed") return false;
  return true;
}
