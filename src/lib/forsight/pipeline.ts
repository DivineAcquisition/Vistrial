/** The readiness verdict a lead carries into this page. */
export const QUALIFIED = "Qualified";

/** Stages that take a lead out of the working pipeline. */
const CLOSED_STAGES = new Set(["closed won", "closed lost", "disqualified", "recycled"]);

/**
 * `lead_status` writes these as `closed_won`, and a human writes the same
 * thing as "Closed Won", so the separator is normalised. Otherwise a closed
 * lead would read as still in play and turn up in a queue asking someone to
 * chase it.
 */
export function isClosedStage(stage: string): boolean {
  return CLOSED_STAGES.has(stage.trim().toLowerCase().replace(/[_-]+/g, " "));
}

/**
 * Touch Status is decorated with emoji. Matching on the words rather than the
 * exact string means a change of icon does not quietly empty a section.
 */
export function plainText(value: string): string {
  return value
    .replace(/[^\p{Letter}\p{Number}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type LeadRow = {
  id: string;
  name: string;
  stage: string;
  qualificationResult: string;
  readinessScore: number | null;
  humanTouches: number | null;
  optInDate: string | null;
  /** Null when the lead has never been touched. */
  daysSinceTouch: number | null;
  touchStatus: string;
  /** What this workspace already decided to do about this lead. */
  nextAction: string;
  debriefMissing: boolean;
};

function working(lead: LeadRow): boolean {
  return !isClosedStage(lead.stage);
}

/** Qualified, never spoken to by a human, still in play. */
export function neverContacted(leads: LeadRow[]): LeadRow[] {
  return leads
    .filter(
      (lead) =>
        working(lead) && lead.qualificationResult === QUALIFIED && lead.humanTouches === 0
    )
    .sort((a, b) => (b.readinessScore ?? 0) - (a.readinessScore ?? 0));
}

export type QuietBucket = "ghosted14" | "ghosted30";

/** The buckets the Touch Status wording already sorts leads into. */
export function quietBucket(lead: LeadRow): QuietBucket | null {
  const status = plainText(lead.touchStatus);
  if (status.includes("ghosted 30d")) return "ghosted30";
  if (status.includes("ghosted 14d")) return "ghosted14";
  return null;
}

export function goingQuiet(leads: LeadRow[]): Record<QuietBucket, LeadRow[]> {
  const buckets: Record<QuietBucket, LeadRow[]> = { ghosted30: [], ghosted14: [] };
  for (const lead of leads) {
    if (!working(lead)) continue;
    const bucket = quietBucket(lead);
    if (bucket) buckets[bucket].push(lead);
  }
  const bySilence = (a: LeadRow, b: LeadRow) => (b.daysSinceTouch ?? 0) - (a.daysSinceTouch ?? 0);
  buckets.ghosted30.sort(bySilence);
  buckets.ghosted14.sort(bySilence);
  return buckets;
}

/**
 * Held a call and nobody wrote it up. Read on its own rather than off the next
 * action, because the next action is a priority stack and a lead with a more
 * urgent problem would hide its missing debrief.
 */
export function debriefsMissing(leads: LeadRow[]): LeadRow[] {
  return leads.filter((lead) => lead.debriefMissing);
}

export type PipelineHealth = {
  neverContacted: LeadRow[];
  goingQuiet: Record<QuietBucket, LeadRow[]>;
  debriefsMissing: LeadRow[];
  totalLeads: number;
};

/**
 * Days between two dates, for showing how long someone has been waiting. This
 * is date formatting, the same as writing "3 days ago"; it is not a metric.
 */
export function daysSince(date: string | null, now: Date): number | null {
  if (!date) return null;
  const then = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / 86_400_000));
}
