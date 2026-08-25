import type { ActiveSequenceItem, PendingFollowUpItem } from "@/lib/follow-up/types";
import type { Enums } from "@/types/database";
import type { ScoreConfidence } from "@/lib/scoring/compute";
import type { QueueCrmStatus, QueueMemberOption } from "@/lib/queue/types";
import type { LeadStatus } from "@/lib/leads/labels";

export const CASE_PAGE_SIZE = 50;
export const CASE_TIMELINE_PAGE_SIZE = 20;

export const CASE_SORTS = ["last_touch", "score", "opted_in", "status"] as const;
export type CaseSort = (typeof CASE_SORTS)[number];

export const CASE_SORT_DIRS = ["asc", "desc"] as const;
export type CaseSortDir = (typeof CASE_SORT_DIRS)[number];

export const CASE_TRACKS = ["ready", "nurture"] as const;
export type CaseTrackFilter = (typeof CASE_TRACKS)[number];

export type CaseListFilters = {
  q: string | null;
  status: LeadStatus | null;
  track: CaseTrackFilter | null;
  source: string | null;
  setterId: string | null;
  closerId: string | null;
  scoreMin: number | null;
  scoreMax: number | null;
  optedFrom: string | null;
  optedTo: string | null;
  sort: CaseSort;
  dir: CaseSortDir;
};

export type CaseListRow = {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  leadType: Enums<"lead_type"> | null;
  score: number | null;
  optedInAt: string;
  lastTouchAt: string | null;
  assignedSetterId: string | null;
  assignedCloserId: string | null;
  assignedSetterName: string | null;
  assignedCloserName: string | null;
};

export type CaseListPayload = {
  crmStatus: QueueCrmStatus;
  ghlLocationId: string | null;
  orgLeadCount: number;
  rows: CaseListRow[];
  hasMore: boolean;
  members: QueueMemberOption[];
  sources: string[];
};

export type CaseListEmptyKind = "not_connected" | "broken" | "no_leads" | "no_results";

export type CaseFileLead = CaseListRow & {
  firstName: string | null;
  lastName: string | null;
  campaign: string | null;
  firstHumanTouchAt: string | null;
  ghlContactId: string | null;
  crmUrl: string | null;
  applicationAnswers: Record<string, unknown>;
};

export type CaseScore = {
  id: string;
  total: number;
  timeline: number | null;
  investmentCapacity: number | null;
  decisionAuthority: number | null;
  painSeverity: number | null;
  reasoning: string | null;
  triggeredBy: Enums<"score_trigger">;
  createdAt: string;
  knownFactorCount: number;
  scoreConfidence: ScoreConfidence | null;
};

export type CaseScoreHistoryRow = {
  id: string;
  total: number;
  previousTotal: number | null;
  timeline: number | null;
  investmentCapacity: number | null;
  decisionAuthority: number | null;
  painSeverity: number | null;
  reasoning: string | null;
  triggeredBy: Enums<"score_trigger">;
  createdAt: string;
  scoredByName: string | null;
};

export type CaseObjection = {
  id: string;
  type: Enums<"objection_type">;
  verbatim: string;
  callId: string | null;
  callType: Enums<"call_type"> | null;
  callOccurredAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  createdAt: string;
};

export type CaseNextAction = {
  id: string;
  actionText: string;
  dueAt: string | null;
  completedAt: string | null;
  ownerMemberId: string | null;
  ownerName: string | null;
  createdBy: Enums<"action_creator">;
  overdue: boolean;
};

export type CaseCall = {
  id: string;
  type: Enums<"call_type">;
  scheduledAt: string | null;
  occurredAt: string | null;
  durationSeconds: number | null;
  outcome: Enums<"call_outcome"> | null;
  ranByMemberId: string | null;
  ranByName: string | null;
  hasTranscript: boolean;
  hasExtraction: boolean;
  extractionStatus: "none" | "pending" | "ready" | "failed";
};

export type CaseFieldMap = {
  fieldName: string;
  factor: Enums<"score_factor">;
};

export type CaseRevenueRow = {
  id: string;
  amountCents: number;
  currency: string;
  paymentType: Enums<"payment_type">;
  processor: string | null;
  occurredAt: string;
  closedByName: string | null;
};

export type CaseTimelineTouch = {
  kind: "touch";
  id: string;
  at: string;
  touchType: Enums<"touch_type">;
  channel: Enums<"touch_channel">;
  direction: Enums<"touch_direction">;
  outcome: Enums<"touch_outcome"> | null;
  actorName: string | null;
  note: string | null;
  outboundBody: string | null;
};

export type CaseTimelineCall = {
  kind: "call";
  id: string;
  at: string;
  callType: Enums<"call_type">;
  outcome: Enums<"call_outcome"> | null;
  actorName: string | null;
  durationSeconds: number | null;
  scheduledAt: string | null;
  occurredAt: string | null;
};

export type CaseTimelineStatus = {
  kind: "status";
  id: string;
  at: string;
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  source: Enums<"status_change_source">;
  actorName: string | null;
  note: string | null;
  supersedesManual: boolean;
};

export type CaseTimelineActivity = {
  kind: "activity";
  id: string;
  at: string;
  category: string;
  activityKind: string;
  headline: string;
  actorName: string | null;
  result: string;
  resultReason: string | null;
  retryable: boolean;
  retryKind: string | null;
  retryId: string | null;
  detail: Record<string, unknown>;
};

export type CaseTimelineEntry =
  | CaseTimelineTouch
  | CaseTimelineCall
  | CaseTimelineStatus
  | CaseTimelineActivity;

export type CaseTimelinePage = {
  entries: CaseTimelineEntry[];
  hasMore: boolean;
};

export type CaseFilePayload = {
  lead: CaseFileLead;
  score: CaseScore | null;
  scoreHistory: CaseScoreHistoryRow[];
  objections: CaseObjection[];
  nextActions: CaseNextAction[];
  calls: CaseCall[];
  fieldMaps: CaseFieldMap[];
  revenue: CaseRevenueRow[] | null;
  members: QueueMemberOption[];
  timeline: CaseTimelinePage;
  pendingFollowUps: PendingFollowUpItem[];
  activeSequences: ActiveSequenceItem[];
};

export type CaseActionResult =
  | { ok: true }
  | { ok: false; error: string };
