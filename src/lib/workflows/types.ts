/**
 * One sales process, stored once. The diagram and the list are two views of
 * this graph. A box cannot send. A draft box only asks Relay for an approval.
 */

export const BOX_TYPES = ["start", "wait", "check", "draft", "task", "route", "end", "note"] as const;
export type BoxType = (typeof BOX_TYPES)[number];

export const ORIGINS = ["template", "data", "suggestion", "person"] as const;
export type Origin = (typeof ORIGINS)[number];

export const TIERS = ["hot", "warm", "cool", "cold"] as const;
export type Tier = (typeof TIERS)[number];

export const END_REASONS = ["won", "lost", "booked", "replied", "stopped"] as const;
export type EndReason = (typeof END_REASONS)[number];

export const PORTS = ["next", "yes", "no", "expired", "loop"] as const;
export type Port = (typeof PORTS)[number];

export type StartEntry =
  | { kind: "new_lead" }
  | { kind: "stage"; stage: string }
  | { kind: "quiet_days"; days: number }
  | { kind: "booking"; event: "made" | "completed" | "rescheduled" | "canceled" | "missed" }
  | { kind: "tier"; tier: Tier }
  | { kind: "manual" };

export type BoxConfig =
  | { type: "start"; entry: StartEntry; source: string | null; service: string | null }
  | { type: "wait"; hours: number; untilHour: number | null }
  | {
      type: "check";
      check: "replied" | "booking" | "stage" | "tier" | "field" | "owner" | "human";
      stage: string | null;
      tier: Tier | null;
      field: "source" | "service" | null;
      value: string | null;
      booking: "in_place" | "completed" | "missed" | null;
      yesLabel: string;
      noLabel: string;
    }
  | { type: "draft"; channel: "sms" | "email"; snippetKey: string; windowHour: number; expiry: "exit" | "stop" }
  | {
      type: "task";
      title: string;
      assignee: "lead_owner" | "owner" | "role" | "person";
      role: "owner" | "operator" | null;
      personId: string | null;
      dueHours: number;
      notify: boolean;
    }
  | { type: "route"; mode: "assign_unowned" | "reassign" }
  | { type: "end"; reason: EndReason; handoffKey: string | null }
  | { type: "note"; text: string };

export type Box = {
  id: string;
  type: BoxType;
  title: string;
  summary: string;
  origin: Origin;
  /** A sourced sentence. Empty when the box is a template default. */
  fact: string | null;
  config: BoxConfig;
  position: { x: number; y: number };
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  label: string;
  port: Port;
  /** Set only on a loop. The branch may be taken this many times. */
  maxPasses: number | null;
};

export type Graph = { boxes: Box[]; edges: Edge[] };

export type Snippet = {
  key: string;
  channel: "sms" | "email";
  label: string;
  body: string;
};

export type PlaybookDocument = {
  graph: Graph;
  snippets: Snippet[];
};

export const PLAYBOOK_STATUSES = ["draft", "proposed", "pending_confirmation", "published", "paused", "archived"] as const;
export type PlaybookStatus = (typeof PLAYBOOK_STATUSES)[number];

export const LIMITS = {
  boxes: 40,
  published: 12,
  enrollmentsPerLead: 2,
  loopPasses: 5,
  draftsPerDay: 40,
  tasksPerDay: 60,
  routesPerDay: 50,
  enrollExistingPerDay: 25,
  fullDraftsPerDay: 1,
  singleDraftGapMs: 60 * 60 * 1000,
  minSample: 20,
  minHoursBetweenDrafts: 20,
} as const;

export const QUIET_HOURS_NOTE = "Sends happen only between 8:00 AM and 8:00 PM in the lead's local time. This is locked.";

/** Who does the work. A wait and a note do not belong to an agent. */
export const AGENT_FOR_BOX: Record<BoxType, string | null> = {
  start: "Compass",
  wait: null,
  check: "Compass",
  draft: "Relay",
  task: null,
  route: null,
  end: "Compass",
  note: null,
};
