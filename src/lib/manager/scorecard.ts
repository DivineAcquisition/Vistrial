import type { RoleTargets } from "@/lib/foundation/fields";
import type { EodActivity } from "@/lib/manager/eod";

/**
 * Rep scorecards (Prompt 26, Part 4, decision 4). Activity is shown against
 * the confirmed Foundation targets. A percentage needs at least MIN_SAMPLE
 * events behind it; below that the metric says how many there are instead.
 */

export const MIN_SAMPLE = 20;

export type RepRole = "setter" | "closer";

export type ScoreInputs = {
  activity: EodActivity;
  /** Working days in the period, for daily targets. */
  days: number;
  /** Seconds from a lead arriving to this rep's first human touch. */
  firstTouchSeconds: number[];
  followUpsDue: number;
  followUpsOnTime: number;
};

export type Metric = {
  key: string;
  label: string;
  value: string | null;
  /** Why the value is hidden. */
  hidden: string | null;
  target: string | null;
  status: "on_track" | "behind" | null;
  sample: number;
};

function pct(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100);
}

function rate(key: string, label: string, numerator: number, denominator: number, targetPct?: number | null): Metric {
  if (denominator < MIN_SAMPLE) {
    return {
      key,
      label,
      value: null,
      hidden: denominator === 0 ? "Nothing to measure yet" : `Not enough yet (${denominator} of ${MIN_SAMPLE})`,
      target: targetPct ? `${targetPct}%` : null,
      status: null,
      sample: denominator,
    };
  }
  const value = pct(numerator, denominator);
  return {
    key,
    label,
    value: `${value}%`,
    hidden: null,
    target: targetPct ? `${targetPct}%` : null,
    status: targetPct ? (value >= targetPct ? "on_track" : "behind") : null,
    sample: denominator,
  };
}

function count(key: string, label: string, actual: number, perPeriodTarget: number | null): Metric {
  return {
    key,
    label,
    value: String(actual),
    hidden: null,
    target: perPeriodTarget ? String(perPeriodTarget) : null,
    status: perPeriodTarget ? (actual >= perPeriodTarget ? "on_track" : "behind") : null,
    sample: actual,
  };
}

function medianMinutes(seconds: number[]): number | null {
  if (!seconds.length) return null;
  const sorted = [...seconds].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] / 60);
}

/**
 * Setter targets are per day, closer targets per week (the Foundation's
 * labels). Both scale to the period.
 */
export function scorecard(role: RepRole, inputs: ScoreInputs, targets: RoleTargets | null, closeRateTarget: number | null): Metric[] {
  const a = inputs.activity;
  const scale = role === "setter" ? inputs.days : inputs.days / 5;
  const t = (value: number | undefined) => (targets && value ? Math.max(1, Math.round(value * scale)) : null);
  const speed = medianMinutes(inputs.firstTouchSeconds);
  const speedMetric: Metric = {
    key: "speed_to_lead",
    label: "Speed to lead",
    value: speed === null ? null : `${speed} min`,
    hidden: speed === null ? "No new leads reached yet" : null,
    target: null,
    status: null,
    sample: inputs.firstTouchSeconds.length,
  };
  const discipline = rate("follow_up_discipline", "Follow-ups on time", inputs.followUpsOnTime, inputs.followUpsDue);
  if (role === "setter") {
    return [
      count("dials", "Calls made", a.dials, t(targets?.calls)),
      count("conversations", "Conversations", a.conversations, t(targets?.conversations)),
      count("follow_ups", "Follow-ups sent", a.followUps, t(targets?.followUps)),
      count("booked", "Calls booked", a.booked, t(targets?.booked)),
      rate("connect_rate", "Calls that became conversations", a.conversations, a.dials),
      rate("book_rate", "Conversations that booked", a.booked, a.conversations),
      speedMetric,
      discipline,
    ];
  }
  const scheduled = a.callsHeld + a.noShows;
  return [
    count("shows", "Sales calls held", a.callsHeld, t(targets?.shows)),
    count("closes", "Closes", a.closes, t(targets?.closes)),
    count("follow_ups", "Follow-ups sent", a.followUps, t(targets?.followUps)),
    rate("show_rate", "Show rate", a.callsHeld, scheduled),
    rate("close_rate", "Close rate", a.closes, a.callsHeld, closeRateTarget),
    speedMetric,
    discipline,
  ];
}

export function sumActivity(rows: EodActivity[]): EodActivity {
  const out: EodActivity = { dials: 0, conversations: 0, followUps: 0, booked: 0, callsHeld: 0, noShows: 0, closes: 0, tasksDone: 0 };
  for (const row of rows) for (const key of Object.keys(out) as Array<keyof EodActivity>) out[key] += Number(row[key] ?? 0);
  return out;
}

export type CoachingMoment = { callId: string; leadId: string | null; occurredAt: string; text: string };

/**
 * Evidence-based coaching from call measurements Scribe already keeps.
 * Each suggestion links to the call it comes from. No transcript text.
 */
export function coachingMoments(
  calls: Array<{ call_id: string; lead_id: string | null; occurred_at: string; talk_ratio_rep: number | null; open_question_count: number | null; question_count: number | null }>
): CoachingMoment[] {
  const out: CoachingMoment[] = [];
  for (const call of calls) {
    if (call.talk_ratio_rep !== null && call.talk_ratio_rep >= 0.65) {
      out.push({ callId: call.call_id, leadId: call.lead_id, occurredAt: call.occurred_at, text: `You spoke for ${Math.round(call.talk_ratio_rep * 100)}% of this call. Aim to let the lead talk more than half the time.` });
    } else if (call.question_count !== null && call.question_count > 0 && (call.open_question_count ?? 0) === 0) {
      out.push({ callId: call.call_id, leadId: call.lead_id, occurredAt: call.occurred_at, text: "Every question on this call could be answered with yes or no. Try one open question early." });
    }
  }
  return out.slice(0, 10);
}
