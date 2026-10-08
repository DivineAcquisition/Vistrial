import { describe, expect, it } from "vitest";

import { businessMinutesBetween, isOpenAt, windowsElapsed, type BusinessHours } from "@/lib/config/clock";

const WEEKDAYS_9_TO_5: BusinessHours = {
  days: {
    mon: [{ start: "09:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "17:00" }],
    thu: [{ start: "09:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "17:00" }],
    sat: [],
    sun: [],
  },
  closures: [{ date: "2026-03-11" }],
};
const TZ = "America/Chicago";

describe("business hours clock", () => {
  it("counts only open minutes", () => {
    // Monday 4:30pm to Tuesday 9:15am Chicago: 30 minutes Monday, 15 Tuesday.
    expect(businessMinutesBetween(new Date("2026-03-09T21:30:00Z"), new Date("2026-03-10T14:15:00Z"), WEEKDAYS_9_TO_5, TZ)).toBe(45);
  });

  it("skips weekends and closed dates", () => {
    // Friday 4pm to Monday 10am: 60 + 60.
    expect(businessMinutesBetween(new Date("2026-03-13T21:00:00Z"), new Date("2026-03-16T15:00:00Z"), WEEKDAYS_9_TO_5, TZ)).toBe(120);
    // Wednesday 11 March is closed.
    expect(businessMinutesBetween(new Date("2026-03-11T15:00:00Z"), new Date("2026-03-11T20:00:00Z"), WEEKDAYS_9_TO_5, TZ)).toBe(0);
    expect(isOpenAt(new Date("2026-03-11T16:00:00Z"), WEEKDAYS_9_TO_5, TZ)).toBe(false);
    expect(isOpenAt(new Date("2026-03-10T16:00:00Z"), WEEKDAYS_9_TO_5, TZ)).toBe(true);
  });

  it("pauses the first-touch clock overnight when set to pause", () => {
    const args = {
      arrivedAt: new Date("2026-03-09T22:50:00Z"), // Monday 5:50pm, after closing
      now: new Date("2026-03-10T14:10:00Z"), // Tuesday 9:10am
      windowMinutes: 15,
      afterHoursWindowMinutes: 120,
      hours: WEEKDAYS_9_TO_5,
      timeZone: TZ,
    };
    expect(windowsElapsed({ ...args, mode: "pause" }).windows).toBeCloseTo(10 / 15);
    expect(windowsElapsed({ ...args, mode: "keep_running" }).windows).toBeGreaterThan(60);
    expect(windowsElapsed({ ...args, mode: "separate_window" }).windows).toBeCloseTo(920 / 120);
  });
});

describe("test run", () => {
  it("walks a sample lead through a seeded template without sending anything", async () => {
    const { resolveConfig } = await import("@/lib/config/resolve");
    const { registryPlatformValues, registryPlatformLocks, LAUNCH_COMPLIANCE_CHANGE } = await import("@/lib/config/registry");
    const { MED_SPA } = await import("@/lib/config/seeds");
    const { runConfigTest, defaultSampleLead, firstTouchDeadline } = await import("@/lib/config/test-run");
    const config = resolveConfig({
      platform: { values: { ...registryPlatformValues(), ...LAUNCH_COMPLIANCE_CHANGE.values }, lockedKeys: registryPlatformLocks(), version: 2 },
      template: { values: MED_SPA.values, lockedKeys: [], version: 1, slug: MED_SPA.slug },
      workspace: { values: { "identity.business_name": "Glow Spa", "identity.display_name": "Glow" }, lockedKeys: [], version: 1 },
    });
    const steps = runConfigTest(config.values, defaultSampleLead(new Date("2026-03-10T16:00:00Z")));
    expect(steps.map((step) => step.title)).toEqual(["Qualification", "Response window", "Sample first text (not sent)", "Compliance"]);
    expect(steps.every((step) => step.ok)).toBe(true);
    expect(steps[2].lines[0]).toContain("Glow");

    // Paused clock: a lead at 5:50pm Monday with a 15-minute window is due 9:15am Tuesday.
    const due = firstTouchDeadline({
      arrivedAt: new Date("2026-03-09T22:50:00Z"),
      mode: "pause",
      windowMinutes: 15,
      afterHoursWindowMinutes: 120,
      hours: WEEKDAYS_9_TO_5,
      timeZone: TZ,
    });
    expect(due.toISOString()).toBe("2026-03-10T14:15:00.000Z");
  });
});
