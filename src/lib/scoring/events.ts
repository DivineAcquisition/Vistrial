import type { FactorValues } from "@/lib/scoring/compute";

/**
 * Event effects on timeline. These are not org weights and not answer
 * mappings. The set is closed: no-show, inbound reply after silence, ghost.
 *
 * Relative moves use the last known timeline. If timeline was unknown, the
 * event still records a reading — the event itself is evidence.
 */
export const SCORING_EVENTS = ["no_show", "inbound_reply", "ghost"] as const;
export type ScoringEvent = (typeof SCORING_EVENTS)[number];

const RELATIVE: Record<ScoringEvent, number> = {
  no_show: -25,
  inbound_reply: 25,
  ghost: -40,
};

const IF_UNKNOWN: Record<ScoringEvent, number> = {
  no_show: 35,
  inbound_reply: 60,
  ghost: 15,
};

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function applyEventToFactors(
  previous: FactorValues,
  event: ScoringEvent
): { factors: FactorValues; timelineFrom: number | null; timelineTo: number; summary: string } {
  const from = previous.timeline;
  const to = clamp(from === null ? IF_UNKNOWN[event] : from + RELATIVE[event]);
  const factors: FactorValues = { ...previous, timeline: to };

  const summary =
    event === "no_show"
      ? from === null
        ? `No-show: timeline was unknown, now ${to}. A missed call is a weaker near-term signal.`
        : `No-show: timeline ${from} → ${to}. A missed call pushes the buying window out.`
      : event === "inbound_reply"
        ? from === null
          ? `Inbound reply after silence: timeline was unknown, now ${to}. They came back.`
          : `Inbound reply after silence: timeline ${from} → ${to}. Coming back after a gap raises near-term intent.`
        : from === null
          ? `Ghosted: timeline was unknown, now ${to}. Silence past the hard threshold is a cold window.`
          : `Ghosted: timeline ${from} → ${to}. Silence past the hard threshold lowers near-term intent.`;

  return { factors, timelineFrom: from, timelineTo: to, summary };
}

/**
 * Call evidence replaces intake on the factors it speaks to. Unmentioned
 * factors stay as they were. Nothing is averaged.
 */
export function overlayCallFactors(previous: FactorValues, fromCall: FactorValues): FactorValues {
  return {
    timeline: fromCall.timeline ?? previous.timeline,
    investment_capacity: fromCall.investment_capacity ?? previous.investment_capacity,
    decision_authority: fromCall.decision_authority ?? previous.decision_authority,
    pain_severity: fromCall.pain_severity ?? previous.pain_severity,
  };
}
