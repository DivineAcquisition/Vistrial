import { describe, expect, it } from "vitest";

import {
  centsInWords,
  formatCents,
  formatDuration,
  groupSteps,
  resultWords,
  stepAnnouncement,
  stepLabel,
  summaryLine,
  toRunView,
  type RunRow,
  type RunStepView,
} from "@/lib/runs/view";

function step(index: number, toolSlug: string | null, kind: RunStepView["kind"] = "tool"): RunStepView {
  return {
    id: `s${index}`,
    index,
    kind,
    toolSlug,
    workKind: kind === "model" ? "write" : null,
    status: "completed",
    resultCode: "ok",
    durationMs: 10,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function row(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: "r1",
    agentSlug: "sales",
    skillSlug: "test-echo",
    status: "running",
    stopReason: null,
    costCents: 3,
    inputTokens: 10,
    outputTokens: 5,
    startedAt: 0,
    finishedAt: null,
    startedByName: "Ana",
    caps: { maxCostCentsPerRun: 25, maxCostCentsPerDay: 200, maxSteps: 40, maxDurationMs: 300000, softWarningCents: 20 },
    daySpentCents: 7,
    steps: [],
    artifacts: [],
    assets: [],
    ...overrides,
  };
}

describe("run view", () => {
  it("groups repeats of the same tool and keeps the first step's key", () => {
    const groups = groupSteps([step(0, "web.fetch"), step(1, "web.fetch"), step(2, null, "model"), step(3, "web.fetch")]);
    expect(groups.map((group) => group.type)).toEqual(["group", "single", "single"]);
    expect(groups[0].key).toBe("s0");
    expect(groups[0].type === "group" && groups[0].steps).toHaveLength(2);
    const grown = groupSteps([step(0, "web.fetch"), step(1, "web.fetch"), step(2, "web.fetch")]);
    expect(grown[0].key).toBe("s0");
  });

  it("names steps by tool and kind of work, never by model", () => {
    expect(stepLabel(step(0, "profile.read"))).toBe("Read the business profile");
    expect(stepLabel(step(1, null, "model"))).toBe("Wrote");
    expect(stepLabel(step(2, "unknown.tool"))).toBe("Used a tool");
  });

  it("says costs in plain words", () => {
    expect(formatCents(0.4)).toBe("under 1¢");
    expect(formatCents(42)).toBe("42¢");
    expect(formatCents(105)).toBe("$1.05");
    expect(centsInWords(42)).toBe("42 cents");
    expect(centsInWords(1)).toBe("1 cent");
    expect(centsInWords(105)).toBe("1 dollar and 5 cents");
    expect(centsInWords(0.2)).toBe("less than 1 cent");
  });

  it("formats durations", () => {
    expect(formatDuration(350)).toBe("under 1s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(185_000)).toBe("3m 05s");
    expect(formatDuration(3_720_000)).toBe("1h 02m");
  });

  it("builds the summary line from codes and numbers", () => {
    const capped = toRunView(row({ status: "stopped", stopReason: "cap", steps: [step(0, "profile.read")] }));
    expect(summaryLine(capped)).toBe("Stopped at a limit. 1 step ran. Nothing was saved.");
    const failed = toRunView(row({ status: "failed", steps: [{ ...step(0, "profile.read"), status: "failed", resultCode: "no_confirmed_profile" }] }));
    expect(summaryLine(failed)).toContain("not confirmed");
    const unknown = toRunView(row({ status: "something-new" }));
    expect(unknown.status).toBe("failed");
  });

  it("maps unknown result codes to a safe sentence", () => {
    expect(resultWords("brand_new_code")).toBe("Finished with an unknown result.");
  });

  it("announces the newest step only", () => {
    expect(stepAnnouncement([step(0, "profile.read"), step(1, null, "model")])).toBe("Step 2 finished: Wrote.");
    expect(stepAnnouncement([])).toBeNull();
  });
});
