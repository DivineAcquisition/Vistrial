/**
 * Pure rules for the agentic workspace's personal state. Shared by the
 * Convex functions and the app so "since your last visit" means the same
 * thing in both places.
 */

export const BRIEFING_MAX_DAYS = 7;
export const BRIEFING_HISTORY_DAYS = 3;
export const WELCOME_DAYS = 14;

export const SECTION_IDS = ["decisions", "work", "briefing", "outcomes", "stream"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Metrics an Owner may pick for the outcome strip. Ids from the one metric catalog. */
export const OUTCOME_METRIC_IDS = [
  "first_touch_time",
  "leads_waiting",
  "bookings",
  "relay_approved",
  "new_leads",
  "relay_sent",
  "hot_open",
  "revenue",
] as const;
export type OutcomeMetricId = (typeof OUTCOME_METRIC_IDS)[number];
export const DEFAULT_OUTCOME_METRICS: OutcomeMetricId[] = ["first_touch_time", "leads_waiting", "bookings", "relay_approved"];

export type VisitState = {
  lastVisitAt: number | null;
  visitDay: string | null;
  sinceAt: number | null;
  briefingSeenDay: string | null;
};

export type VisitResult = {
  /** Start of the briefing window, or null on a first visit. */
  sinceAt: number | null;
  /** The window was cut to the maximum. */
  capped: boolean;
  /** First open of the day: the briefing starts expanded. */
  firstViewToday: boolean;
  firstVisit: boolean;
  next: VisitState;
};

/**
 * The briefing window is fixed for the whole day: it starts at the last
 * visit before today's first one, never more than seven days back.
 */
export function resolveVisit(prev: VisitState | null, now: number, day: string): VisitResult {
  const floor = now - BRIEFING_MAX_DAYS * 86_400_000;
  if (!prev || prev.lastVisitAt === null) {
    return {
      sinceAt: null,
      capped: false,
      firstViewToday: true,
      firstVisit: true,
      next: { lastVisitAt: now, visitDay: day, sinceAt: null, briefingSeenDay: null },
    };
  }
  const sameDay = prev.visitDay === day;
  const raw = sameDay ? prev.sinceAt : prev.lastVisitAt;
  const capped = raw !== null && raw < floor;
  const sinceAt = raw === null ? null : Math.max(raw, floor);
  return {
    sinceAt,
    capped,
    firstViewToday: prev.briefingSeenDay !== day,
    firstVisit: false,
    next: { lastVisitAt: now, visitDay: day, sinceAt, briefingSeenDay: prev.briefingSeenDay },
  };
}

export function isOutcomeMetric(value: string): value is OutcomeMetricId {
  return (OUTCOME_METRIC_IDS as readonly string[]).includes(value);
}

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}
