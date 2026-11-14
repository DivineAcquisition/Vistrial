import { describe, expect, it } from "vitest";

import { checkInput, emailHtml, isAllowedWrite, localHour, mayTriggerAutomation, messagingCheck, reachabilityOf, restrictionOf, reverseOf, summaryOf, writeRequest } from "./crmActions";

const NOW = Date.parse("2026-11-13T12:00:00Z");

describe("CRM action rules", () => {
  it("makes only a deal's outcome the Owner's alone", () => {
    expect(restrictionOf("set_status")).toBe("value");
    expect(restrictionOf("send_sms")).toBe("message");
    expect(restrictionOf("send_email")).toBe("message");
    for (const kind of ["move_stage", "add_tag", "remove_tag", "add_note", "create_task"] as const) expect(restrictionOf(kind)).toBeNull();
    expect(mayTriggerAutomation("move_stage")).toBe(true);
    expect(mayTriggerAutomation("add_note")).toBe(false);
  });

  it("checks and trims what an action needs", () => {
    expect(checkInput({ kind: "move_stage", dealId: "opp1" }, NOW)).toEqual({ ok: false, reason: "Choose the stage to move it to." });
    expect(checkInput({ kind: "set_status", dealId: "opp1", status: "deleted" }, NOW).ok).toBe(false);
    expect(checkInput({ kind: "add_tag", contactId: "c1", tag: "  hot   lead " }, NOW)).toEqual({ ok: true, value: { kind: "add_tag", contactId: "c1", tag: "hot lead" } });
    expect(checkInput({ kind: "add_tag", contactId: "c1", tag: "x".repeat(61) }, NOW).ok).toBe(false);
    expect(checkInput({ kind: "add_note", contactId: "../x", body: "hi" }, NOW).ok).toBe(false);
    expect(checkInput({ kind: "create_task", contactId: "c1", title: "Call", dueAt: NOW - 86_400_000 }, NOW).ok).toBe(false);
    expect(checkInput({ kind: "create_task", contactId: "c1", title: "Call", dueAt: NOW + 86_400_000 }, NOW).ok).toBe(true);
  });

  it("builds only the requests in HighLevel's spec, and the sender's allow-list matches them", () => {
    const requests = [
      writeRequest({ kind: "move_stage", dealId: "opp1", pipelineId: "p1", stageId: "s2" }),
      writeRequest({ kind: "set_status", dealId: "opp1", status: "lost" }),
      writeRequest({ kind: "add_tag", contactId: "c1", tag: "hot" }),
      writeRequest({ kind: "remove_tag", contactId: "c1", tag: "hot" }),
      writeRequest({ kind: "add_note", contactId: "c1", body: "n" }),
      writeRequest({ kind: "create_task", contactId: "c1", title: "t", dueAt: NOW }),
    ];
    expect(requests.map((row) => `${row.method} ${row.path}`)).toEqual([
      "PUT /opportunities/opp1",
      "PUT /opportunities/opp1/status",
      "POST /contacts/c1/tags",
      "DELETE /contacts/c1/tags",
      "POST /contacts/c1/notes",
      "POST /contacts/c1/tasks",
    ]);
    for (const row of requests) expect(isAllowedWrite(row.method, row.path)).toBe(true);
    // Deleting a contact or deal, messaging, booking and agency calls are never allowed.
    for (const [method, path] of [
      ["DELETE", "/contacts/c1"],
      ["DELETE", "/opportunities/opp1"],
      ["POST", "/calendars/events/appointments"],
      ["POST", "/contacts/"],
      ["PUT", "/contacts/c1"],
      ["POST", "/oauth/locationToken"],
      ["PUT", "/opportunities/opp1/../x"],
    ]) {
      expect(isAllowedWrite(method, path), `${method} ${path}`).toBe(false);
    }
    expect(() => writeRequest({ kind: "move_stage", dealId: "../../locations", pipelineId: "p", stageId: "s" })).toThrow();
  });

  it("reverses what can be reversed, and nothing else", () => {
    expect(reverseOf({ kind: "move_stage", dealId: "opp1", stageId: "s2" }, { stageId: "s1", pipelineId: "p1" })).toEqual({ kind: "move_stage", dealId: "opp1", stageId: "s1", pipelineId: "p1" });
    expect(reverseOf({ kind: "set_status", dealId: "opp1", status: "won" }, { status: "open" })).toEqual({ kind: "set_status", dealId: "opp1", status: "open" });
    expect(reverseOf({ kind: "add_tag", contactId: "c1", tag: "hot" }, undefined)).toEqual({ kind: "remove_tag", contactId: "c1", tag: "hot" });
    expect(reverseOf({ kind: "add_note", contactId: "c1", body: "n" }, undefined)).toBeNull();
    expect(reverseOf({ kind: "create_task", contactId: "c1", title: "t" }, undefined)).toBeNull();
  });

  it("describes an action without naming the lead", () => {
    expect(summaryOf({ kind: "move_stage", dealId: "opp1", stageId: "s2" }, { fromStage: "New", toStage: "Booked" })).toBe("HighLevel: move a deal from New to Booked");
    expect(summaryOf({ kind: "set_status", dealId: "opp1", status: "won" }, { fromStatus: "open" })).toBe("HighLevel: mark a deal won (now open)");
  });
});

describe("checks before messaging a lead", () => {
  const NOON_CHICAGO = Date.parse("2026-11-13T18:00:00Z");
  const reach = { phone: "+1555", email: "a@b.co", timezone: "America/Chicago", dnd: false, channelDnd: false };

  it("reads opt-outs from a fresh HighLevel contact, counting anything but inactive as on", () => {
    expect(reachabilityOf({ contact: { id: "c1", phone: "+1", dnd: false, dndSettings: { SMS: { status: "inactive" } } } }, "SMS")).toMatchObject({ dnd: false, channelDnd: false });
    expect(reachabilityOf({ contact: { id: "c1", dndSettings: { SMS: { status: "active" } } } }, "SMS")?.channelDnd).toBe(true);
    expect(reachabilityOf({ contact: { id: "c1", dndSettings: { SMS: { status: "permanent" } } } }, "SMS")?.channelDnd).toBe(true);
    expect(reachabilityOf({ contact: { id: "c1", dnd: true } }, "Email")?.dnd).toBe(true);
    expect(reachabilityOf({}, "SMS")).toBeNull();
  });

  it("passes only with no opt-out, an address, and 8 am to 8 pm in the lead's time", () => {
    expect(messagingCheck({ reach, channel: "SMS", locationTimezone: null, now: NOON_CHICAGO })).toEqual({ ok: true, timezone: "America/Chicago", localHour: 12 });
    expect(messagingCheck({ reach: { ...reach, channelDnd: true }, channel: "SMS", locationTimezone: null, now: NOON_CHICAGO })).toMatchObject({ ok: false, code: "opted_out" });
    expect(messagingCheck({ reach: { ...reach, phone: null }, channel: "SMS", locationTimezone: null, now: NOON_CHICAGO })).toMatchObject({ ok: false, code: "no_address" });
    expect(messagingCheck({ reach: null, channel: "SMS", locationTimezone: null, now: NOON_CHICAGO })).toMatchObject({ ok: false, code: "unreadable" });
    // 8 pm and 7 am in Chicago are quiet; 8 am is not.
    expect(messagingCheck({ reach, channel: "SMS", locationTimezone: null, now: Date.parse("2026-11-14T02:00:00Z") })).toMatchObject({ ok: false, code: "quiet_hours" });
    expect(messagingCheck({ reach, channel: "SMS", locationTimezone: null, now: Date.parse("2026-11-13T13:00:00Z") })).toMatchObject({ ok: false, code: "quiet_hours" });
    expect(messagingCheck({ reach, channel: "SMS", locationTimezone: null, now: Date.parse("2026-11-13T14:00:00Z") })).toMatchObject({ ok: true, localHour: 8 });
    // The lead's zone wins over the sub-account's; with neither, nothing is sent.
    expect(messagingCheck({ reach: { ...reach, timezone: null }, channel: "SMS", locationTimezone: "Asia/Tokyo", now: NOON_CHICAGO })).toMatchObject({ ok: false, code: "quiet_hours" });
    expect(messagingCheck({ reach: { ...reach, timezone: null }, channel: "SMS", locationTimezone: null, now: NOON_CHICAGO })).toMatchObject({ ok: false, code: "no_timezone" });
    expect(localHour("Not/AZone", NOON_CHICAGO)).toBeNull();
  });

  it("builds the message requests and escapes email HTML", () => {
    expect(writeRequest({ kind: "send_sms", contactId: "c1", body: "Hi" })).toEqual({ method: "POST", path: "/conversations/messages", body: { type: "SMS", contactId: "c1", message: "Hi" } });
    expect(isAllowedWrite("POST", "/conversations/messages")).toBe(true);
    expect(emailHtml('a <b> & "c"\nd\n\ne')).toBe("<p>a &lt;b&gt; &amp; &quot;c&quot;<br>d</p><p>e</p>");
    expect(checkInput({ kind: "send_sms", contactId: "c1", body: "x".repeat(641) }, 0).ok).toBe(false);
    expect(checkInput({ kind: "send_email", contactId: "c1", body: "hi" }, 0).ok).toBe(false);
  });
});
