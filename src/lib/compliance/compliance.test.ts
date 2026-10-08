import { describe, expect, it } from "vitest";

import { inboundMessageText } from "@/lib/compliance/inbound";
import { leadTimeZones, zonesForPhone } from "@/lib/compliance/lead-timezone";
import {
  checkQuietHours,
  complianceRulesFrom,
  decideCompliance,
  isOptInReply,
  isOptOutReply,
  type ComplianceRules,
} from "@/lib/compliance/rules";
import { registryPlatformValues, LAUNCH_COMPLIANCE_CHANGE } from "@/lib/config/registry";

const NIGHT = { start: "20:00", end: "08:00" };

const LAUNCH_RULES: ComplianceRules = complianceRulesFrom({
  ...registryPlatformValues(),
  ...LAUNCH_COMPLIANCE_CHANGE.values,
});

describe("lead time zone", () => {
  it("prefers the time zone stored on the lead", () => {
    expect(leadTimeZones({ timezone: "America/Los_Angeles", phone: "+1 212 555 0100" }, "America/Chicago")).toEqual({
      zones: ["America/Los_Angeles"],
      basis: "stored",
      uncertain: false,
    });
  });

  it("reads the zone from the area code, with or without a country code", () => {
    expect(zonesForPhone("+1 (212) 555-0100", "America/Chicago")).toEqual(["America/New_York"]);
    expect(zonesForPhone("(406) 555-0100", "America/Chicago")).toEqual(["America/Denver"]);
  });

  it("lists every zone when the number could be in several, and marks it uncertain", () => {
    // Idaho's area code covers both Mountain and Pacific time.
    expect(leadTimeZones({ phone: "+1 208 555 0100" }, "America/Chicago")).toEqual({
      zones: ["America/Boise", "America/Los_Angeles"],
      basis: "phone",
      uncertain: true,
    });
    expect(zonesForPhone("+61 2 5550 1234", "America/Chicago")).toEqual(["Australia/Sydney"]);
  });

  it("falls back to the business's zone only when nothing else is known", () => {
    expect(leadTimeZones({ timezone: "Not/AZone", phone: null }, "America/Chicago")).toEqual({
      zones: ["America/Chicago"],
      basis: "workspace",
      uncertain: false,
    });
    // A toll-free number says nothing more than "North America".
    expect(leadTimeZones({ phone: "+1 800 555 0100" }, "America/Chicago").basis).toBe("workspace");
    expect(zonesForPhone("not a number", "America/Chicago")).toEqual([]);
  });
});

describe("opt-out words", () => {
  const words = LAUNCH_COMPLIANCE_CHANGE.values["compliance.opt_out_words"] as string[];

  it("matches a reply that is exactly the word, in any case or punctuation", () => {
    for (const reply of ["STOP", "stop", " Stop! ", "unsubscribe.", "Quit"]) {
      expect(isOptOutReply(reply, words), reply).toBe(true);
    }
  });

  it("does not match a sentence that contains the word", () => {
    for (const reply of ["Please don't stop", "stop by tomorrow?", "Can we end at 5", ""]) {
      expect(isOptOutReply(reply, words), reply).toBe(false);
    }
  });

  it("does nothing when the list is empty (the setting before launch)", () => {
    expect(isOptOutReply("STOP", [])).toBe(false);
  });

  it("recognises texting back in", () => {
    expect(isOptInReply("start")).toBe(true);
    expect(isOptInReply("UNSTOP")).toBe(true);
    expect(isOptInReply("let's start")).toBe(false);
  });

  it("reads the reply text from the original webhook body", () => {
    expect(inboundMessageText(JSON.stringify({ type: "InboundMessage", body: "STOP" }))).toBe("STOP");
    expect(inboundMessageText(JSON.stringify({ data: { message: "Stop" } }))).toBe("Stop");
    expect(inboundMessageText("not json")).toBeNull();
  });
});

describe("quiet hours in the lead's local time", () => {
  it("holds a message when it is night where the lead is, even if it is day for the business", () => {
    // 9:30pm in New York is 6:30pm in Los Angeles.
    const now = new Date("2026-03-10T01:30:00Z");
    const check = checkQuietHours(now, NIGHT, ["America/New_York"]);
    expect(check.quiet).toBe(true);
    if (check.quiet) expect(check.resumeAt.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(checkQuietHours(now, NIGHT, ["America/Los_Angeles"]).quiet).toBe(false);
  });

  it("uses the stricter result when the lead could be in several zones", () => {
    // 7:30am in Chicago, 8:30am in New York: still quiet in Chicago.
    const now = new Date("2026-03-10T12:30:00Z");
    const check = checkQuietHours(now, NIGHT, ["America/New_York", "America/Chicago"]);
    expect(check.quiet).toBe(true);
    if (check.quiet) expect(check.resumeAt.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  it("is open once it is daytime in every possible zone", () => {
    expect(checkQuietHours(new Date("2026-03-10T16:00:00Z"), NIGHT, ["America/New_York", "America/Los_Angeles"]).quiet).toBe(false);
  });
});

describe("the send decision", () => {
  const base = {
    now: new Date("2026-03-10T17:00:00Z"),
    rules: LAUNCH_RULES,
    lead: { optedOutAt: null, zones: ["America/Chicago"] },
    workspaceTimeZone: "America/Chicago",
    sent: { today: 0, lastSevenDays: 0, oldestInWeek: null },
    autoRun: false,
  };

  it("sends when nothing is in the way", () => {
    expect(decideCompliance(base).action).toBe("send");
  });

  it("never sends to a lead who opted out", () => {
    expect(decideCompliance({ ...base, lead: { ...base.lead, optedOutAt: "2026-03-09T00:00:00Z" } })).toEqual({
      action: "block",
      reason: "opted_out",
    });
  });

  it("applies the daily limit to every send, approved or not, after launch", () => {
    const capped = decideCompliance({ ...base, sent: { today: 2, lastSevenDays: 2, oldestInWeek: null } });
    expect(capped.action).toBe("defer");
    if (capped.action === "defer") {
      expect(capped.reason).toBe("daily_cap");
      expect(capped.until.toISOString()).toBe("2026-03-11T05:00:00.000Z");
    }
  });

  it("before launch, the limit only covered messages sent without approval", () => {
    const rules = complianceRulesFrom(registryPlatformValues());
    const sent = { today: 5, lastSevenDays: 5, oldestInWeek: null };
    expect(decideCompliance({ ...base, rules, sent }).action).toBe("send");
    expect(decideCompliance({ ...base, rules, sent, autoRun: true }).action).toBe("defer");
  });

  it("uses the business's clock when quiet hours follow the workspace", () => {
    const rules = { ...LAUNCH_RULES, basis: "workspace" as const };
    // 9pm in New York, 6pm in Los Angeles where the business is.
    const now = new Date("2026-03-10T01:00:00Z");
    const lead = { optedOutAt: null, zones: ["America/New_York"] };
    expect(decideCompliance({ ...base, now, rules, lead, workspaceTimeZone: "America/Los_Angeles" }).action).toBe("send");
    expect(decideCompliance({ ...base, now, lead, workspaceTimeZone: "America/Los_Angeles" }).action).toBe("defer");
  });

  it("holds for the weekly limit when one is set", () => {
    const rules = { ...LAUNCH_RULES, caps: { ...LAUNCH_RULES.caps, weeklyCap: 3 } };
    const oldest = new Date("2026-03-05T15:00:00Z");
    const result = decideCompliance({ ...base, rules, sent: { today: 0, lastSevenDays: 3, oldestInWeek: oldest } });
    expect(result.action).toBe("defer");
    if (result.action === "defer") expect(result.reason).toBe("weekly_cap");
  });
});
