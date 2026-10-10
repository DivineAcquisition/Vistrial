import { describe, expect, it } from "vitest";

import { leadSuppressionFromEvent } from "@/lib/compliance/email-suppression";
import { missingDisclosures, quietSendTime } from "@/lib/compliance/rules";
import { registryPlatformValues } from "@/lib/config/registry";
import { timeoutChoice, waitedTooLong, waitLimitMinutes } from "@/lib/gate/timeout";
import { pickChannel } from "@/lib/relay/facts";
import { buildFooter } from "@/lib/relay/footer";

const ORG = "2bbccf35-f754-412c-8106-f47f2bee6dd7";
const LEAD = "e88478ee-65f8-474d-b372-5080149c6941";

describe("required disclosures at send time", () => {
  it("finds what is missing, ignoring case and spacing", () => {
    const required = ["Reply STOP to opt out.", "Msg & data rates may apply."];
    expect(missingDisclosures("Hi Sam.  reply stop   to OPT out. Msg & data rates may apply.", required)).toEqual([]);
    expect(missingDisclosures("Hi Sam.", required)).toEqual(required);
    expect(missingDisclosures("Hi Sam. Reply STOP to opt out.", required)).toEqual(["Msg & data rates may apply."]);
  });

  it("asks for nothing when no disclosures are set", () => {
    expect(missingDisclosures("Hi", [])).toEqual([]);
    expect(missingDisclosures("Hi", undefined)).toEqual([]);
    expect(missingDisclosures("Hi", ["", "  "])).toEqual([]);
  });

  it("is always satisfied by the footer Relay adds", () => {
    const disclosures = ["Msg & data rates may apply.", "Acme Co, 1 Main St."];
    const footer = buildFooter({ channel: "sms", optOutWords: ["STOP"], disclosures });
    expect(missingDisclosures(`Hi Sam, ready when you are.\n\n${footer}`, disclosures)).toEqual([]);
  });
});

describe("one quiet-hours rule", () => {
  const rules = { quietHours: { start: "20:00", end: "08:00" }, basis: "lead_local" as const };

  it("waits until quiet hours end in the lead's own time zone", () => {
    const now = new Date("2026-10-10T06:00:00Z");
    const at = quietSendTime({ now, rules, leadZones: ["America/Los_Angeles"], workspaceTimeZone: "America/New_York" });
    expect(at.toISOString()).toBe("2026-10-10T15:00:00.000Z");
  });

  it("sends now outside quiet hours", () => {
    const now = new Date("2026-10-10T18:00:00Z");
    expect(quietSendTime({ now, rules, leadZones: ["America/Los_Angeles"], workspaceTimeZone: "America/New_York" })).toEqual(now);
  });

  it("uses the business's time zone when that is the rule", () => {
    const now = new Date("2026-10-10T02:00:00Z");
    const at = quietSendTime({
      now,
      rules: { ...rules, basis: "workspace" },
      leadZones: ["America/Los_Angeles"],
      workspaceTimeZone: "America/New_York",
    });
    expect(at.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
});

describe("approval timeouts", () => {
  const values = registryPlatformValues() as Record<string, unknown>;

  it("uses an action's own longest wait before the workspace timeout", () => {
    expect(waitLimitMinutes("send_text", values)).toBe(240);
    const withOwn = {
      ...values,
      "approval.actions": [{ action: "send_text", mode: "ask_first", approver: "owners_and_managers", max_wait_minutes: 60 }],
    };
    expect(waitLimitMinutes("send_text", withOwn)).toBe(60);
    expect(waitLimitMinutes("send_email", withOwn)).toBe(240);
    expect(waitLimitMinutes("send_text", {}, 90)).toBe(90);
  });

  it("follows the timeout rule", () => {
    expect(timeoutChoice({ actionType: "slack_post", values: { ...values, "approval.timeout_behavior": "nothing" }, vistrialCanPerform: true })).toBe("wait");
    expect(timeoutChoice({ actionType: "slack_post", values, vistrialCanPerform: true })).toBe("escalate");
  });

  it("never lets anything that reaches a lead or client proceed on its own", () => {
    const proceed = { ...values, "approval.timeout_behavior": "proceed", "approval.timeout_proceed_confirmed": true };
    for (const type of ["send_text", "send_email", "first_reply", "client_report", "something_unknown"]) {
      expect(timeoutChoice({ actionType: type, values: proceed, vistrialCanPerform: true }), type).toBe("escalate");
    }
    expect(timeoutChoice({ actionType: "slack_post", values: proceed, vistrialCanPerform: true })).toBe("proceed");
    expect(timeoutChoice({ actionType: "slack_post", values: proceed, vistrialCanPerform: false })).toBe("escalate");
    expect(
      timeoutChoice({ actionType: "slack_post", values: { ...proceed, "approval.timeout_proceed_confirmed": false }, vistrialCanPerform: true })
    ).toBe("escalate");
    expect(
      timeoutChoice({ actionType: "slack_post", values: { ...proceed, "approval.never_auto": ["slack_post"] }, vistrialCanPerform: true })
    ).toBe("escalate");
  });

  it("measures the wait from when the request was made", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(waitedTooLong("2026-10-10T08:00:00Z", 240, now)).toBe(true);
    expect(waitedTooLong("2026-10-10T08:01:00Z", 240, now)).toBe(false);
    expect(waitedTooLong("not a date", 240, now)).toBe(false);
  });
});

describe("email bounces and complaints", () => {
  it("suppresses a lead on a permanent bounce or a complaint, from its own tags", () => {
    expect(
      leadSuppressionFromEvent({ type: "email.bounced", data: { email_id: "e1", tags: { org_id: ORG, lead_id: LEAD }, bounce: { type: "Permanent" } } })
    ).toEqual({ orgId: ORG, leadId: LEAD, reason: "bounced", providerId: "e1" });
    expect(
      leadSuppressionFromEvent({ type: "email.complained", data: { tags: [{ name: "org_id", value: ORG }, { name: "lead_id", value: LEAD }] } })
    ).toEqual({ orgId: ORG, leadId: LEAD, reason: "complained", providerId: null });
  });

  it("ignores temporary bounces, staff email, and anything without both tags", () => {
    expect(leadSuppressionFromEvent({ type: "email.bounced", data: { tags: { org_id: ORG, lead_id: LEAD }, bounce: { type: "Transient" } } })).toBeNull();
    expect(leadSuppressionFromEvent({ type: "email.bounced", data: { tags: { org_id: ORG } } })).toBeNull();
    expect(leadSuppressionFromEvent({ type: "email.bounced", data: { tags: { org_id: "x", lead_id: LEAD } } })).toBeNull();
    expect(leadSuppressionFromEvent({ type: "email.delivered", data: { tags: { org_id: ORG, lead_id: LEAD } } })).toBeNull();
  });

  it("stops Relay choosing email for a suppressed lead", () => {
    expect(pickChannel({ phone: null, email: "a@b.co" }, { emailSuppressed: true })).toBeNull();
    expect(pickChannel({ phone: "+1 555 201 7788", email: "a@b.co" }, { emailSuppressed: true })).toBe("sms");
  });
});
