import { describe, expect, it } from "vitest";

import { checkInput, isAllowedWrite, mayTriggerAutomation, restrictionOf, reverseOf, summaryOf, writeRequest } from "./crmActions";

const NOW = Date.parse("2026-11-13T12:00:00Z");

describe("CRM action rules", () => {
  it("makes only a deal's outcome the Owner's alone", () => {
    expect(restrictionOf("set_status")).toBe("value");
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
      ["POST", "/conversations/messages"],
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
