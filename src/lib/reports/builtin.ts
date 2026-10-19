import { AGENTS } from "@/lib/agents/roster";
import type { MetricId } from "@/lib/metrics/definitions";
import type { BreakdownDimension } from "@/lib/metrics/load";

export type BuiltInReport = {
  key: string;
  title: string;
  howToRead: string;
  metrics: MetricId[];
  breakdowns: Array<{ metric: MetricId; dimension: BreakdownDimension; title: string; people?: boolean }>;
  /** Owners and the Vistrial team only. */
  people?: boolean;
  note?: string;
};

export const SOURCE_ATTRIBUTION_NOTE =
  "Vistrial does not attribute leads to ads. Source labels come from your own tools.";

export const BUILT_IN_REPORTS: BuiltInReport[] = [
  {
    key: "weekly",
    title: "Weekly performance",
    howToRead:
      "Counts for the range you pick, next to the previous period when both sides have at least 20 records. A change is a difference in the count, not a cause.",
    metrics: ["new_leads", "first_touch_time", "follow_up_gaps", "follow_up_on_time", "bookings", "revenue"],
    breakdowns: [{ metric: "revenue", dimension: "detail", title: "Revenue by recorded type" }],
  },
  {
    key: "response",
    title: "Response health",
    howToRead:
      "Inside the window, late, and missed come from Sentry's decision on each new lead. Leads still inside their window are not in the rate yet.",
    metrics: ["response_within", "response_late", "at_risk_now", "missed_now", "first_touch_time", "after_hours_first_touch"],
    breakdowns: [
      { metric: "after_hours_first_touch", dimension: "detail", title: "First response inside and outside business hours" },
      { metric: "response_late", dimension: "day", title: "Late or missed by day" },
      { metric: "missed_now", dimension: "stage", title: "Missed leads by stage" },
    ],
  },
  {
    key: "quiet",
    title: "Gone quiet",
    howToRead:
      "These are leads with a consultation, follow-up, objection, or gone-quiet stage and no recorded movement. Bands are how long that has lasted. Replies and bookings are labeled recorded after. They are not credited as caused by a follow-up.",
    metrics: ["gone_quiet", "gone_quiet_value", "gone_quiet_reply_after", "gone_quiet_booking_after"],
    breakdowns: [{ metric: "gone_quiet", dimension: "detail", title: "How long they have been quiet" }],
    note: "Playbook starts are not listed yet. No playbook has run in this workspace.",
  },
  {
    key: "sources",
    title: "Lead sources",
    howToRead: SOURCE_ATTRIBUTION_NOTE,
    metrics: ["new_leads", "bookings", "revenue"],
    breakdowns: [
      { metric: "new_leads", dimension: "source", title: "Leads by source" },
      { metric: "bookings", dimension: "source", title: "Bookings by source" },
      { metric: "revenue", dimension: "source", title: "Recorded revenue by source" },
    ],
    note: SOURCE_ATTRIBUTION_NOTE,
  },
  {
    key: "objections",
    title: "Objections",
    howToRead: `Each objection is one recorded on a call. Resolved means someone marked it resolved. The list is the words your team and ${AGENTS.scribe.name} use, not a ranking of people.`,
    metrics: ["objections"],
    breakdowns: [{ metric: "objections", dimension: "detail", title: "Objections by type" }],
  },
  {
    key: "playbooks",
    title: "Playbook results",
    howToRead: "When a playbook runs, its results use the same sample rules as the rest of Reports. Nothing here claims a play caused a booking.",
    metrics: [],
    breakdowns: [],
    note: "No playbook has run in this workspace yet. This report will fill in from the playbook tables when they exist.",
  },
  {
    key: "approvals",
    title: "Agent activity and approvals",
    howToRead: `Drafts ${AGENTS.relay.name} prepared, and what a person did with them. Time to approve is the median wait for a decision.`,
    metrics: ["relay_prepared", "relay_approved_unchanged", "relay_edited", "relay_rejected", "approval_expired", "approval_time"],
    breakdowns: [],
  },
  {
    key: "workload",
    title: "Team workload and follow-through",
    howToRead:
      "Open leads, open tasks, overdue tasks, and touches logged. These counts reflect workload and how work is assigned, as well as effort. They are not scores and they are not a ranking.",
    metrics: ["open_leads", "tasks_open", "tasks_overdue", "touches_logged"],
    breakdowns: [
      { metric: "open_leads", dimension: "person", title: "Open leads by assigned person", people: true },
      { metric: "tasks_open", dimension: "person", title: "Open tasks by assigned person", people: true },
      { metric: "touches_logged", dimension: "person", title: "Touches logged by person", people: true },
    ],
    people: true,
  },
  {
    key: "coverage",
    title: "Data coverage and health",
    howToRead:
      "How complete the picture is. A gap here limits the other reports. Freshness follows the last time each connection was verified.",
    metrics: ["coverage_sources", "coverage_stale", "coverage_with_calls", "coverage_manual", "coverage_unmatched", "new_leads"],
    breakdowns: [
      { metric: "coverage_sources", dimension: "detail", title: "Connected sources" },
      { metric: "coverage_stale", dimension: "detail", title: "Sources that need a check" },
    ],
  },
];

export function builtInReport(key: string): BuiltInReport | null {
  return BUILT_IN_REPORTS.find((report) => report.key === key) ?? null;
}
