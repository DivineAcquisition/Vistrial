/**
 * A workflow is the graph form of a playbook step plan. The graph is the one
 * stored form. The outline (list) view and the canvas are both derived from it,
 * so they cannot disagree. Only these box kinds exist.
 */

export const BOX_KINDS = ["start", "wait", "check", "draft", "task", "route", "end", "note"] as const;
export type BoxKind = (typeof BOX_KINDS)[number];

export const EDGE_EXITS = ["next", "yes", "no", "expired"] as const;
export type EdgeExit = (typeof EDGE_EXITS)[number];

export const ENTRY_TRIGGERS = [
  "new_lead",
  "stage_changed",
  "no_activity",
  "booking",
  "tier_changed",
  "manual",
] as const;
export type EntryTrigger = (typeof ENTRY_TRIGGERS)[number];

export const BOOKING_EVENTS = ["made", "rescheduled", "canceled", "missed"] as const;
export const TIERS = ["cold", "warm", "hot"] as const;
export type Tier = (typeof TIERS)[number];

export const CHECK_KINDS = [
  "replied_since",
  "booking_state",
  "stage_is",
  "tier_at_least",
  "field_is",
  "has_owner",
  "human_touched_recently",
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const END_REASONS = ["won", "lost", "booked", "replied", "stopped"] as const;
export type EndReason = (typeof END_REASONS)[number];

export type Assignee =
  | { kind: "lead_owner" }
  | { kind: "person"; memberId: string }
  | { kind: "role"; role: string };

export type BoxConfig =
  | {
      kind: "start";
      trigger: EntryTrigger;
      stage?: string;
      days?: number;
      bookingEvent?: (typeof BOOKING_EVENTS)[number];
      tier?: Tier;
      sources?: string[];
    }
  | { kind: "wait"; amount: number; unit: "hours" | "days"; atTime?: string }
  | {
      kind: "check";
      check: CheckKind;
      value?: string;
      /** Plain labels on the two exits, for example "Replied" and "No reply". */
      yesLabel: string;
      noLabel: string;
    }
  | {
      kind: "draft";
      channel: "text" | "email" | null;
      contentKind: "snippet" | "talk_track";
      /** Snippet or talk track id from the playbook. Null until chosen. */
      contentRef: string | null;
      windowHours: number;
    }
  | { kind: "task"; text: string; dueHours: number; assignee: Assignee; alert: boolean }
  | { kind: "route"; mode: "assign_unowned" | "reassign" }
  | { kind: "end"; reason: EndReason; handOffTo?: string }
  | { kind: "note"; text: string };

export type Box = { id: string; config: BoxConfig };

export type Edge = {
  id: string;
  from: string;
  to: string;
  exit: EdgeExit;
  /** Set only on a line that returns to an earlier box. A counted loop needs a maximum number of passes. */
  maxPasses?: number;
};

export type WorkflowGraph = { boxes: Box[]; edges: Edge[] };

/** Everything the checker may look up. Supplied from real workspace data. */
export type CheckContext = {
  stages: ReadonlySet<string>;
  snippetIds: ReadonlySet<string>;
  talkTrackIds: ReadonlySet<string>;
  memberIds: ReadonlySet<string>;
  roles: ReadonlySet<string>;
  /**
   * Channels this workspace may use (text needs registration, email a sender).
   * Leave out when availability is not known. The checker then says so
   * instead of guessing.
   */
  channels?: ReadonlySet<"text" | "email">;
  /** Leave out when not known. The route check is then skipped. */
  routingAvailable?: boolean;
  /** Connections that are currently unhealthy. Warns, never blocks. */
  unhealthyChannels?: ReadonlySet<"text" | "email">;
  limits?: Partial<WorkflowLimits>;
};

export type WorkflowLimits = {
  maxBoxes: number;
  maxLoopPasses: number;
  /** Smallest gap between two messages to one lead, in hours. */
  minMessageGapHours: number;
  longWaitDays: number;
};

export const DEFAULT_LIMITS: WorkflowLimits = {
  maxBoxes: 40,
  maxLoopPasses: 5,
  minMessageGapHours: 24,
  longWaitDays: 14,
};

export type CheckIssue = {
  severity: "error" | "warning";
  code: string;
  boxId: string | null;
  message: string;
};

export type CheckResult = { ok: boolean; issues: CheckIssue[] };
