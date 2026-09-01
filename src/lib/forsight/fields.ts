import type { ForsightRecord } from "@/lib/forsight/types";
import { toMetricValue, type MetricValue } from "@/lib/forsight/values";

/**
 * Field names as they exist in the DA Pipeline base, read from the base rather
 * than remembered. Client bases are duplicated from the same master template,
 * so these names are the contract for every workspace.
 */

export const WEEKLY_SUMMARY_FIELDS = {
  week: "Week",
  weekStart: "Week Start Date",
  spend: "Total Spend",
  applications: "Applications Submitted",
  qualified: "Qualified",
  booked: "Audits Booked",
  held: "Audits Held",
  closed: "Closed Won",
  revenue: "Revenue Closed",
  notes: "Notes",
  costPerAuditHeld: "Cost per Audit Held",
  costPerBookedCall: "Cost per Booked Call",
  costPerApplication: "Cost per Application",
  cac: "CAC",
  roas: "ROAS",
} as const;

export const CREATIVE_FIELDS = {
  name: "Creative Name",
  status: "Status",
  campaign: "Campaign",
  spend: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  ctr: "CTR %",
  costPerLead: "Cost per Lead",
  costPerApplication: "Cost per Application",
  costPerQualifiedLead: "Cost per Qualified Lead",
  costPerAuditHeld: "Cost per Audit Held",
  cac: "CAC",
} as const;

export const LEAD_FIELDS = {
  name: "Lead Name",
  optInDate: "Opt-In Date",
  stage: "Stage",
  qualificationResult: "Qualification Result",
  readinessScore: "Readiness Score",
  humanTouches: "Human Touches",
  daysSinceTouch: "Days Since Touch",
  touchStatus: "Touch Status",
  nextAction: "Next Action",
  debriefMissing: "Debrief Missing",
  hoursToFirstHuman: "Hours to First Human Touch",
  auditBookedDate: "Audit Booked Date",
  auditOutcome: "Audit Outcome",
  noShowCount: "No-Show Count",
  isBooked: "Is Booked",
  isHeld: "Is Held",
  isClosedWon: "Is Closed Won",
  objection: "Objection",
} as const;

/** Closed revenue. Template table name: Deals. Not a dashboard dataset. */
export const DEAL_FIELDS = {
  date: "Date",
  amount: "Amount",
  type: "Type",
  status: "Status",
} as const;

/** One row per held call. Template table name: Call Debriefs. */
export const DEBRIEF_FIELDS = {
  callDate: "Call Date",
  objection: "Objection",
  outcome: "Outcome",
  owner: "Owner",
} as const;

/**
 * `Days Since Touch` is `IF(last touch is blank, 999, ...)`. 999 is a sentinel
 * for "never", and printing it as a number of days would be a lie.
 */
export const NEVER_TOUCHED_DAYS = 999;

/** `Qualification Result` values, straight off the formula. */
export const QUALIFIED = "Qualified";

/**
 * Stages that take a lead out of the working pipeline. Matches the branch
 * Airtable's own Next Action formula uses to stop nagging about a lead, plus
 * Recycled, which is the same thing by a gentler name.
 */
export const CLOSED_STAGES = new Set([
  "closed won",
  "closed lost",
  "disqualified",
  "recycled",
]);

/* ---------------------------------------------------------------------------
 * Readers
 *
 * Airtable omits empty fields from the payload, and returns a single select as
 * a bare string. The readers stay tolerant of the object form anyway, because
 * the cost of doing so is one line and the cost of being wrong is a page that
 * renders a select as "[object Object]".
 * ------------------------------------------------------------------------- */

export function readRaw(record: ForsightRecord, field: string): unknown {
  return record.fields[field];
}

export function readText(record: ForsightRecord, field: string): string {
  const raw = readRaw(record, field);
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  if (raw && typeof raw === "object" && "name" in raw) {
    const name = (raw as { name?: unknown }).name;
    return typeof name === "string" ? name.trim() : "";
  }
  return "";
}

export function readMetric(record: ForsightRecord, field: string): MetricValue {
  return toMetricValue(readRaw(record, field));
}

export function readCount(record: ForsightRecord, field: string): number | null {
  const value = readMetric(record, field);
  return value.kind === "number" ? value.value : null;
}

/** Airtable dates arrive as `YYYY-MM-DD`, which sorts correctly as a string. */
export function readDate(record: ForsightRecord, field: string): string | null {
  const raw = readRaw(record, field);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Touch Status and Next Action are decorated with emoji. Matching on the words
 * rather than the exact string means a change of icon in the base does not
 * quietly empty a section of this page.
 */
export function plainText(value: string): string {
  return value
    .replace(/[^\p{Letter}\p{Number}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Airtable writes these as "Closed Won"; Vistrial's core `lead_status` enum
 * writes the same thing as `closed_won`. Both adapters feed this, so the
 * separator is normalised — otherwise a closed core lead would read as still
 * in play and turn up in a queue asking someone to chase it.
 */
export function isClosedStage(stage: string): boolean {
  return CLOSED_STAGES.has(stage.trim().toLowerCase().replace(/[_-]+/g, " "));
}
