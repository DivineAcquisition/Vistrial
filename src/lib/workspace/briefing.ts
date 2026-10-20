import type { BriefingFacts } from "@/lib/workspace/voice";

/**
 * Turns saved records into briefing facts. Pure, so the truth test can seed
 * known rows and check every figure. Rows carry ids, states, and times only.
 */

export type BriefingRecords = {
  leads: Array<{ id: string; created_at: string; historic: boolean }>;
  scribeRuns: Array<{ status: string; finished_at: string | null }>;
  caseFilesForReview: number;
  alerts: Array<{ created_at: string; resolved_at: string | null }>;
  relayItems: Array<{ created_at: string; status: string }>;
  scoreMoves: Array<{
    lead_id: string;
    score: number;
    previous_score: number | null;
    tier: string;
    previous_tier: string | null;
    historic: boolean;
    created_at: string;
  }>;
  dueNow: number;
};

const TIER_RANK: Record<string, number> = { cold: 0, cool: 1, warm: 2, hot: 3 };

function after(iso: string | null, since: number): boolean {
  return iso !== null && Date.parse(iso) >= since;
}

export type AggregatedBriefing = BriefingFacts & { assayNewlyHotIds: string[] };

export function aggregateBriefing(records: BriefingRecords, sinceIso: string, capped: boolean): AggregatedBriefing {
  const since = Date.parse(sinceIso);
  const newLeads = records.leads.filter((lead) => !lead.historic && after(lead.created_at, since)).length;
  const caseFiles = records.scribeRuns.filter((run) => run.status === "completed" && after(run.finished_at, since)).length;

  const alerts = records.alerts.filter((alert) => after(alert.created_at, since));
  const reached = alerts.filter((alert) => alert.resolved_at !== null);
  const slowest = reached.length
    ? Math.max(...reached.map((alert) => Math.max(0, Math.round((Date.parse(alert.resolved_at!) - Date.parse(alert.created_at)) / 60_000))))
    : null;

  const relay = records.relayItems.filter((item) => after(item.created_at, since));

  // One entry per lead: its biggest move in the window, live scores only.
  const byLead = new Map<string, { up: boolean; becameHot: boolean }>();
  for (const move of records.scoreMoves) {
    if (move.historic || !after(move.created_at, since)) continue;
    const entry = byLead.get(move.lead_id) ?? { up: false, becameHot: false };
    const tierUp = move.previous_tier !== null && (TIER_RANK[move.tier] ?? 0) > (TIER_RANK[move.previous_tier] ?? 0);
    const scoreUp = move.previous_score !== null && move.score > move.previous_score;
    if (tierUp || scoreUp) entry.up = true;
    if (move.tier === "hot" && move.previous_tier !== null && move.previous_tier !== "hot") entry.becameHot = true;
    byLead.set(move.lead_id, entry);
  }
  const newlyHot = [...byLead.entries()].filter(([, entry]) => entry.becameHot).map(([id]) => id);

  return {
    sinceAt: new Date(since).toISOString(),
    capped,
    newLeads,
    caseFiles,
    caseFilesForReview: caseFiles ? Math.min(records.caseFilesForReview, caseFiles) : 0,
    sentryCaught: alerts.length,
    sentryReached: reached.length,
    sentrySlowestMinutes: slowest,
    relayDrafted: relay.length,
    relayWaiting: relay.filter((item) => item.status === "pending").length,
    relayApproved: relay.filter((item) => item.status === "approved" || item.status === "succeeded").length,
    relaySent: relay.filter((item) => item.status === "succeeded").length,
    assayMovedUp: [...byLead.values()].filter((entry) => entry.up).length,
    assayNewlyHot: [],
    assayNewlyHotIds: newlyHot,
    needYouToday: records.dueNow,
  };
}

/** Every number the briefing may print, so a test can prove nothing else appears. */
export function briefingNumbers(facts: BriefingFacts): Set<number> {
  return new Set(
    [
      facts.newLeads,
      facts.caseFiles,
      facts.caseFilesForReview,
      facts.sentryCaught,
      facts.sentryReached,
      facts.sentryCaught - facts.sentryReached,
      facts.sentrySlowestMinutes ?? 0,
      facts.relayDrafted,
      facts.relayWaiting,
      facts.relayApproved,
      facts.relaySent,
      facts.assayMovedUp,
      facts.assayNewlyHot.length,
      Math.max(0, facts.assayNewlyHot.length - 3),
      facts.needYouToday,
      7,
    ].filter((n) => n > 0)
  );
}
