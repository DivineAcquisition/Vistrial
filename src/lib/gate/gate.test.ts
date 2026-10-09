import { describe, expect, it } from "vitest";

import { APPROVAL_ACTIONS } from "@/lib/config/registry";
import { canDecide, gateAction, mayRunWithoutPerson, needsPerson, requestState, REQUEST_STATES } from "@/lib/gate/registry";
import { isOpenRequest } from "@/lib/live/model";
import { clockTouchFromRow } from "@/lib/sentry/clock";

describe("approval gate registry", () => {
  it("never lets anything that reaches a lead or client run without a person", () => {
    for (const action of APPROVAL_ACTIONS.filter((row) => row.reachesPeople)) {
      expect(mayRunWithoutPerson(action.value, "auto_run"), action.value).toBe(false);
      expect(gateAction(action.value).perform).toBe("person_sends");
      expect(gateAction(action.value).recheck).toEqual(expect.arrayContaining(["opted_out", "do_not_contact", "lead_replied", "expired"]));
    }
    expect(mayRunWithoutPerson("setter_nudge", "auto_run")).toBe(true);
  });

  it("treats an unknown action as reaching people", () => {
    expect(gateAction("something_new").reachesPeople).toBe(true);
    expect(mayRunWithoutPerson("something_new", "auto_run")).toBe(false);
  });

  it("maps every stored status to one shared state", () => {
    expect(["pending", "approved", "dismissed", "expired", "withdrawn", "running", "succeeded", "failed"].map(requestState)).toEqual([...REQUEST_STATES]);
    expect(needsPerson("approved")).toBe(true);
    expect(needsPerson("succeeded")).toBe(false);
    expect(isOpenRequest("approved")).toBe(true);
    expect(isOpenRequest("withdrawn")).toBe(false);
  });

  it("matches the database's rule for who decides", () => {
    const base = { rule: "owners_and_managers", role: "member" as const, canApprove: true, isStaff: false, isAssigned: false, assignedSomeone: true };
    expect(canDecide(base)).toBe(true);
    expect(canDecide({ ...base, canApprove: false })).toBe(false);
    expect(canDecide({ ...base, role: "operator" })).toBe(false);
    expect(canDecide({ ...base, rule: "owner_only" })).toBe(false);
    expect(canDecide({ ...base, rule: "owner_only", role: "owner" })).toBe(true);
    expect(canDecide({ ...base, rule: "assigned" })).toBe(false);
    expect(canDecide({ ...base, rule: "assigned", isAssigned: true })).toBe(true);
    expect(canDecide({ ...base, role: null, canApprove: false, isStaff: true })).toBe(true);
  });
});

describe("Relay touches on the response clock", () => {
  const row = { occurred_at: "2026-10-09T10:00:00Z", type: "human", channel: "sms", queued_offline: false, drafted_by_agent: "relay" };

  it("counts an approved Relay message as a human touch unless the workspace turned that off", () => {
    expect(clockTouchFromRow(row, undefined).type).toBe("human");
    expect(clockTouchFromRow(row, true).type).toBe("human");
    expect(clockTouchFromRow(row, false).type).toBe("system");
  });

  it("leaves other touches alone", () => {
    expect(clockTouchFromRow({ ...row, drafted_by_agent: null }, false).type).toBe("human");
    expect(clockTouchFromRow({ ...row, type: "automated", drafted_by_agent: null }, true).type).toBe("system");
  });
});
