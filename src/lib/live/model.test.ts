import { describe, expect, it } from "vitest";

import { compassStarters } from "@/lib/live/compass-starters";
import {
  collapseBurst,
  derivePresence,
  deriveAllPresence,
  groupFeed,
  mapRun,
  mapWaiting,
  runOneLine,
  type LiveEvent,
  type LiveRun,
} from "@/lib/live/model";

const NOW = Date.parse("2026-10-08T15:00:00Z");

function run(partial: Partial<LiveRun>): LiveRun {
  return {
    id: partial.id ?? "r1",
    orgId: "o1",
    agentId: partial.agentId ?? "scribe",
    leadId: null,
    actorMemberId: null,
    subjectLabel: "the call from 2:14 PM",
    subjectHref: null,
    status: partial.status ?? "working",
    currentStepLabel: partial.currentStepLabel ?? null,
    plan: [],
    reasonSummary: partial.reasonSummary ?? null,
    plainError: partial.plainError ?? null,
    needsPerson: null,
    sources: [],
    configVersion: null,
    batchId: null,
    simulated: false,
    createdAt: partial.createdAt ?? new Date(NOW - 60_000).toISOString(),
    startedAt: null,
    finishedAt: partial.finishedAt ?? null,
    lastProgressAt: partial.lastProgressAt ?? new Date(NOW - 30_000).toISOString(),
  };
}

function event(id: string, runId: string, kind: LiveEvent["kind"], minutesAgo: number): LiveEvent {
  return { id, runId, agentId: "scribe", leadId: null, kind, label: id, occurredAt: new Date(NOW - minutesAgo * 60_000).toISOString() };
}

describe("presence", () => {
  const base = { control: null, waiting: [], workspace: "active" as const, now: NOW };

  it("is idle with nothing to do", () => {
    const presence = derivePresence({ ...base, agentId: "scribe", runs: [] });
    expect(presence.state).toBe("idle");
    expect(presence.stateLabel).toBe("Idle");
  });

  it("says what a working agent is doing in plain words", () => {
    const presence = derivePresence({ ...base, agentId: "scribe", runs: [run({ currentStepLabel: "Reading the call from 2:14 PM" })] });
    expect(presence.state).toBe("working");
    expect(presence.liveLabel).toBe("Scribe is reading the call from 2:14 PM");
  });

  it("puts a person's pause ahead of running work", () => {
    const presence = derivePresence({
      ...base,
      agentId: "scribe",
      runs: [run({})],
      control: { agentId: "scribe", paused: true, changedAt: new Date(NOW).toISOString(), changedByName: "Dana", reason: null },
    });
    expect(presence.state).toBe("paused");
    expect(presence.runSummary).toBe("Paused by Dana.");
  });

  it("shows every agent paused when the workspace is paused", () => {
    const all = deriveAllPresence({ runs: [run({})], controls: [], waiting: [], workspace: "paused", now: NOW });
    expect(all.map((item) => item.state)).toEqual(["paused", "paused", "paused", "paused"]);
    expect(all.map((item) => item.agentId)).toEqual(["scribe", "sentry", "relay", "compass"]);
  });

  it("counts requests waiting on a person", () => {
    const waiting = [mapWaiting({ id: "a1", agent_id: "relay", run_id: "r9", action_type: "quiet_lead_follow_up", title: "Draft", status: "pending", created_at: new Date(NOW).toISOString() })];
    const presence = derivePresence({ ...base, agentId: "relay", runs: [], waiting });
    expect(presence.state).toBe("waiting");
    expect(presence.waitingCount).toBe(1);
  });

  it("flags a recent failure as stopped with the plain message", () => {
    const presence = derivePresence({
      ...base,
      agentId: "scribe",
      runs: [run({ status: "failed", plainError: "The recording was empty.", finishedAt: new Date(NOW - 60_000).toISOString() })],
    });
    expect(presence.state).toBe("stopped");
    expect(presence.runSummary).toBe("The recording was empty.");
  });

  it("forgets a failure after a day", () => {
    const old = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const presence = derivePresence({ ...base, agentId: "scribe", runs: [run({ status: "failed", finishedAt: old, createdAt: old })] });
    expect(presence.state).toBe("idle");
  });
});

describe("feed", () => {
  it("groups by now, earlier today, yesterday, and earlier", () => {
    const now = new Date(2026, 9, 8, 15, 0, 0);
    const at = (date: Date) => date.toISOString();
    const events: LiveEvent[] = [
      { ...event("a", "r", "run_started", 0), occurredAt: at(new Date(2026, 9, 8, 14, 55)) },
      { ...event("b", "r", "run_started", 0), occurredAt: at(new Date(2026, 9, 8, 9, 0)) },
      { ...event("c", "r", "run_started", 0), occurredAt: at(new Date(2026, 9, 7, 9, 0)) },
      { ...event("d", "r", "run_started", 0), occurredAt: at(new Date(2026, 9, 1, 9, 0)) },
    ];
    expect(groupFeed(events, now).map((group) => [group.label, group.events.map((e) => e.id)])).toEqual([
      ["Now", ["a"]],
      ["Earlier today", ["b"]],
      ["Yesterday", ["c"]],
      ["Earlier", ["d"]],
    ]);
  });

  it("collapses a burst of step lines per run but keeps milestones", () => {
    const events = [
      event("s1", "r1", "step_started", 5),
      event("s2", "r1", "step_finished", 4),
      event("s3", "r1", "step_started", 3),
      event("err", "r1", "error", 2),
      event("t1", "r2", "step_started", 1),
    ];
    expect(collapseBurst(events).map((e) => e.id)).toEqual(["t1", "err", "s3"]);
  });

  it("caps the feed", () => {
    const many = Array.from({ length: 500 }, (_, index) => event(`e${index}`, `r${index}`, "run_started", index));
    expect(collapseBurst(many, 60)).toHaveLength(60);
  });
});

describe("mapping", () => {
  it("drops rows for unknown agents", () => {
    expect(mapRun({ id: "x", agent_id: "someone-else" })).toBeNull();
  });

  it("writes one line per status without technical words", () => {
    expect(runOneLine(run({ status: "waiting_provider" }))).toBe("Scribe is waiting on an outside service for the call from 2:14 PM.");
    expect(runOneLine(run({ status: "stuck" }))).toBe("Scribe stopped making progress on the call from 2:14 PM.");
  });

  it("treats an agent question as a question", () => {
    expect(mapWaiting({ id: "q", action_type: "agent_question", status: "pending", created_at: "" }).kind).toBe("question");
  });
});

describe("compass starters", () => {
  it("uses the workspace's own offers, objections, and urgency signals", () => {
    const starters = compassStarters({
      "industry.offers": [{ name: "Botox" }],
      "industry.objections": [{ label: "Too expensive" }],
      "industry.urgency_signals": ["wedding next week"],
    });
    expect(starters.map((s) => s.prompt)).toEqual([
      "Which recent leads are most likely to book Botox, and why?",
      'How are we handling "Too expensive" on calls, and what works best?',
      'Which leads showed "wedding next week" this week and still need a reply?',
    ]);
  });

  it("falls back to a general question when setup is thin", () => {
    expect(compassStarters({})).toEqual([{ prompt: "Which leads went quiet after a good first call?", label: "Leads that went quiet" }]);
  });
});
