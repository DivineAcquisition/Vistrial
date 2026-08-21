import type { FirstWeekHealth } from "@/lib/onboarding/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asPair(value: unknown): { k: number; n: number } {
  const row = asRecord(value);
  return { k: asNumber(row?.k), n: asNumber(row?.n) };
}

export function parseFirstWeekHealth(value: unknown): FirstWeekHealth | null {
  const row = asRecord(value);
  if (!row) return null;
  const unmatched = asRecord(row.unmatched_transcripts);
  const drafts = asRecord(row.drafts);
  return {
    activatedAt: asString(row.activated_at),
    hoursSinceActivation: typeof row.hours_since_activation === "number" ? row.hours_since_activation : null,
    zeroIngestWarning: row.zero_ingest_warning === true,
    leadsIngested: asNumber(row.leads_ingested),
    touchCoverage: asPair(row.touch_coverage),
    outcomeLoggingRate: asPair(row.outcome_logging_rate),
    drafts: {
      approved: asNumber(drafts?.approved),
      rejected: asNumber(drafts?.rejected),
    },
    unmatchedTranscripts: {
      count: asNumber(unmatched?.count),
      oldestReceivedAt: asString(unmatched?.oldest_received_at),
    },
    bypass: asString(row.bypass),
  };
}

export function coverageLabel(pair: { k: number; n: number }): string {
  if (pair.n === 0) return "No leads yet";
  return `${pair.k} of ${pair.n}`;
}
