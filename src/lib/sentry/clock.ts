import {
  businessMinutesBetween,
  isOpenAt,
  windowsElapsed,
  type AfterHoursMode,
  type BusinessHours,
} from "@/lib/config/clock";

/**
 * One response clock. The deadline is stored by the sweep; this module is the
 * only place that decides the state, so every screen shows the same answer.
 */

export const CLOCK_STATES = ["on_time", "at_risk", "missed", "paused", "not_applicable", "resolved"] as const;
export type ClockState = (typeof CLOCK_STATES)[number];

export const CLOCK_STATE_LABEL: Record<ClockState, string> = {
  on_time: "On time",
  at_risk: "At risk",
  missed: "Missed",
  paused: "Paused",
  not_applicable: "Not applicable",
  resolved: "Resolved",
};

export type TouchKind = "human" | "system";

export type ClockTouch = {
  at: string;
  type: TouchKind;
  channel: string;
  /** True when a person logged it by hand. Still a human touch. */
  manual?: boolean;
};

/**
 * A saved touch as the clock sees it. A Relay draft a person approved and sent
 * counts as a human touch unless the workspace turned that off
 * (response.relay_counts_as_human_touch; missing means on).
 */
export function clockTouchFromRow(
  row: { occurred_at: string; type: string; channel: string; queued_offline?: boolean | null; drafted_by_agent?: string | null },
  relayCountsAsHuman: unknown
): ClockTouch {
  const human = row.type === "human" && !(row.drafted_by_agent === "relay" && relayCountsAsHuman === false);
  return { at: row.occurred_at, type: human ? "human" : "system", channel: row.channel, manual: row.queued_offline === true };
}

export type ClockInput = {
  now: string;
  startedAt: string;
  kind: "first_touch" | "follow_up";
  windowMinutes: number;
  afterHoursWindowMinutes: number;
  mode: AfterHoursMode;
  warningPercent: number;
  hours: BusinessHours;
  timeZone: string;
  countedChannels: string[];
  touches: ClockTouch[];
  closed: boolean;
  optedOut: boolean;
  doNotContact: boolean;
  merged: boolean;
  /** No cadence configured for this stage. */
  noWindow?: boolean;
  hoursMissing?: boolean;
};

export type ClockAnswer = {
  state: ClockState;
  reason: string;
  deadlineAt: string | null;
  /** Minutes counted toward the window. */
  elapsedMinutes: number;
  /** How long past the deadline, in minutes. Zero until missed. */
  overdueMinutes: number;
  /** Set when a valid human touch ended the clock. */
  resolvedAt: string | null;
  manual: boolean;
};

const CHANNEL_MAP: Record<string, string> = { sms: "text", call: "call", email: "email", text: "text" };

export function countedChannel(channel: string): string {
  return CHANNEL_MAP[channel] ?? channel;
}

/**
 * A person reached the lead. Automated messages never qualify. A follow-up
 * clock starts at a human touch, so only a later one can end it.
 */
export function validHumanTouch(touches: ClockTouch[], startedAt: string, counted: string[], strict = false): ClockTouch | null {
  const start = Date.parse(startedAt);
  const allowed = new Set(counted);
  const hits = touches
    .filter((touch) => {
      if (touch.type !== "human" || !allowed.has(countedChannel(touch.channel))) return false;
      const at = Date.parse(touch.at);
      return strict ? at > start : at >= start;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return hits[0] ?? null;
}

/** The instant the window runs out, searching open hours when the clock pauses. */
export function deadlineAt(args: {
  startedAt: Date;
  windowMinutes: number;
  afterHoursWindowMinutes: number;
  mode: AfterHoursMode;
  hours: BusinessHours;
  timeZone: string;
}): Date | null {
  if (args.windowMinutes <= 0) return null;
  if (args.mode === "separate_window" && !isOpenAt(args.startedAt, args.hours, args.timeZone)) {
    return new Date(args.startedAt.getTime() + args.afterHoursWindowMinutes * 60_000);
  }
  if (args.mode !== "pause") return new Date(args.startedAt.getTime() + args.windowMinutes * 60_000);
  const horizon = new Date(args.startedAt.getTime() + 60 * 86_400_000);
  if (businessMinutesBetween(args.startedAt, horizon, args.hours, args.timeZone) < args.windowMinutes) return null;
  let lo = args.startedAt.getTime();
  let hi = horizon.getTime();
  while (hi - lo > 30_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (businessMinutesBetween(args.startedAt, new Date(mid), args.hours, args.timeZone) >= args.windowMinutes) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export function evaluateClock(input: ClockInput): ClockAnswer {
  if (input.hoursMissing) {
    return { state: "not_applicable", reason: "Sentry is not watching this lead until business hours are set.", deadlineAt: null, elapsedMinutes: 0, overdueMinutes: 0, resolvedAt: null, manual: false };
  }
  if (input.merged) return na("This lead was merged.");
  if (input.doNotContact) return na("Marked do not contact.");
  if (input.optedOut) return na("This lead opted out.");
  if (input.closed) return na("This lead is closed.");
  if (input.noWindow) return na("This stage has no follow-up window.");

  const touch = validHumanTouch(input.touches, input.startedAt, input.countedChannels, input.kind === "follow_up");
  if (touch) {
    const gap = Math.max(0, Math.round((Date.parse(touch.at) - Date.parse(input.startedAt)) / 60_000));
    return {
      state: "resolved",
      reason: touch.manual ? "A person logged a touch by hand." : "A person reached this lead.",
      deadlineAt: null,
      elapsedMinutes: gap,
      overdueMinutes: 0,
      resolvedAt: touch.at,
      manual: touch.manual === true,
    };
  }

  const started = new Date(input.startedAt);
  const now = new Date(input.now);
  const deadline = deadlineAt({
    startedAt: started,
    windowMinutes: input.windowMinutes,
    afterHoursWindowMinutes: input.afterHoursWindowMinutes,
    mode: input.mode,
    hours: input.hours,
    timeZone: input.timeZone,
  });
  if (!deadline) {
    return { state: "not_applicable", reason: "Sentry could not place a deadline from these hours.", deadlineAt: null, elapsedMinutes: 0, overdueMinutes: 0, resolvedAt: null, manual: false };
  }
  const progress = windowsElapsed({
    arrivedAt: started,
    now,
    mode: input.mode,
    windowMinutes: input.windowMinutes,
    afterHoursWindowMinutes: input.afterHoursWindowMinutes,
    hours: input.hours,
    timeZone: input.timeZone,
  });
  const overdue = progress.windows >= 1 ? Math.max(0, Math.round((now.getTime() - deadline.getTime()) / 60_000)) : 0;
  const base = { deadlineAt: deadline.toISOString(), elapsedMinutes: progress.minutes, overdueMinutes: overdue, resolvedAt: null, manual: false };
  if (progress.windows >= 1) {
    return { ...base, state: "missed", reason: `No person has reached this lead. Overdue by ${overdue} minutes.` };
  }
  if (input.mode === "pause" && !isOpenAt(now, input.hours, input.timeZone)) {
    return { ...base, state: "paused", reason: "Paused until the business opens. The deadline does not move while closed." };
  }
  if (progress.windows >= input.warningPercent / 100) {
    return { ...base, state: "at_risk", reason: "The window is almost over." };
  }
  return { ...base, state: "on_time", reason: "There is still time for a person to reach this lead." };
}

function na(reason: string): ClockAnswer {
  return { state: "not_applicable", reason, deadlineAt: null, elapsedMinutes: 0, overdueMinutes: 0, resolvedAt: null, manual: false };
}

/** Which escalation step applies once a window is missed. Null while still inside it. */
export function escalationLevel(windowsOver: number, levels: Array<{ after_windows: number }>): number | null {
  if (windowsOver < 1) return null;
  const sorted = [...levels].filter((level) => Number.isFinite(level.after_windows)).sort((a, b) => a.after_windows - b.after_windows);
  let matched = 0;
  sorted.forEach((level, index) => {
    if (windowsOver >= level.after_windows) matched = index + 1;
  });
  return matched || 1;
}

export const CLOCK_DEFINITIONS = [
  "Time to first touch is the minutes from when the lead arrived until the first touch by a person.",
  "The window was met when that touch happened before the deadline.",
  "A gap is the time from one human touch to the next. It met the cadence when it stayed inside the stage's window.",
  "A nudge is the note sent before a deadline. An escalation is the note sent after it is missed.",
  "Resolved means a person reached the lead, or the lead no longer needs a follow-up.",
] as const;
