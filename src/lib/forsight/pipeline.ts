import {
  LEAD_FIELDS as F,
  NEVER_TOUCHED_DAYS,
  QUALIFIED,
  isClosedStage,
  plainText,
  readCount,
  readDate,
  readText,
} from "@/lib/forsight/fields";
import type { ForsightRecord } from "@/lib/forsight/types";

export type LeadRow = {
  id: string;
  name: string;
  stage: string;
  qualificationResult: string;
  readinessScore: number | null;
  humanTouches: number | null;
  optInDate: string | null;
  /** Null when the lead has never been touched, rather than Airtable's 999. */
  daysSinceTouch: number | null;
  touchStatus: string;
  /** Airtable already worked out what to do about this lead. */
  nextAction: string;
  debriefMissing: boolean;
};

export function leadRow(record: ForsightRecord): LeadRow {
  const days = readCount(record, F.daysSinceTouch);
  return {
    id: record.id,
    name: readText(record, F.name) || "Unnamed lead",
    stage: readText(record, F.stage),
    qualificationResult: readText(record, F.qualificationResult),
    readinessScore: readCount(record, F.readinessScore),
    humanTouches: readCount(record, F.humanTouches),
    optInDate: readDate(record, F.optInDate),
    daysSinceTouch: days === null || days >= NEVER_TOUCHED_DAYS ? null : days,
    touchStatus: readText(record, F.touchStatus),
    nextAction: readText(record, F.nextAction),
    debriefMissing: readText(record, F.debriefMissing).length > 0,
  };
}

function working(lead: LeadRow): boolean {
  return !isClosedStage(lead.stage);
}

/**
 * Qualified, never spoken to by a human, still in play. Airtable's own Next
 * Action formula reaches the same conclusion, but this reads the underlying
 * fields instead of matching its wording: if someone changes an emoji in the
 * base, this section must not quietly report that nobody is being missed.
 */
export function neverContacted(leads: LeadRow[]): LeadRow[] {
  return leads
    .filter(
      (lead) =>
        working(lead) && lead.qualificationResult === QUALIFIED && lead.humanTouches === 0
    )
    .sort((a, b) => (b.readinessScore ?? 0) - (a.readinessScore ?? 0));
}

export type QuietBucket = "ghosted14" | "ghosted30";

/** The buckets Airtable's Touch Status formula already sorts leads into. */
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
 * Held a call and nobody wrote it up. Read from the dedicated Debrief Missing
 * field rather than Next Action, because Next Action is a priority stack and a
 * lead with a more urgent problem would hide its missing debrief.
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

export function pipelineHealth(records: ForsightRecord[]): PipelineHealth {
  const leads = records.map(leadRow);
  return {
    neverContacted: neverContacted(leads),
    goingQuiet: goingQuiet(leads),
    debriefsMissing: debriefsMissing(leads),
    totalLeads: leads.length,
  };
}

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
