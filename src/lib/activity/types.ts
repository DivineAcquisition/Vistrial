export const ACTIVITY_PAGE_SIZE = 40;
export const ACTIVITY_LIVE_CAP = 40;
export const ACTIVITY_COMPACT_SIZE = 6;

export const ACTIVITY_CATEGORIES = [
  "inbound",
  "system",
  "user",
  "agent",
  "operator",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_RESULTS = ["succeeded", "failed", "running"] as const;
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number];

export const ACTIVITY_INTEGRATIONS = ["gohighlevel"] as const;
export type ActivityIntegration = (typeof ACTIVITY_INTEGRATIONS)[number];

export type ActivityEvent = {
  id: string;
  orgId: string;
  orgName: string | null;
  occurredAt: string;
  category: ActivityCategory;
  kind: string;
  headline: string;
  actorLabel: string;
  actorKind: string;
  actorUserId: string | null;
  integration: string | null;
  leadId: string | null;
  leadName: string | null;
  href: string;
  result: ActivityResult;
  resultReason: string | null;
  retryable: boolean;
  retryKind: string | null;
  retryId: string | null;
  isSyncNoise: boolean;
  detail: Record<string, unknown>;
};

export type ActivityPage = {
  events: ActivityEvent[];
  hasMore: boolean;
};

export type ActivityCursor = {
  at: string;
  id: string;
  failed?: boolean;
};

export type ActivityActorOption = {
  userId: string;
  displayName: string;
};

export type ActivityFilters = {
  category: ActivityCategory | null;
  actorUserId: string | null;
  integration: ActivityIntegration | null;
  failuresOnly: boolean;
  includeSync: boolean;
  includeRoutine: boolean;
  q: string | null;
  from: string | null;
  to: string | null;
  orgId: string | null;
};

export type ActivityLine =
  | { type: "single"; event: ActivityEvent }
  | {
      type: "batch";
      key: string;
      category: ActivityCategory;
      kind: string;
      headline: string;
      occurredAt: string;
      events: ActivityEvent[];
    };
