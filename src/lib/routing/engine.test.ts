import { describe, expect, it } from "vitest";

import {
  arrivalIdempotencyKey,
  receivedAfterReturn,
  routeLead,
  simulateFairness,
  type RoutingInput,
  type RoutingOperator,
} from "@/lib/routing/engine";

function person(id: string, overrides: Partial<RoutingOperator> = {}): RoutingOperator {
  return {
    memberId: id,
    name: id,
    active: true,
    away: false,
    weight: 1,
    openLeads: 0,
    overdueTasks: 0,
    maxOpenLeads: null,
    maxOverdueTasks: null,
    inHours: true,
    pools: [],
    received: 0,
    ...overrides,
  };
}

function input(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    mode: "round_robin",
    fallbackMode: "manual",
    operators: [person("maya"), person("jordan"), person("sam")],
    rules: [],
    lead: {
      source: "web",
      service: null,
      scoreBand: null,
      location: null,
      language: null,
      previousMemberId: null,
      previousAt: null,
      assignedMemberId: null,
    },
    cursorMemberId: null,
    stickyDays: 30,
    respectHours: false,
    now: "2026-10-15T15:00:00.000Z",
    historic: false,
    pool: null,
    ...overrides,
  };
}

describe("routing", () => {
  it("leaves manual leads unassigned", () => {
    const decision = routeLead(input({ mode: "manual" }));
    expect(decision.memberId).toBeNull();
    expect(decision.explanation).toMatch(/unassigned/);
  });

  it("skips someone who is away without giving them a backlog later", () => {
    const first = routeLead(input({ operators: [person("maya", { away: true }), person("jordan"), person("sam")] }));
    expect(first.memberId).toBe("jordan");
    expect(first.skipped.map((row) => row.memberId)).toContain("maya");
    const second = routeLead(
      input({
        cursorMemberId: first.cursorMemberId,
        operators: [person("maya"), person("jordan"), person("sam")],
      })
    );
    expect(second.memberId).toBe("sam");
  });

  it("does not assign twice when the lead already has a person", () => {
    const decision = routeLead(input({ lead: { ...input().lead, assignedMemberId: "maya" } }));
    expect(decision.mode).toBe("already_assigned");
    expect(decision.memberId).toBe("maya");
    expect(decision.cursorMemberId).toBeNull();
  });

  it("sends a returning lead back when the person is eligible", () => {
    const decision = routeLead(
      input({
        lead: {
          ...input().lead,
          previousMemberId: "sam",
          previousAt: "2026-10-01T15:00:00.000Z",
        },
      })
    );
    expect(decision.mode).toBe("sticky");
    expect(decision.memberId).toBe("sam");
  });

  it("falls through sticky when that person is away", () => {
    const decision = routeLead(
      input({
        operators: [person("maya"), person("jordan"), person("sam", { away: true })],
        lead: {
          ...input().lead,
          previousMemberId: "sam",
          previousAt: "2026-10-01T15:00:00.000Z",
        },
      })
    );
    expect(decision.mode).not.toBe("sticky");
    expect(decision.memberId).toBe("maya");
  });

  it("uses the first matching rule and falls back when none match", () => {
    const matched = routeLead(
      input({
        mode: "rules",
        fallbackMode: "round_robin",
        rules: [
          {
            id: "1",
            enabled: true,
            position: 1,
            source: "web",
            service: null,
            scoreBand: null,
            location: null,
            language: null,
            targetMemberId: "jordan",
            targetPool: null,
          },
        ],
      })
    );
    expect(matched.memberId).toBe("jordan");
    const missed = routeLead(
      input({
        mode: "rules",
        fallbackMode: "least_loaded",
        operators: [person("maya", { openLeads: 4 }), person("jordan", { openLeads: 1 })],
        rules: [
          {
            id: "1",
            enabled: true,
            position: 1,
            source: "phone",
            service: null,
            scoreBand: null,
            location: null,
            language: null,
            targetMemberId: "maya",
            targetPool: null,
          },
        ],
      })
    );
    expect(missed.memberId).toBe("jordan");
  });

  it("does not route historic imports", () => {
    const decision = routeLead(input({ historic: true }));
    expect(decision.memberId).toBeNull();
    expect(decision.mode).toBe("historic");
  });

  it("keeps a stable key for a repeated arrival", () => {
    expect(arrivalIdempotencyKey("lead-1")).toBe(arrivalIdempotencyKey("lead-1"));
    expect(arrivalIdempotencyKey("lead-1")).not.toBe(arrivalIdempotencyKey("lead-2"));
  });

  it("shares a hundred leads without a catch-up flood after time away", () => {
    const steps = simulateFairness(
      input({
        mode: "weighted_round_robin",
        operators: [person("maya", { weight: 2 }), person("jordan"), person("sam"), person("ava")],
      }),
      100,
      [{ memberId: "jordan", from: 20, to: 50 }]
    );
    const counts = new Map<string, number>();
    for (const step of steps) {
      if (!step.memberId) continue;
      counts.set(step.memberId, (counts.get(step.memberId) ?? 0) + 1);
    }
    expect(steps.filter((step) => !step.memberId)).toHaveLength(0);
    const during = steps.slice(20, 50).filter((step) => step.memberId === "jordan");
    expect(during).toHaveLength(0);
    const after = steps.slice(50, 60).filter((step) => step.memberId === "jordan").length;
    expect(after).toBeLessThanOrEqual(4);
    expect(counts.get("maya") ?? 0).toBeGreaterThan(counts.get("ava") ?? 0);
  });

  it("rejoins at the current low end", () => {
    const jordan = person("jordan", { received: 1 });
    expect(receivedAfterReturn(jordan, [person("maya", { received: 12 }), person("sam", { received: 11 })])).toBe(11);
  });
});
