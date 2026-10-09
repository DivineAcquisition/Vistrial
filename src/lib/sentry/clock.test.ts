import { describe, expect, it } from "vitest";

import type { BusinessHours } from "@/lib/config/clock";
import { evaluateClock, escalationLevel, validHumanTouch, type ClockInput } from "@/lib/sentry/clock";

const HOURS: BusinessHours = {
  days: {
    mon: [{ start: "09:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "17:00" }],
    thu: [{ start: "09:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "17:00" }],
  },
  closures: [{ date: "2026-07-04" }],
};

function input(over: Partial<ClockInput> = {}): ClockInput {
  return {
    now: "2026-06-02T14:00:00.000Z",
    startedAt: "2026-06-02T13:00:00.000Z",
    kind: "first_touch",
    windowMinutes: 60,
    afterHoursWindowMinutes: 180,
    mode: "keep_running",
    warningPercent: 75,
    hours: HOURS,
    timeZone: "UTC",
    countedChannels: ["call", "text", "email"],
    touches: [],
    closed: false,
    optedOut: false,
    doNotContact: false,
    merged: false,
    ...over,
  };
}

describe("Sentry clock", () => {
  it("stays on time, then at risk, then missed", () => {
    expect(evaluateClock(input({ now: "2026-06-02T13:20:00.000Z" })).state).toBe("on_time");
    expect(evaluateClock(input({ now: "2026-06-02T13:50:00.000Z" })).state).toBe("at_risk");
    const missed = evaluateClock(input({ now: "2026-06-02T14:10:00.000Z" }));
    expect(missed.state).toBe("missed");
    expect(missed.overdueMinutes).toBe(10);
  });

  it("resolves on a human touch and ignores an automated message", () => {
    const system = evaluateClock(input({ touches: [{ at: "2026-06-02T13:10:00.000Z", type: "system", channel: "sms" }] }));
    expect(system.state).not.toBe("resolved");
    const human = evaluateClock(input({ touches: [{ at: "2026-06-02T13:10:00.000Z", type: "human", channel: "sms", manual: true }] }));
    expect(human.state).toBe("resolved");
    expect(human.manual).toBe(true);
    expect(human.elapsedMinutes).toBe(10);
  });

  it("does not count a touch from before the clock, or a channel that is not configured", () => {
    expect(validHumanTouch([{ at: "2026-06-02T12:00:00.000Z", type: "human", channel: "call" }], "2026-06-02T13:00:00.000Z", ["call"])).toBeNull();
    expect(validHumanTouch([{ at: "2026-06-02T13:05:00.000Z", type: "human", channel: "dm" }], "2026-06-02T13:00:00.000Z", ["call"])).toBeNull();
  });

  it("suppresses opt-out, do not contact, closed, and merged leads", () => {
    expect(evaluateClock(input({ optedOut: true })).state).toBe("not_applicable");
    expect(evaluateClock(input({ doNotContact: true })).reason).toMatch(/do not contact/i);
    expect(evaluateClock(input({ closed: true })).state).toBe("not_applicable");
    expect(evaluateClock(input({ merged: true })).state).toBe("not_applicable");
  });

  it("pauses outside business hours and still misses once open time runs out", () => {
    const fridayClose = "2026-06-05T21:30:00.000Z";
    const paused = evaluateClock(input({ mode: "pause", startedAt: "2026-06-05T20:00:00.000Z", now: fridayClose, windowMinutes: 120, timeZone: "UTC" }));
    expect(paused.state).toBe("paused");
    const missed = evaluateClock(input({ mode: "pause", startedAt: "2026-06-05T15:00:00.000Z", now: "2026-06-08T14:00:00.000Z", windowMinutes: 30, timeZone: "UTC" }));
    expect(missed.state).toBe("missed");
  });

  it("uses the longer window when a lead arrives after hours", () => {
    const answer = evaluateClock(
      input({
        mode: "separate_window",
        startedAt: "2026-06-05T22:00:00.000Z",
        now: "2026-06-05T23:00:00.000Z",
        windowMinutes: 30,
        afterHoursWindowMinutes: 180,
      })
    );
    expect(answer.state).toBe("on_time");
  });

  it("treats a holiday as closed", () => {
    const answer = evaluateClock(
      input({
        mode: "pause",
        startedAt: "2026-07-03T16:00:00.000Z",
        now: "2026-07-04T15:00:00.000Z",
        windowMinutes: 120,
      })
    );
    expect(answer.state).toBe("paused");
  });

  it("keeps a deadline across the spring daylight saving change", () => {
    const answer = evaluateClock(
      input({
        mode: "keep_running",
        timeZone: "America/New_York",
        startedAt: "2026-03-08T06:30:00.000Z",
        now: "2026-03-08T07:00:00.000Z",
        windowMinutes: 90,
        hours: HOURS,
      })
    );
    expect(answer.deadlineAt).toBe("2026-03-08T08:00:00.000Z");
    expect(answer.state).toBe("on_time");
  });

  it("escalates only after the window, one level at a time", () => {
    const levels = [{ after_windows: 1 }, { after_windows: 2 }, { after_windows: 4 }];
    expect(escalationLevel(0.8, levels)).toBeNull();
    expect(escalationLevel(1, levels)).toBe(1);
    expect(escalationLevel(2.5, levels)).toBe(2);
    expect(escalationLevel(5, levels)).toBe(3);
  });

  it("stops when hours are missing instead of inventing a deadline", () => {
    expect(evaluateClock(input({ hoursMissing: true })).reason).toMatch(/business hours/i);
  });

  it("does not let the touch that started a follow-up also end it", () => {
    const touch = { at: "2026-06-02T13:00:00.000Z", type: "human" as const, channel: "call" };
    const answer = evaluateClock(input({ kind: "follow_up", now: "2026-06-02T14:10:00.000Z", touches: [touch] }));
    expect(answer.state).toBe("missed");
    expect(validHumanTouch([touch], touch.at, ["call"])).not.toBeNull();
    expect(validHumanTouch([touch], touch.at, ["call"], true)).toBeNull();
    const later = evaluateClock(input({ kind: "follow_up", touches: [touch, { ...touch, at: "2026-06-02T13:40:00.000Z" }] }));
    expect(later.state).toBe("resolved");
    expect(later.elapsedMinutes).toBe(40);
  });
});
