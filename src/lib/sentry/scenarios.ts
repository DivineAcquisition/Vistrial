import type { AfterHoursMode, BusinessHours } from "@/lib/config/clock";
import { evaluateClock, escalationLevel, type ClockInput, type ClockState, type ClockTouch } from "@/lib/sentry/clock";
import { followUpStart, holdForQuietHours, levelFor, routeTargets, type EscalationLevel } from "@/lib/sentry/routing";

/**
 * Sentry's scenario check. Synthetic leads only: no workspace data is read.
 * Windows, cadence, and escalation come from the template being checked; the
 * business hours are a fixed synthetic week so every template is judged on
 * the same calendar. Each expectation is stated here, not derived from the
 * code under test.
 */

export type ScenarioResult = { id: string; label: string; expected: string; actual: string; passed: boolean };

const ZONE = "America/New_York";
const WEEK: BusinessHours = {
  days: {
    mon: [{ start: "09:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "17:00" }],
    thu: [{ start: "09:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "17:00" }],
  },
  closures: [{ date: "2026-07-03" }],
};

/** Tuesday 2 June 2026, 10:00 in New York. */
const TUESDAY_10 = Date.parse("2026-06-02T14:00:00.000Z");
const MINUTE = 60_000;

const at = (ms: number) => new Date(ms).toISOString();

export function runSentryScenarios(values: Record<string, unknown>): ScenarioResult[] {
  const window = Number(values["response.first_touch_minutes"] ?? 15);
  const warn = Number(values["response.warning_threshold_percent"] ?? 75);
  const counted = (values["response.counted_touch_types"] as string[] | undefined) ?? ["call", "text", "email"];
  const mode = (values["response.after_hours"] as AfterHoursMode | undefined) ?? "keep_running";
  const afterHours = Number(values["response.after_hours_window_minutes"] ?? 120);
  const levels = ((values["escalation.levels"] as EscalationLevel[] | undefined) ?? []).filter((row) => Number.isFinite(row.after_windows));
  const cadence = (values["response.follow_up_cadence"] as Array<{ stage: string; max_gap_hours: number }> | undefined) ?? [];
  const channel = counted.includes("call") ? "call" : counted.includes("text") ? "sms" : "email";

  const base = (over: Partial<ClockInput>): ClockInput => ({
    now: at(TUESDAY_10),
    startedAt: at(TUESDAY_10),
    kind: "first_touch",
    windowMinutes: window,
    afterHoursWindowMinutes: afterHours,
    mode: "keep_running",
    warningPercent: warn,
    hours: WEEK,
    timeZone: ZONE,
    countedChannels: counted,
    touches: [],
    closed: false,
    optedOut: false,
    doNotContact: false,
    merged: false,
    ...over,
  });
  const after = (fraction: number) => at(TUESDAY_10 + fraction * window * MINUTE);
  const human = (fraction: number, extra: Partial<ClockTouch> = {}): ClockTouch => ({ at: after(fraction), type: "human", channel, ...extra });

  const results: ScenarioResult[] = [];
  const expectState = (id: string, label: string, input: ClockInput, expected: ClockState) => {
    const actual = evaluateClock(input).state;
    results.push({ id, label, expected, actual, passed: actual === expected });
  };

  expectState("on_time", "A new lead early in its window is on time", base({ now: after(0.2) }), "on_time");
  expectState("at_risk", `Past ${warn}% of the window is at risk`, base({ now: after((warn + (100 - warn) / 2) / 100) }), "at_risk");
  expectState("missed", "Past the window with no person is missed", base({ now: after(1.5) }), "missed");
  expectState("system_touch", "An automated message does not stop the clock", base({ now: after(1.5), touches: [{ at: after(0.1), type: "system", channel: "sms" }] }), "missed");
  expectState("human_touch", "A person reaching the lead resolves the clock", base({ now: after(1.5), touches: [human(0.5)] }), "resolved");
  expectState("manual_touch", "A touch logged by hand still counts", base({ now: after(1.5), touches: [human(0.5, { manual: true })] }), "resolved");
  expectState("uncounted_channel", "A channel the settings do not count does not stop the clock", base({ now: after(1.5), touches: [human(0.5, { channel: "dm" })] }), "missed");
  expectState("opted_out", "An opted-out lead is not watched", base({ now: after(1.5), optedOut: true }), "not_applicable");
  expectState("do_not_contact", "A do-not-contact lead is not watched", base({ now: after(1.5), doNotContact: true }), "not_applicable");
  expectState("closed", "A closed lead is not watched", base({ now: after(1.5), closed: true }), "not_applicable");
  expectState("merged", "A merged lead is not watched", base({ now: after(1.5), merged: true }), "not_applicable");
  expectState("hours_missing", "Missing business hours stop the clock instead of guessing", base({ now: after(1.5), hoursMissing: true }), "not_applicable");

  const fridayLate = Date.parse("2026-06-05T20:55:00.000Z");
  const pausedWeekend = evaluateClock(base({ mode: "pause", startedAt: at(fridayLate), now: "2026-06-06T16:00:00.000Z" }));
  results.push({
    id: "pause_weekend",
    label: "Pause mode holds the clock over the weekend",
    expected: window > 5 ? "paused, due Monday" : "missed by Friday close",
    actual: `${pausedWeekend.state}${pausedWeekend.deadlineAt?.startsWith("2026-06-08") ? ", due Monday" : ""}`,
    passed: window > 5 ? pausedWeekend.state === "paused" && Boolean(pausedWeekend.deadlineAt?.startsWith("2026-06-08")) : pausedWeekend.state === "missed",
  });

  const beforeHoliday = Date.parse("2026-07-02T20:59:00.000Z");
  const holiday = evaluateClock(base({ mode: "pause", startedAt: at(beforeHoliday), now: at(beforeHoliday + MINUTE) }));
  const skipsHoliday = Boolean(holiday.deadlineAt && !holiday.deadlineAt.startsWith("2026-07-03"));
  results.push({ id: "holiday", label: "A closure day does not count toward the window", expected: "deadline after the closure", actual: holiday.deadlineAt ?? "none", passed: skipsHoliday });

  const beforeDst = Date.parse("2026-03-08T06:30:00.000Z");
  const dst = evaluateClock(base({ startedAt: at(beforeDst), now: at(beforeDst + MINUTE) }));
  const dstExpected = at(beforeDst + window * MINUTE);
  results.push({ id: "daylight_saving", label: "A running clock is not shifted by the daylight saving change", expected: dstExpected, actual: dst.deadlineAt ?? "none", passed: dst.deadlineAt === dstExpected });

  const saturday = Date.parse("2026-06-06T15:00:00.000Z");
  const separate = evaluateClock(base({ mode: "separate_window", startedAt: at(saturday), now: at(saturday + MINUTE) }));
  const separateExpected = at(saturday + afterHours * MINUTE);
  results.push({ id: "separate_window", label: "After hours uses the longer window when set", expected: separateExpected, actual: separate.deadlineAt ?? "none", passed: separate.deadlineAt === separateExpected });

  const templateMode = evaluateClock(base({ mode, startedAt: at(saturday), now: at(saturday + (window + 1) * MINUTE) }));
  const modeExpected: ClockState = mode === "keep_running" ? "missed" : mode === "pause" ? "paused" : window + 1 >= afterHours ? "missed" : "on_time";
  results.push({ id: "template_after_hours", label: `This template's after-hours rule (${mode.replaceAll("_", " ")})`, expected: modeExpected, actual: templateMode.state, passed: templateMode.state === modeExpected || (mode === "separate_window" && templateMode.state === "at_risk") });

  const stage = cadence[0];
  if (stage) {
    const gap = stage.max_gap_hours * 60;
    const start = human(0);
    const follow = evaluateClock(base({ kind: "follow_up", windowMinutes: gap, startedAt: start.at, now: at(TUESDAY_10 + (gap + 30) * MINUTE), touches: [start] }));
    results.push({ id: "follow_up_self", label: "The touch that starts a follow-up does not also end it", expected: "missed", actual: follow.state, passed: follow.state === "missed" });
    const startAt = followUpStart([{ at: after(1), type: "human", channel }, { at: after(3), type: "system", channel: "sms" }], counted, after(0));
    results.push({ id: "follow_up_start", label: "A follow-up starts at the latest person's touch, not an automated one", expected: after(1), actual: startAt, passed: startAt === after(1) });
  }

  const sorted = [...levels].sort((a, b) => a.after_windows - b.after_windows);
  sorted.forEach((level, index) => {
    const actual = escalationLevel(level.after_windows, sorted);
    results.push({ id: `escalation_${index + 1}`, label: `At ${level.after_windows}× the window, escalation step ${index + 1} (${level.severity})`, expected: String(index + 1), actual: String(actual), passed: actual === index + 1 && levelFor(index + 1, sorted)?.severity === level.severity });
  });
  const early = escalationLevel(0.9, sorted);
  results.push({ id: "escalation_early", label: "No escalation while still inside the window", expected: "none", actual: early == null ? "none" : String(early), passed: early == null });

  const quiet = values["escalation.quiet_hours"];
  const exception = values["escalation.urgent_exception"];
  const warning = holdForQuietHours({ quietHours: quiet, urgentException: exception, severity: "warning", open: false });
  results.push({ id: "quiet_warning", label: "A warning outside business hours waits when quiet hours apply", expected: quiet === "none" ? "sent" : "held", actual: warning ? "held" : "sent", passed: warning === (quiet !== "none") });
  const critical = holdForQuietHours({ quietHours: quiet, urgentException: exception, severity: "critical", open: false });
  const criticalHeld = quiet !== "none" && exception !== "critical" && exception !== "urgent_and_critical";
  results.push({ id: "quiet_critical", label: "A critical alert follows the quiet-hours exception", expected: criticalHeld ? "held" : "sent", actual: critical ? "held" : "sent", passed: critical === criticalHeld });
  const open = holdForQuietHours({ quietHours: quiet, urgentException: exception, severity: "warning", open: true });
  results.push({ id: "quiet_open", label: "Nothing waits during business hours", expected: "sent", actual: open ? "held" : "sent", passed: !open });

  const person = (id: string) => ({ memberId: id, userId: id });
  const unassigned = routeTargets(["assignee"], { assignee: null, setters: [person("setter")], closers: [], managers: [person("owner")] });
  results.push({ id: "route_unassigned", label: "An unassigned lead's alert goes to the setters", expected: "setter", actual: unassigned.targets.map((t) => t.memberId).join(", "), passed: unassigned.targets.length === 1 && unassigned.targets[0].memberId === "setter" });
  const empty = routeTargets(["setters"], { assignee: null, setters: [], closers: [], managers: [person("owner")] });
  results.push({ id: "route_fallback", label: "A role with nobody in it falls back to the owners", expected: "owner", actual: empty.targets.map((t) => t.memberId).join(", "), passed: empty.fellBack && empty.targets[0]?.memberId === "owner" });

  return results;
}
