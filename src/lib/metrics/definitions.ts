import { REVENUE_LIFECYCLE_LABELS } from "@/lib/home/metrics";

/**
 * The one list of portal numbers. Home, Results, the drill-through lists, and
 * exports all read these ids, and every one is computed by
 * public.portal_metric_rows() in the database. The `explain` text is what
 * "How is this calculated?" shows, so it has to match that function.
 */

export type MetricUnit = "count" | "duration" | "money";

/** Which part of the aggregate the number is. */
export type MetricMeasure = "count" | "leads" | "median" | "sum";

export type MetricDefinition = {
  id: string;
  label: string;
  explain: string;
  unit: MetricUnit;
  measure: MetricMeasure;
  /** Describes right now, so the range and comparison do not apply. */
  now?: boolean;
  lowerIsBetter?: boolean;
  /** Drill-through rows read "N rows" rather than "N leads" when a lead can appear twice. */
  rowsAreEvents?: boolean;
};

const defs = <T extends Record<string, Omit<MetricDefinition, "id">>>(input: T) =>
  Object.fromEntries(Object.entries(input).map(([id, def]) => [id, { id, ...def }])) as {
    [K in keyof T]: MetricDefinition & { id: K };
  };

export const METRICS = defs({
  new_leads: {
    label: "New leads",
    explain:
      "Leads whose opt-in time falls in the range. Practice leads and leads merged into another record are left out.",
    unit: "count",
    measure: "count",
  },
  response_decided: {
    label: "New leads with a response result",
    explain:
      "New leads in the range where Sentry has decided the first response: answered inside the window, answered late, or missed.",
    unit: "count",
    measure: "count",
  },
  response_within: {
    label: "Answered inside the response window",
    explain:
      "New leads in the range whose first human reply landed inside your response window. Leads still waiting are not counted until their window decides.",
    unit: "count",
    measure: "count",
  },
  response_late: {
    label: "Answered late or missed",
    explain: "New leads in the range whose first reply came after the response window, or never came before it closed.",
    unit: "count",
    measure: "count",
  },
  first_touch_time: {
    label: "Typical first response",
    explain:
      "The median time from a new lead's opt-in to the first human reply, for leads in the range that have been answered. Half were faster, half slower.",
    unit: "duration",
    measure: "median",
    lowerIsBetter: true,
  },
  follow_up_gaps: {
    label: "Follow-ups due",
    explain: "Follow-up deadlines that came due in the range and were either kept or missed.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  follow_up_on_time: {
    label: "Follow-ups on time",
    explain: "Follow-up deadlines in the range that someone met before the gap ran out.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  at_risk_now: {
    label: "At risk right now",
    explain: "Leads whose response or follow-up deadline is close and nobody has replied yet.",
    unit: "count",
    measure: "leads",
    now: true,
  },
  missed_now: {
    label: "Missed and still open",
    explain: "Leads whose response or follow-up deadline has passed and nobody has replied yet.",
    unit: "count",
    measure: "leads",
    now: true,
  },
  open_leads: {
    label: "Open leads",
    explain: "Leads in any stage that is not won, lost, or gone quiet. Practice leads are left out.",
    unit: "count",
    measure: "count",
    now: true,
  },
  open_band: {
    label: "Open leads in this band",
    explain: "Open leads whose case file sits in the readiness band named, by your workspace's band names and scores.",
    unit: "count",
    measure: "count",
    now: true,
  },
  hot_open: {
    label: "Ready now",
    explain:
      "Open leads whose case file sits in your highest readiness band, using the band names and scores your workspace is set up with.",
    unit: "count",
    measure: "count",
    now: true,
  },
  band_moves: {
    label: "Readiness changes",
    explain: "Times a case file moved from one readiness band to another in the range.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  stage_moves: {
    label: "Stage changes",
    explain: "Times a lead moved from one stage to another in the range, from your CRM or from your team.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  bookings: {
    label: "Calls booked",
    explain: "Calls with a scheduled time that were booked in the range, counted on the day they were booked.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  revenue: {
    label: "Revenue",
    explain:
      "Sales recorded in the range, less refunds and chargebacks. Failed payments are left out. Only what your payment source reports is counted.",
    unit: "money",
    measure: "sum",
    rowsAreEvents: true,
  },
  objections: {
    label: "Objections raised",
    explain: "Objections recorded on calls in the range, open or resolved.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  scribe_updated: {
    label: "Case files built or updated",
    explain: "Leads whose case file Scribe built or updated in the range. A lead updated twice counts once.",
    unit: "count",
    measure: "count",
  },
  scribe_review: {
    label: "Case files flagged for review",
    explain: "Case files Scribe was not sure about and set aside for a person to check.",
    unit: "count",
    measure: "count",
    now: true,
  },
  alerts_raised: {
    label: "Alerts raised",
    explain: "Nudges and escalations Sentry raised in the range.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  alerts_acknowledged: {
    label: "Alerts acknowledged",
    explain: "Alerts raised in the range that someone acknowledged.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  alerts_open_now: {
    label: "Alerts nobody has picked up",
    explain: "Sentry alerts that are open and not yet acknowledged.",
    unit: "count",
    measure: "count",
    now: true,
  },
  follow_ups_watched: {
    label: "Follow-ups watched",
    explain: "Follow-up clocks Sentry was running at any point in the range.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  relay_prepared: {
    label: "Messages drafted",
    explain: "Messages Relay drafted in the range. Practice drafts are left out. Every draft waits for a person.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  relay_approved_unchanged: {
    label: "Approved as written",
    explain: "Drafts from the range a person approved without changing a word.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  relay_edited: {
    label: "Approved after edits",
    explain: "Drafts from the range a person changed before approving.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  relay_rejected: {
    label: "Turned down",
    explain: "Drafts from the range a person decided not to send.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  relay_sent: {
    label: "Marked sent",
    explain: "Drafts from the range a person approved and then marked as sent from your CRM.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  drafts_waiting: {
    label: "Drafts waiting for approval",
    explain: "Relay drafts that are waiting for someone who can approve them.",
    unit: "count",
    measure: "count",
    now: true,
  },
  gone_quiet: {
    label: "Gone quiet",
    explain:
      "Open leads in a consultation, follow-up, objection, or gone-quiet stage with no recorded movement for at least 3 days. Grouped by how long they have been quiet.",
    unit: "count",
    measure: "count",
    now: true,
  },
  gone_quiet_value: {
    label: "Recorded value on quiet leads",
    explain:
      "The deal value recorded on those quiet leads, where a connected tool or the case file has a number. Missing values are left out.",
    unit: "money",
    measure: "sum",
    now: true,
  },
  gone_quiet_reply_after: {
    label: "Reply recorded after",
    explain:
      "Quiet leads that later had a reply recorded. This is a count of what was recorded afterward. It does not say the follow-up caused the reply.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  gone_quiet_booking_after: {
    label: "Booking recorded after",
    explain:
      "Quiet leads that later had a call booked. This is a count of what was recorded afterward. It does not say a follow-up caused the booking.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  after_hours_first_touch: {
    label: "First response by hours",
    explain:
      "New leads whose first measured human reply landed inside or outside the workspace's business hours. Use the after_hours or in_hours detail to split them.",
    unit: "count",
    measure: "count",
  },
  approval_time: {
    label: "Time to approve",
    explain: "The median time from a Relay draft being ready until someone decided it, for decisions in the range.",
    unit: "duration",
    measure: "median",
    lowerIsBetter: true,
    rowsAreEvents: true,
  },
  approval_expired: {
    label: "Approvals that expired",
    explain: "Relay drafts in the range that expired before anyone decided them.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  tasks_open: {
    label: "Tasks open",
    explain: "Open tasks on leads. Owners and the Vistrial team only. The count follows assignment, not a score.",
    unit: "count",
    measure: "count",
    now: true,
    rowsAreEvents: true,
  },
  tasks_overdue: {
    label: "Tasks overdue",
    explain: "Open tasks whose due time has passed. Owners and the Vistrial team only.",
    unit: "count",
    measure: "count",
    now: true,
    rowsAreEvents: true,
  },
  touches_logged: {
    label: "Touches logged",
    explain: "Touches recorded in the range. The count is metadata only. Message text is not part of this number.",
    unit: "count",
    measure: "count",
    rowsAreEvents: true,
  },
  coverage_sources: {
    label: "Sources connected",
    explain: "Connections that are active right now, including the CRM.",
    unit: "count",
    measure: "count",
    now: true,
    rowsAreEvents: true,
  },
  coverage_stale: {
    label: "Sources that need a check",
    explain: "Connections that are broken, or active but not verified in the last 48 hours.",
    unit: "count",
    measure: "count",
    now: true,
    rowsAreEvents: true,
  },
  coverage_with_calls: {
    label: "New leads with a call record",
    explain: "New leads in the range that have at least one call record.",
    unit: "count",
    measure: "count",
  },
  coverage_manual: {
    label: "New leads entered directly",
    explain: "New leads in the range whose source is empty, manual, direct, or the API, rather than a named tool.",
    unit: "count",
    measure: "count",
  },
  coverage_unmatched: {
    label: "Items waiting for review",
    explain: "Inbound items for this workspace that are still waiting to be matched.",
    unit: "count",
    measure: "count",
    now: true,
    rowsAreEvents: true,
  },
});

export type MetricId = keyof typeof METRICS;

/** A metric id with an optional parameter, like open_leads:working or band_moves:Warm>Hot. */
export function metricBase(metric: string): string {
  return metric.split(":")[0] ?? metric;
}

export function isMetricRef(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 120) return false;
  return Object.prototype.hasOwnProperty.call(METRICS, metricBase(value));
}

export function metricDefinition(metric: string): MetricDefinition {
  return METRICS[metricBase(metric) as MetricId];
}

/**
 * Shares are a pair of metrics, never a stored percentage, so the share and
 * the counts under it always agree.
 */
export type ShareDefinition = {
  id: string;
  label: string;
  explain: string;
  numerator: MetricId;
  denominator: MetricId;
  /** The list a person opens to see what pulled the share down. */
  drill: MetricId;
};

export const SHARES = {
  response_rate: {
    id: "response_rate",
    label: "Answered inside the window",
    explain:
      "Of the new leads in the range whose first response has been decided, the share answered inside your response window. Leads still inside their window are not counted yet.",
    numerator: "response_within",
    denominator: "response_decided",
    drill: "response_late",
  },
  follow_up_rate: {
    id: "follow_up_rate",
    label: "Follow-ups kept on time",
    explain: "Of the follow-up deadlines that came due in the range, the share someone met in time.",
    numerator: "follow_up_on_time",
    denominator: "follow_up_gaps",
    drill: "follow_up_gaps",
  },
  approved_unchanged_rate: {
    id: "approved_unchanged_rate",
    label: "Drafts approved as written",
    explain: "Of the drafts from the range that were approved, the share nobody needed to change.",
    numerator: "relay_approved_unchanged",
    denominator: "relay_prepared",
    drill: "relay_edited",
  },
} as const satisfies Record<string, ShareDefinition>;

export type ShareId = keyof typeof SHARES;

/** Below this many, a share or median is shown with a note that it is too few to read much into. */
export const SMALL_SAMPLE = 10;

/** Comparisons between periods need at least this many rows on both sides. */
export const COMPARISON_MIN = 20;

export function comparisonAllowed(current: number | null | undefined, previous: number | null | undefined): boolean {
  return typeof current === "number" && current >= COMPARISON_MIN && typeof previous === "number" && previous >= COMPARISON_MIN;
}

export function isSmallSample(denominator: number | null | undefined): boolean {
  return typeof denominator === "number" && denominator > 0 && denominator < SMALL_SAMPLE;
}

export const STAGE_LABELS: Record<string, string> = {
  new: "New",
  working: "Working",
  call_booked: "Call booked",
  no_show: "No-show",
  follow_up: "Follow-up",
  objection_hold: "Objection on hold",
  ghost: "Gone quiet",
  closed_won: "Won",
  closed_lost: "Lost",
  none: "No stage",
};

export const OPEN_STAGES = ["new", "working", "call_booked", "no_show", "follow_up", "objection_hold"] as const;

export const OBJECTION_LABELS: Record<string, string> = {
  price: "Price",
  timing: "Timing",
  spouse_partner: "Needs to ask someone",
  trust: "Trust",
  fit: "Fit",
  competitor: "Comparing options",
  other: "Other",
};

export function stageLabel(key: string): string {
  return STAGE_LABELS[key] ?? key.replace(/_/g, " ");
}

const DETAIL_WORDS: Record<string, string> = {
  within: "Answered in time",
  late: "Late",
  missed: "Missed",
  on_time: "On time",
  first_touch: "First response",
  follow_up: "Follow-up",
  built: "Built",
  updated: "Updated",
  needs_review: "Needs a check",
  sent: "Marked sent",
  rejected: "Turned down",
  approved: "Approved",
  pending: "Waiting for approval",
  nudge: "Nudge",
  escalation: "Escalation",
  at_risk: "At risk",
  resolved: "Resolved",
  paused: "Paused",
};

function words(key: string): string {
  return DETAIL_WORDS[key] ?? STAGE_LABELS[key] ?? OBJECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

/** The short label under a lead in a drill-through list. */
export function detailLabel(metric: string, detail: string | null): string | null {
  if (!detail) return null;
  const base = metric.split(":")[0];
  if (base === "bookings" || base === "drafts_waiting") return null;
  if (base === "stage_moves") return moveLabel(detail);
  if (base === "band_moves") return moveLabel(detail, (part) => (part === "none" ? "No band" : part));
  if (base === "objections") {
    const [type, state] = detail.split(":");
    return `${words(type ?? "other")}${state === "resolved" ? ", resolved" : ""}`;
  }
  if (base === "alerts_raised" || base === "alerts_acknowledged") {
    const [kind] = detail.split(":");
    return words(kind ?? "");
  }
  if (base === "revenue") return REVENUE_LIFECYCLE_LABELS[detail as keyof typeof REVENUE_LIFECYCLE_LABELS] ?? words(detail);
  if (base === "gone_quiet" || base === "gone_quiet_value") {
    const bands: Record<string, string> = {
      "3_7": "Quiet 3 to 7 days",
      "8_14": "Quiet 8 to 14 days",
      "15_21": "Quiet 15 to 21 days",
      over_21: "Quiet more than 21 days",
    };
    return bands[detail] ?? words(detail);
  }
  if (base === "after_hours_first_touch") return detail === "after_hours" ? "Outside business hours" : "Inside business hours";
  if (base === "open_band" || base === "hot_open") return detail === "none" ? "No band" : detail;
  return words(detail);
}

/** "working>call_booked" as words. */
export function moveLabel(key: string, label: (part: string) => string = stageLabel): string {
  const [from, to] = key.split(">");
  if (!to) return label(key);
  return `${label(from ?? "none")} to ${label(to)}`;
}
