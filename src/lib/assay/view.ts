import { TIER_LABEL, type Part, type Tier } from "@/lib/assay/vocabulary";

/**
 * A lead's Assay score as the person viewing it may see it, from
 * assay_lead_score(). Call-based reasons are already left out for people who
 * cannot see transcripts; `hiddenCallReasons` says how many. Client-safe.
 */

export type AssayReasonView = {
  ruleId: string;
  part: Part;
  text: string;
  impact: number;
  callBased: boolean;
  evidence: Array<{ kind: string; id?: string; at?: string; input?: string; callId?: string }>;
};

export type AssayHistoryView = {
  score: number;
  tier: Tier;
  previousScore: number | null;
  previousTier: Tier | null;
  cause: string;
  historic: boolean;
  at: string;
  reason: string | null;
};

export type AssayScoreView = {
  score: number;
  tier: Tier;
  early: boolean;
  contactable: boolean;
  noCall: boolean;
  callPending: boolean;
  raising: AssayReasonView[];
  lowering: AssayReasonView[];
  hiddenCallReasons: number;
  unclear: string[];
  notes: string[];
  scoredAt: string;
  history: AssayHistoryView[];
};

const TIERS = new Set<Tier>(["hot", "warm", "cool", "cold"]);
const PARTS = new Set<Part>(["fit", "engagement", "call"]);

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function tier(value: unknown): Tier | null {
  return typeof value === "string" && TIERS.has(value as Tier) ? (value as Tier) : null;
}

function reasons(value: unknown): AssayReasonView[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(rec)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      ruleId: str(row.ruleId) ?? "",
      part: (PARTS.has(row.part as Part) ? row.part : "fit") as Part,
      text: str(row.text) ?? "",
      impact: num(row.impact) ?? 0,
      callBased: row.callBased === true,
      evidence: Array.isArray(row.evidence) ? (row.evidence.map(rec).filter(Boolean) as AssayReasonView["evidence"]) : [],
    }))
    .filter((row) => row.text);
}

export function parseAssayScore(value: unknown): AssayScoreView | null {
  const row = rec(value);
  if (!row) return null;
  const score = num(row.score);
  const current = tier(row.tier);
  if (score === null || !current) return null;
  return {
    score,
    tier: current,
    early: row.early === true,
    contactable: row.contactable !== false,
    noCall: row.noCall === true,
    callPending: row.callPending === true,
    raising: reasons(row.raising),
    lowering: reasons(row.lowering),
    hiddenCallReasons: num(row.hiddenCallReasons) ?? 0,
    unclear: Array.isArray(row.unclear) ? row.unclear.filter((item): item is string => typeof item === "string") : [],
    notes: Array.isArray(row.notes) ? row.notes.filter((item): item is string => typeof item === "string") : [],
    scoredAt: str(row.scoredAt) ?? "",
    history: Array.isArray(row.history)
      ? row.history
          .map(rec)
          .filter((item): item is Record<string, unknown> => item !== null)
          .flatMap((item) => {
            const s = num(item.score);
            const t = tier(item.tier);
            if (s === null || !t) return [];
            return [
              {
                score: s,
                tier: t,
                previousScore: num(item.previousScore),
                previousTier: tier(item.previousTier),
                cause: str(item.cause) ?? "event",
                historic: item.historic === true,
                at: str(item.at) ?? "",
                reason: str(item.reason),
              },
            ];
          })
      : [],
  };
}

/** "Hot 82", or "Do not contact" in place of a tier for leads who cannot be contacted. */
export function tierChipLabel(view: Pick<AssayScoreView, "score" | "tier" | "contactable">): string {
  return view.contactable ? `${TIER_LABEL[view.tier]} ${view.score}` : "Do not contact";
}

export function tierTone(view: Pick<AssayScoreView, "tier" | "contactable">): "brand" | "neutral" | "warning" | "critical" {
  if (!view.contactable) return "critical";
  if (view.tier === "hot") return "brand";
  if (view.tier === "warm") return "warning";
  return "neutral";
}

/** "Warm to Hot on Oct 14: booked an estimate." */
export function historyLine(row: AssayHistoryView, timeZone?: string): string {
  const day = row.at
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(row.at))
    : "";
  const move =
    row.previousTier === null
      ? `Scored ${TIER_LABEL[row.tier]} (${row.score})`
      : row.previousTier === row.tier
        ? `${TIER_LABEL[row.tier]}, ${row.previousScore ?? "?"} to ${row.score}`
        : `${TIER_LABEL[row.previousTier]} to ${TIER_LABEL[row.tier]}`;
  const because = row.reason ? `: ${row.reason.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}` : "";
  const quiet = row.historic ? " (scored silently)" : "";
  return `${move}${day ? ` on ${day}` : ""}${because}.${quiet}`;
}
