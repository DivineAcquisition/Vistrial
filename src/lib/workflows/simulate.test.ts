import { describe, expect, it } from "vitest";

import { checkWorkflow } from "@/lib/workflows/checker";
import { NEW_LEAD_RESPONSE, NO_SHOW_RECOVERY, QUOTE_GONE_QUIET, SAMPLE_WORKFLOWS, sampleCheckContext } from "@/lib/workflows/samples";
import { simulateWorkflow, simulationControls } from "@/lib/workflows/simulate";

const NY = { name: "Jordan", timeZone: "America/New_York" };

function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
}

describe("sample workflows", () => {
  it("each passes the checker against the sample playbook", () => {
    for (const sample of SAMPLE_WORKFLOWS) {
      const result = checkWorkflow(sample.graph, sampleCheckContext());
      expect(result.issues.filter((issue) => issue.severity === "error"), sample.name).toEqual([]);
    }
  });
});

describe("test with a sample lead", () => {
  it("holds a draft made at night until 8 am in the lead's time", () => {
    // 9:30 pm in New York.
    const run = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start: new Date("2026-10-22T01:30:00Z"), lead: NY });
    const draft = run.steps.find((step) => step.boxId === "d1");
    expect(draft?.heldForQuietHours).toBe(true);
    expect(draft?.sendAt?.toISOString()).toBe("2026-10-22T12:00:00.000Z");
    expect(draft?.sentence).toContain("inside quiet hours");
  });

  it("counts waits on the lead's clock and lands on the chosen time of day", () => {
    const run = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start: new Date("2026-10-22T01:30:00Z"), lead: NY });
    const wait = run.steps.find((step) => step.boxId === "w1");
    // Sent 8:00 am Oct 22, wait one day, then until 9:00 am: Oct 23, 9:00 am New York.
    expect(run.steps[run.steps.indexOf(wait!) + 1].at.toISOString()).toBe("2026-10-23T13:00:00.000Z");
  });

  it("follows the branch chosen at each Check", () => {
    const replied = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start: new Date("2026-10-22T15:00:00Z"), lead: NY, choices: { checks: { c1: "yes" } } });
    expect(replied.end).toMatchObject({ kind: "end", reason: "replied" });
    expect(replied.wouldCreate.drafts).toBe(1);

    const quiet = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start: new Date("2026-10-22T15:00:00Z"), lead: NY });
    expect(quiet.end).toMatchObject({ kind: "end", reason: "stopped" });
    expect(quiet.steps.map((step) => step.boxId)).toEqual(["s1", "d1", "w1", "c1", "d2", "w2", "c2", "t2", "e2"]);
    expect(quiet.wouldCreate).toEqual({ drafts: 2, tasks: 1, alerts: 1, routes: 0 });
  });

  it("takes the Expired exit when a draft is not approved in time, and sends nothing", () => {
    const run = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start: new Date("2026-10-22T15:00:00Z"), lead: NY, choices: { drafts: { d1: "expired" } } });
    const draft = run.steps.find((step) => step.boxId === "d1");
    expect(draft?.exit).toBe("expired");
    expect(draft?.sendAt).toBeNull();
    expect(run.steps[run.steps.indexOf(draft!) + 1].boxId).toBe("t1");
  });

  it("stops a counted loop at its maximum", () => {
    const run = simulateWorkflow(QUOTE_GONE_QUIET.graph, { start: new Date("2026-10-22T15:00:00Z"), lead: NY });
    expect(run.end.kind).toBe("loop_limit");
    // The check-in, then the nudge once plus two more passes.
    expect(run.wouldCreate.drafts).toBe(4);
    expect(run.steps.filter((step) => step.boxId === "d2")).toHaveLength(3);
    // The box a loop returns to carries the pass number.
    expect(run.steps.filter((step) => step.pass !== null).map((step) => [step.boxId, step.pass])).toEqual([
      ["w2", 1],
      ["w2", 2],
    ]);
  });

  it("never sends between 8 pm and 8 am in the lead's time, on any path", () => {
    const zones = ["America/New_York", "America/Los_Angeles", "America/Phoenix", "Pacific/Honolulu", "Europe/London"];
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 300; i++) {
      const sample = SAMPLE_WORKFLOWS[i % SAMPLE_WORKFLOWS.length];
      const timeZone = zones[i % zones.length];
      const start = new Date(Date.UTC(2026, 9, 1) + Math.floor(random() * 60 * 24 * 3_600_000));
      const checks = Object.fromEntries(
        simulationControls(sample.graph).filter((c) => c.kind === "check").map((c) => [c.boxId, random() < 0.5 ? "yes" : "no"])
      ) as Record<string, "yes" | "no">;
      const run = simulateWorkflow(sample.graph, { start, lead: { name: "Sample", timeZone }, choices: { checks } });
      for (const step of run.steps) {
        if (step.sendAt) {
          const hour = localHour(step.sendAt, timeZone);
          expect(hour >= 8 && hour < 20, `${sample.name} ${timeZone} ${step.sendAt.toISOString()}`).toBe(true);
        }
      }
    }
  });

  it("works the same lead differently in another time zone", () => {
    const start = new Date("2026-10-22T02:00:00Z");
    const east = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start, lead: NY });
    const west = simulateWorkflow(NEW_LEAD_RESPONSE.graph, { start, lead: { name: "Jordan", timeZone: "America/Los_Angeles" } });
    // 10 pm in New York is held; 7 pm in Los Angeles sends right away.
    expect(east.steps.find((step) => step.boxId === "d1")?.heldForQuietHours).toBe(true);
    expect(west.steps.find((step) => step.boxId === "d1")?.heldForQuietHours).toBe(false);
  });

  it("changes nothing: the graph is the same after a run", () => {
    const before = structuredClone(NO_SHOW_RECOVERY.graph);
    simulateWorkflow(NO_SHOW_RECOVERY.graph, { start: new Date(), lead: NY, choices: { checks: { c1: "no", c2: "no" } } });
    expect(NO_SHOW_RECOVERY.graph).toEqual(before);
  });

  it("says where a broken workflow gets stuck instead of guessing", () => {
    const run = simulateWorkflow(
      { boxes: [{ id: "s1", config: { kind: "start", trigger: "manual" } }], edges: [] },
      { start: new Date("2026-10-22T15:00:00Z"), lead: NY }
    );
    expect(run.end).toMatchObject({ kind: "stuck", boxId: "s1" });
  });
});
