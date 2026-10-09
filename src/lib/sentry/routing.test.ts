import { describe, expect, it } from "vitest";

import { followUpStart, holdForQuietHours, levelFor, routeChannels, routeTargets } from "@/lib/sentry/routing";

const person = (id: string) => ({ memberId: id, userId: `u-${id}` });

describe("Sentry routing", () => {
  it("tells the roles a level names", () => {
    const ctx = { assignee: person("a"), setters: [person("s1"), person("s2")], closers: [person("c")], managers: [person("m")] };
    expect(routeTargets(["assignee"], ctx).targets.map((t) => t.memberId)).toEqual(["a"]);
    expect(routeTargets(["setters", "managers"], ctx).targets.map((t) => t.memberId)).toEqual(["s1", "s2", "m"]);
    expect(routeTargets(["closers"], ctx).targets.map((t) => t.memberId)).toEqual(["c"]);
  });

  it("sends an unassigned lead to setters and an empty role to managers", () => {
    const ctx = { assignee: null, setters: [], closers: [], managers: [person("m")] };
    const route = routeTargets(["assignee"], ctx);
    expect(route.targets.map((t) => t.memberId)).toEqual(["m"]);
    expect(route.fellBack).toBe(true);
    expect(routeTargets(["service_team"], ctx).targets.map((t) => t.memberId)).toEqual(["m"]);
  });

  it("maps settings channels and always keeps the in-app note", () => {
    expect(routeChannels(["team_channel"]).sort()).toEqual(["push", "team"]);
    expect(routeChannels(["email", "sms"]).sort()).toEqual(["email", "push", "sms"]);
    expect(routeChannels(undefined)).toEqual(["push"]);
  });

  it("holds alerts in quiet hours unless the severity is excepted", () => {
    const base = { quietHours: "outside_business_hours", urgentException: "critical", open: false };
    expect(holdForQuietHours({ ...base, severity: "warning" })).toBe(true);
    expect(holdForQuietHours({ ...base, severity: "critical" })).toBe(false);
    expect(holdForQuietHours({ ...base, severity: "urgent" })).toBe(true);
    expect(holdForQuietHours({ ...base, urgentException: "urgent_and_critical", severity: "urgent" })).toBe(false);
    expect(holdForQuietHours({ ...base, urgentException: "none", severity: "critical" })).toBe(true);
    expect(holdForQuietHours({ ...base, quietHours: "none", severity: "warning" })).toBe(false);
    expect(holdForQuietHours({ ...base, open: true, severity: "warning" })).toBe(false);
  });

  it("picks the level in after-windows order", () => {
    const levels = [
      { severity: "critical", after_windows: 4, notify: ["managers"], channels: ["push"] },
      { severity: "warning", after_windows: 1, notify: ["assignee"], channels: ["push"] },
    ];
    expect(levelFor(0, levels)).toBeNull();
    expect(levelFor(1, levels)?.severity).toBe("warning");
    expect(levelFor(2, levels)?.severity).toBe("critical");
    expect(levelFor(9, levels)?.severity).toBe("critical");
  });

  it("starts a follow-up at the latest counted human touch", () => {
    const touches = [
      { at: "2026-06-02T15:00:00.000Z", type: "system", channel: "sms" },
      { at: "2026-06-02T14:00:00.000Z", type: "human", channel: "dm" },
      { at: "2026-06-02T13:00:00.000Z", type: "human", channel: "call" },
    ];
    expect(followUpStart(touches, ["call", "text"], "2026-06-02T12:00:00.000Z")).toBe("2026-06-02T13:00:00.000Z");
    expect(followUpStart([], ["call"], "2026-06-02T12:00:00.000Z")).toBe("2026-06-02T12:00:00.000Z");
  });
});
