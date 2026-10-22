import { describe, expect, it } from "vitest";

import type { LiveRun } from "@/lib/live/model";
import { agentMeterProgress, pickCurrentRun, workProgressPercent } from "@/lib/live/work-progress";

function run(partial: Partial<LiveRun>): LiveRun {
  return {
    id: partial.id ?? "r1",
    orgId: "o1",
    agentId: partial.agentId ?? "scribe",
    leadId: null,
    actorMemberId: null,
    subjectLabel: partial.subjectLabel ?? "the call from 2:14 PM",
    subjectHref: null,
    status: partial.status ?? "working",
    currentStepLabel: partial.currentStepLabel ?? null,
    plan: partial.plan ?? [],
    reasonSummary: null,
    plainError: null,
    needsPerson: null,
    sources: [],
    configVersion: null,
    batchId: null,
    simulated: false,
    cause: null,
    createdAt: partial.createdAt ?? "2026-10-08T14:00:00.000Z",
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    lastProgressAt: partial.lastProgressAt ?? "2026-10-08T14:30:00.000Z",
  };
}

describe("work progress", () => {
  it("stays empty with no run", () => {
    expect(workProgressPercent(null)).toBe(0);
    expect(agentMeterProgress(null)).toBe(0);
  });

  it("fills the bar when the run is done", () => {
    expect(workProgressPercent(run({ status: "completed" }))).toBe(100);
  });

  it("places the current step inside the plan", () => {
    const working = run({
      status: "working",
      plan: ["Reading the call", "Writing the case file", "Saving"],
      currentStepLabel: "Writing the case file",
    });
    expect(workProgressPercent(working)).toBe(48);
  });

  it("uses recorded steps when they exist", () => {
    const working = run({ status: "working", plan: ["One", "Two", "Three", "Four"] });
    expect(
      workProgressPercent(working, [
        { status: "done" },
        { status: "working" },
      ]),
    ).toBe(36);
  });

  it("does not treat a stopped run as finished", () => {
    expect(workProgressPercent(run({ status: "failed" }))).toBe(55);
    expect(workProgressPercent(run({ status: "stuck" }))).toBe(50);
  });

  it("keeps an idle agent at zero even if the last run finished", () => {
    expect(agentMeterProgress(run({ status: "completed" }))).toBe(0);
  });

  it("keeps the bar on an open run while the agent is paused", () => {
    const paused = run({
      status: "paused",
      plan: ["Checking", "Writing", "Saving"],
      currentStepLabel: "Writing",
    });
    expect(agentMeterProgress(paused)).toBe(48);
  });

  it("prefers an open run over a newer finished one", () => {
    const finished = run({ id: "done", status: "completed", lastProgressAt: "2026-10-08T16:00:00.000Z" });
    const open = run({ id: "open", status: "working", lastProgressAt: "2026-10-08T15:00:00.000Z" });
    const other = run({ id: "relay", agentId: "relay", status: "working", lastProgressAt: "2026-10-08T17:00:00.000Z" });
    expect(pickCurrentRun([finished, other, open], "scribe")?.id).toBe("open");
    expect(pickCurrentRun([finished], "scribe")?.id).toBe("done");
  });
});
