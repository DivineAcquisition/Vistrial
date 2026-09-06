import type { PendingFollowUpItem } from "@/lib/follow-up/types";
import type { Enums } from "@/types/database";
import type { ScoreConfidence } from "@/lib/scoring/compute";

export const QUEUE_PAGE_SIZE = 50;

export const QUEUE_ASSIGNED = ["all", "me", "unassigned", "me_or_unassigned"] as const;
export type QueueAssignedFilter = (typeof QUEUE_ASSIGNED)[number];

export const QUEUE_TRACKS = ["ready", "nurture"] as const;
export type QueueTrackFilter = (typeof QUEUE_TRACKS)[number];

export const QUEUE_STATUSES = [
  "new",
  "working",
  "call_booked",
  "no_show",
  "follow_up",
  "objection_hold",
  "ghost",
  "closed_won",
  "closed_lost",
] as const satisfies readonly Enums<"lead_status">[];

export type QueueStatusFilter = (typeof QUEUE_STATUSES)[number];

export const TOUCH_CHANNELS = ["sms", "email", "call", "dm", "voicemail", "other"] as const satisfies readonly Enums<"touch_channel">[];
export const TOUCH_DIRECTIONS = ["outbound", "inbound"] as const satisfies readonly Enums<"touch_direction">[];
export const TOUCH_OUTCOMES = [
  "connected",
  "no_answer",
  "left_voicemail",
  "replied",
  "booked",
  "not_interested",
] as const satisfies readonly Enums<"touch_outcome">[];

export type TouchChannel = (typeof TOUCH_CHANNELS)[number];
export type TouchDirection = (typeof TOUCH_DIRECTIONS)[number];
export type TouchOutcome = (typeof TOUCH_OUTCOMES)[number];

export type QueueCrmStatus = Enums<"ghl_connection_status"> | "missing";

export type QueueMemberOption = {
  id: string;
  displayName: string;
  role: Enums<"org_role">;
};

export type QueueNextAction = {
  id: string;
  actionText: string;
  dueAt: string | null;
  overdue: boolean;
};

export type QueueRow = {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  source: string | null;
  status: Enums<"lead_status">;
  leadType: Enums<"lead_type"> | null;
  score: number | null;
  scoreConfidence: ScoreConfidence | null;
  knownFactorCount: number;
  scoreReasoning: string | null;
  optedInAt: string;
  lastTouchAt: string | null;
  firstHumanTouchAt: string | null;
  assignedSetterId: string | null;
  assignedCloserId: string | null;
  assignedSetterName: string | null;
  assignedCloserName: string | null;
  ghlContactId: string | null;
  crmUrl: string | null;
  nextAction: QueueNextAction | null;
  inAlarm: boolean;
  breachSeconds: number | null;
  urgencyRank: number | null;
  sortScore: number;
};

export type QueueFilters = {
  assigned: QueueAssignedFilter;
  track: QueueTrackFilter | null;
  status: QueueStatusFilter | null;
  source: string | null;
  breached: boolean;
};

export type QueuePayload = {
  crmStatus: QueueCrmStatus;
  ghlLocationId: string | null;
  orgLeadCount: number;
  unfilteredActionableCount: number;
  alarm: QueueRow[];
  queue: QueueRow[];
  pendingDrafts: PendingFollowUpItem[];
  hasMore: boolean;
  members: QueueMemberOption[];
  sources: string[];
};

export type QueueEmptyKind = "not_connected" | "broken" | "no_leads" | "nothing_to_work";

export type QueueActionResult =
  | {
      ok: true;
      row: QueueRow | null;
      duplicate?: boolean;
      discrepancy?: string | null;
    }
  | { ok: false; error: string };

export type LogOutcomeInput = {
  leadId: string;
  channel: string;
  direction: string;
  outcome: string;
  note?: string;
  actorMemberId?: string;
  clientEventId?: string;
  clientLoggedAt?: string;
  queuedOffline?: boolean;
  clientSurface?: "mobile" | "desktop";
  expectedLeadStatus?: string | null;
  expectedLastTouchAt?: string | null;
  expectedFirstHumanTouchAt?: string | null;
};

export const TOUCH_OUTCOME_LABELS: Record<TouchOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  left_voicemail: "Left voicemail",
  replied: "Replied",
  booked: "Booked",
  not_interested: "Not interested",
};

export const TOUCH_CHANNEL_LABELS: Record<TouchChannel, string> = {
  sms: "SMS",
  email: "Email",
  call: "Call",
  dm: "DM",
  voicemail: "Voicemail",
  other: "Other",
};

export const SCORE_CONFIDENCE_LABELS: Record<ScoreConfidence, string> = {
  high: "high",
  moderate: "moderate",
  low: "low",
  very_low: "very low",
};
