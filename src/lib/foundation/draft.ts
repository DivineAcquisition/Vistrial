import {
  stageKey,
  type BusinessHours,
  type FieldSource,
  type FieldValue,
  type RoleTargets,
  type Stage,
} from "@/lib/foundation/fields";

/**
 * Compass's Foundation draft. Built only from what the workspace already has:
 * the CRM stages and outcomes, the calendar, the answers given at setup, and
 * an industry default where nothing better exists. Every field carries its
 * source. Percentages from fewer than MIN_SAMPLE decided leads are not used.
 */

export const MIN_SAMPLE = 20;

export type DraftInputs = {
  profile: {
    offerName: string | null;
    offerType: string | null;
    pricePointCents: number | null;
    salesCycleDays: number | null;
    statedCloseRatePct: number | null;
    stageMeanings: Array<{ crm_stage: string; means: string | null }>;
    goalMetric: string | null;
    goalValue: number | null;
    speedToLeadMinutes: number | null;
    channelPreference: string | null;
  } | null;
  crm: {
    /** Distinct CRM stages in use, most used first. */
    stages: Array<{ stage: string; count: number }>;
    won: number;
    decided: number;
    dealCents: number[];
  };
  calendar: { bookings90: number; medianDaysToBooking: number | null };
  responseMinutes: number | null;
};

export type DraftField = { value: FieldValue; source: FieldSource };

const OFFER_TO_TYPE: Record<string, string> = {
  coaching: "coach",
  consulting: "consultant",
  agency_service: "agency",
  done_for_you: "service_company",
  software: "saas",
  course: "coach",
  other: "other",
};

type IndustryDefaults = { cycleDays: number; closeRatePct: number; setter: RoleTargets; closer: RoleTargets };

const DEFAULTS: Record<string, IndustryDefaults> = {
  service_company: {
    cycleDays: 14,
    closeRatePct: 25,
    setter: { calls: 60, conversations: 15, followUps: 30, booked: 4, shows: 0, closes: 0 },
    closer: { calls: 0, conversations: 0, followUps: 20, booked: 0, shows: 12, closes: 3 },
  },
  saas: {
    cycleDays: 30,
    closeRatePct: 20,
    setter: { calls: 50, conversations: 12, followUps: 40, booked: 3, shows: 0, closes: 0 },
    closer: { calls: 0, conversations: 0, followUps: 25, booked: 0, shows: 10, closes: 2 },
  },
  coach: {
    cycleDays: 7,
    closeRatePct: 25,
    setter: { calls: 50, conversations: 15, followUps: 30, booked: 5, shows: 0, closes: 0 },
    closer: { calls: 0, conversations: 0, followUps: 15, booked: 0, shows: 15, closes: 4 },
  },
};

function defaultsFor(type: string | null): IndustryDefaults {
  return DEFAULTS[type ?? ""] ?? DEFAULTS.service_company;
}

const DEFAULT_STAGES: Stage[] = [
  { key: "new", label: "New", meaning: "Arrived and not reached yet.", crmStage: null },
  { key: "contacted", label: "Contacted", meaning: "A person on the team has reached them.", crmStage: null },
  { key: "booked", label: "Booked", meaning: "A sales call is on the calendar.", crmStage: null },
  { key: "showed", label: "Showed", meaning: "They attended the call.", crmStage: null },
  { key: "won", label: "Won", meaning: "They paid or signed.", crmStage: null },
  { key: "lost", label: "Lost", meaning: "They said no or went silent for good.", crmStage: null },
];

const DEFAULT_HOURS: BusinessHours = { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function draftFoundation(inputs: DraftInputs): Map<string, DraftField> {
  const out = new Map<string, DraftField>();
  const profile = inputs.profile;
  const set = (key: string, value: FieldValue, source: FieldSource) => out.set(key, { value, source });

  const type = profile?.offerType ? (OFFER_TO_TYPE[profile.offerType] ?? "other") : null;
  if (type) set("business.type", type, "owner");
  const defaults = defaultsFor(type);
  if (profile?.offerName) set("business.offers", [profile.offerName], "owner");

  const dealMedian = inputs.crm.dealCents.length >= 3 ? median(inputs.crm.dealCents) : null;
  if (dealMedian) {
    set("business.price_cents", dealMedian, "crm");
    set("goal.avg_deal_cents", dealMedian, "crm");
  } else if (profile?.pricePointCents) {
    set("business.price_cents", profile.pricePointCents, "owner");
    set("goal.avg_deal_cents", profile.pricePointCents, "owner");
  }

  if (inputs.calendar.medianDaysToBooking && inputs.calendar.bookings90 >= MIN_SAMPLE) {
    set("business.sales_cycle_days", Math.max(1, Math.min(365, inputs.calendar.medianDaysToBooking)), "calendar");
  } else if (profile?.salesCycleDays) {
    set("business.sales_cycle_days", profile.salesCycleDays, "owner");
  } else {
    set("business.sales_cycle_days", defaults.cycleDays, "industry_default");
  }

  set("goal.period", "month", profile?.goalMetric ? "owner" : "industry_default");
  if (profile?.goalMetric === "revenue_per_month" && profile.goalValue) {
    set("goal.revenue_cents", Math.round(profile.goalValue * 100), "owner");
  }

  let closeRate: number;
  if (inputs.crm.decided >= MIN_SAMPLE) {
    closeRate = Math.max(1, Math.min(100, Math.round((inputs.crm.won / inputs.crm.decided) * 100)));
    set("goal.close_rate_pct", closeRate, "crm");
  } else if (profile?.statedCloseRatePct) {
    closeRate = Math.max(1, Math.min(100, Math.round(profile.statedCloseRatePct)));
    set("goal.close_rate_pct", closeRate, "owner");
  } else {
    closeRate = defaults.closeRatePct;
    set("goal.close_rate_pct", closeRate, "industry_default");
  }

  const revenue = out.get("goal.revenue_cents")?.value;
  const avg = out.get("goal.avg_deal_cents")?.value;
  if (typeof revenue === "number" && typeof avg === "number" && avg > 0) {
    set("goal.deals_needed", Math.max(1, Math.ceil(revenue / avg)), "compass");
  } else if (profile?.goalMetric === "clients_per_month" && profile.goalValue) {
    set("goal.deals_needed", Math.max(1, Math.round(profile.goalValue)), "owner");
  }

  set("team.routing", "crm_owner", "industry_default");

  const meanings = new Map((profile?.stageMeanings ?? []).map((row) => [row.crm_stage.toLowerCase(), row.means]));
  if (inputs.crm.stages.length) {
    const seen = new Set<string>();
    const stages: Stage[] = [];
    for (const row of inputs.crm.stages.slice(0, 15)) {
      const key = stageKey(row.stage);
      if (seen.has(key)) continue;
      seen.add(key);
      stages.push({ key, label: row.stage, meaning: meanings.get(row.stage.toLowerCase()) ?? "", crmStage: row.stage });
    }
    set("pipeline.stages", stages, "crm");
  } else {
    set("pipeline.stages", DEFAULT_STAGES, "industry_default");
  }

  set("targets.setter", defaults.setter, "industry_default");
  set("targets.closer", defaults.closer, "industry_default");
  set("rules.business_hours", DEFAULT_HOURS, "industry_default");
  const response = inputs.responseMinutes ?? profile?.speedToLeadMinutes ?? null;
  set("rules.response_minutes", response ?? 15, response ? "owner" : "industry_default");
  const channels = profile?.channelPreference === "email" ? ["email", "call"] : ["text", "email", "call"];
  set("rules.channels", channels, profile?.channelPreference ? "owner" : "industry_default");

  return out;
}
