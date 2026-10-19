import { describe, expect, it } from "vitest";

import { AGENTS, SALES_ROOM_IDS } from "@/lib/agents/roster";
import { canEditApprovalGate, canLockApprovalGate } from "@/lib/home/catalog";
import { departmentFeed, type LiveRun } from "@/lib/live/model";

function run(partial: Partial<LiveRun> & Pick<LiveRun, "id" | "agentId" | "createdAt">): LiveRun {
  return {
    orgId: "o1",
    leadId: "lead-1",
    actorMemberId: null,
    subjectLabel: partial.agentId,
    subjectHref: null,
    status: "completed",
    currentStepLabel: null,
    plan: [],
    reasonSummary: "Because the window passed.",
    plainError: null,
    needsPerson: null,
    sources: [],
    configVersion: null,
    batchId: null,
    simulated: false,
    cause: null,
    startedAt: null,
    finishedAt: partial.createdAt,
    lastProgressAt: partial.createdAt,
    ...partial,
  };
}

describe("departmentFeed", () => {
  it("joins a Relay draft only when Sentry's missed-window sweep started it", () => {
    const sentry = run({ id: "s", agentId: "sentry", createdAt: "2026-10-19T01:00:00Z" });
    const relay = run({ id: "r", agentId: "relay", createdAt: "2026-10-19T01:05:00Z", cause: "missed_window" });
    const other = run({ id: "o", agentId: "relay", createdAt: "2026-10-19T01:06:00Z", leadId: "lead-1", cause: null });
    const feed = departmentFeed([sentry, relay, other]);
    expect(feed.map((item) => item.kind)).toEqual(["single", "handoff"]);
    expect(feed[0]?.id).toBe("o");
    expect(feed[1]?.kind === "handoff" ? feed[1].from.id : "").toBe("s");
  });

  it("does not join two unrelated actions on the same lead", () => {
    const sentry = run({ id: "s", agentId: "sentry", createdAt: "2026-10-19T01:00:00Z" });
    const relay = run({ id: "r", agentId: "relay", createdAt: "2026-10-19T01:05:00Z", cause: null });
    expect(departmentFeed([sentry, relay]).every((item) => item.kind === "single")).toBe(true);
  });

  it("joins Scribe with the after-call Relay draft", () => {
    const scribe = run({ id: "sc", agentId: "scribe", createdAt: "2026-10-19T02:00:00Z" });
    const relay = run({ id: "rd", agentId: "relay", createdAt: "2026-10-19T02:02:00Z", cause: "after_call" });
    const feed = departmentFeed([scribe, relay]);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.kind).toBe("handoff");
  });
});

describe("sales room access and labels", () => {
  it("reads every title and description from the registry", () => {
    expect(SALES_ROOM_IDS.map((id) => AGENTS[id].name)).toEqual(["Compass", "Scribe", "Assay", "Sentry", "Relay"]);
    expect(AGENTS.compass.sublabel).toBe("Sales Director");
    expect(AGENTS.assay.description).toBe("Scores your leads and puts your queue in order.");
    expect(AGENTS.relay.role).toBe(AGENTS.relay.sublabel);
  });

  it("lets an Owner change a gate level and refuses a Member or Operator", () => {
    expect(canEditApprovalGate("owner", false)).toBe(true);
    expect(canEditApprovalGate("member", false)).toBe(false);
    expect(canEditApprovalGate("operator", false)).toBe(false);
    expect(canEditApprovalGate("setter", false)).toBe(false);
    expect(canEditApprovalGate("setter", true)).toBe(true);
  });

  it("lets only configuration staff lock a level", () => {
    expect(canLockApprovalGate(true, false)).toBe(true);
    expect(canLockApprovalGate(false, true)).toBe(true);
    expect(canLockApprovalGate(false, false)).toBe(false);
  });
});
