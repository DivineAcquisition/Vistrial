import { describe, expect, it } from "vitest";

import { aggregateBriefing, briefingNumbers, type BriefingRecords } from "@/lib/workspace/briefing";
import { outcomeCatalog, outcomeValue } from "@/lib/workspace/outcomes";
import { attentionFor, detectWorkspaceState, type StateInput } from "@/lib/workspace/state";
import * as voice from "@/lib/workspace/voice";
import { holdOrder, orderDueNow, orderWorkNext, sortTasks, type DueRow, type WorkRow } from "@/lib/workspace/work";
import type { Summary, WorkspaceFacts } from "@/lib/metrics/load";

const NOW = Date.parse("2026-10-20T16:00:00Z");
const TZ = "America/New_York";
const MIN = 60_000;
const DAY = 86_400_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Copy rules (Part 12)
// ---------------------------------------------------------------------------

const BANNED = [/\u2014/, /\u2013/, /!/, /\brun\b/i, /\bsteps?\b/i, /\btoken/i, /\bmodel\b/i, /confidence score/i, /\bqueue\b/i, /\bjob\b/i, /\bpipeline\b/i, /error code/i, /will close/i, /guarantee/i];

function everyLine(): string[] {
  const crewFacts: voice.CrewFacts = {
    sentry: { mode: "live", watching: 14, nextDeadlineAt: iso(NOW + 12 * MIN) },
    scribe: { lastFinishedAt: iso(NOW - 40 * MIN) },
    relay: { waiting: 3, readyToSend: 1 },
    assay: { scoredToday: 6, hotToday: 2, hotNow: 38, paused: false },
  };
  const states: voice.CrewPresence["state"][] = ["idle", "working", "waiting", "attention", "paused", "stopped", "getting_ready"];
  const lines: string[] = [];
  for (const agent of ["sentry", "scribe", "relay", "compass", "assay"] as const) {
    for (const state of states) {
      lines.push(voice.crewLine(agent, { state, stepLabel: "Reading the call from 2:14 PM", subject: "Jordan Reyes", pausedBy: "Dana", pausedAt: iso(NOW - DAY), plainError: null }, crewFacts, NOW, TZ));
      lines.push(voice.crewStateWord(state));
    }
  }
  lines.push(voice.crewLine("sentry", { state: "idle", stepLabel: null, subject: null, pausedBy: null, pausedAt: null, plainError: null }, { ...crewFacts, sentry: { mode: "practice", watching: 3, nextDeadlineAt: null } }, NOW, TZ));
  lines.push(voice.operatorAgentLine(0), voice.operatorAgentLine(2));
  lines.push(voice.trustLine([]), voice.trustLine(["quiet lead follow-up", "no-show rebook"]));
  for (const row of voice.autonomyRows({ sentryMode: "live", agentTasks: "suggested" })) lines.push(...row.automatic, ...row.suggests, ...row.never);
  for (const kind of ["opted_out", "do_not_contact", "email_suppressed", "missing_disclosure", "config_incomplete", "sender_not_ready"] as const) {
    lines.push(voice.checksLine({ kind: "blocked", reason: kind }));
  }
  lines.push(voice.checksLine({ kind: "quiet", resumeAt: iso(NOW + 3 * 3_600_000), leadName: "Jordan", timeZone: TZ }));
  lines.push(voice.checksLine({ kind: "limit", resumeAt: iso(NOW + DAY), timeZone: TZ }));
  lines.push(voice.checksLine({ kind: "clear" }), voice.checksLine({ kind: "unknown" }));
  lines.push(voice.decisionUrgency({ windowEndsAt: iso(NOW + 12 * MIN), createdAt: iso(NOW), now: NOW }));
  lines.push(voice.dueLabel({ kind: "first_touch", state: "missed", deadlineAt: iso(NOW - 8 * MIN), now: NOW }));
  lines.push(voice.subtitle({ firstName: "Jordan", hour: 9, decisions: 3, dueNow: 2 }));
  const briefing = voice.briefingFrom(
    {
      sinceAt: iso(NOW - DAY),
      capped: false,
      newLeads: 9,
      caseFiles: 6,
      caseFilesForReview: 2,
      sentryCaught: 2,
      sentryReached: 2,
      sentrySlowestMinutes: 20,
      relayDrafted: 5,
      relayWaiting: 3,
      relayApproved: 2,
      relaySent: 2,
      assayMovedUp: 4,
      assayNewlyHot: ["Jordan Reyes"],
      needYouToday: 2,
    },
    NOW,
    TZ
  );
  lines.push(briefing.headline, ...briefing.lines.map((line) => line.text));
  lines.push(voice.contributionLine({ caseFiles: 38, clocks: 212, drafts: 29 }) ?? "");
  lines.push(voice.streamLine({ agentId: "relay", status: "waiting_person", subject: "Alex Kim", reason: null, plainError: null }));
  lines.push(voice.tierMoveLine({ name: "Dana Brooks", tier: "warm" }), voice.burstLine("scribe", 6));
  lines.push(...voice.commandSuggestions({ hotUncontacted: 1, callsYesterday: 1, waitingOver30: 1, caseFilesThisMonth: 20, decisions: 1, operator: false }));
  const welcome = voice.welcomeLines(
    { businessName: "North", callsRead: 212, caseFiles: 148, scored: 1240, hotNow: 38, sentryMode: "live", watchFrom: iso(NOW - DAY), draftsWaiting: 0, callSourceConnected: true },
    NOW,
    TZ
  );
  lines.push(...welcome.map((line) => line.text));
  for (const group of [voice.STATE_COPY, voice.WORK_COPY, voice.STREAM_COPY, voice.COMMAND_COPY, voice.WELCOME_COPY, voice.OUTCOME_COPY, voice.BRIEFING_COPY, voice.DECISION_COPY]) {
    for (const value of Object.values(group)) {
      if (typeof value === "string") lines.push(value);
      else if (typeof value === "function") {
        const call = value as (...args: unknown[]) => unknown;
        let text: unknown;
        try {
          text = call(3, 5, TZ);
        } catch {
          text = call("Five no-shows to rebook", 5);
        }
        lines.push(String(text));
      }
    }
  }
  return lines;
}

describe("agent voice", () => {
  it("never uses em-dashes, exclamation marks, or technical words", () => {
    for (const line of everyLine()) {
      for (const pattern of BANNED) expect(line, `${pattern} in "${line}"`).not.toMatch(pattern);
    }
  });

  it("speaks in first person with the real numbers", () => {
    const facts: voice.CrewFacts = {
      sentry: { mode: "live", watching: 14, nextDeadlineAt: iso(NOW + 12 * MIN) },
      scribe: { lastFinishedAt: iso(NOW - 40 * MIN) },
      relay: { waiting: 3, readyToSend: 0 },
      assay: { scoredToday: 6, hotToday: 2, hotNow: 38, paused: false },
    };
    const idle = { state: "idle" as const, stepLabel: null, subject: null, pausedBy: null, pausedAt: null, plainError: null };
    expect(voice.crewLine("sentry", idle, facts, NOW, TZ)).toBe("Watching 14 leads. Next reply window ends in 12 minutes.");
    expect(voice.crewLine("scribe", idle, facts, NOW, TZ)).toBe("Last call processed 40 minutes ago.");
    expect(voice.crewLine("relay", idle, facts, NOW, TZ)).toBe("3 drafts ready for you.");
    expect(voice.crewLine("assay", idle, facts, NOW, TZ)).toBe("Scored 6 leads today. 2 are Hot.");
    expect(voice.crewLine("compass", idle, facts, NOW, TZ)).toBe("Ready. Ask me anything about your leads.");
    expect(voice.crewLine("scribe", { ...idle, state: "working", stepLabel: "Reading the call from 2:14 PM" }, facts, NOW, TZ)).toBe("Reading the call from 2:14 PM.");
  });

  it("only reassures with the workspace's real settings", () => {
    expect(voice.trustLine([])).toBe("Nothing is sent to a lead without your approval.");
    expect(voice.trustLine(["no-show rebook"])).toBe("No-show rebook can go out without approval. Everything else waits for you.");
  });

  it("caps counts", () => {
    expect(voice.capCount(140)).toBe("99+");
    expect(voice.capCount(7)).toBe("7");
  });

  it("never suggests a question that would return nothing", () => {
    expect(voice.commandSuggestions({ hotUncontacted: 0, callsYesterday: 0, waitingOver30: 0, caseFilesThisMonth: 0, decisions: 0, operator: false })).toEqual([]);
    expect(voice.commandSuggestions({ hotUncontacted: 2, callsYesterday: 0, waitingOver30: 0, caseFilesThisMonth: 50, decisions: 0, operator: true })).toEqual([
      "Which of my Hot leads have not been contacted?",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Briefing truth (Part 7 and Part 16)
// ---------------------------------------------------------------------------

function seededRecords(): BriefingRecords {
  const since = NOW - DAY;
  return {
    leads: [
      ...Array.from({ length: 9 }, (_, index) => ({ id: `new-${index}`, created_at: iso(since + (index + 1) * MIN), historic: false })),
      ...Array.from({ length: 212 }, (_, index) => ({ id: `old-${index}`, created_at: iso(since + 10 * MIN), historic: true })),
      { id: "before", created_at: iso(since - MIN), historic: false },
    ],
    scribeRuns: [
      ...Array.from({ length: 6 }, () => ({ status: "completed", finished_at: iso(since + 30 * MIN) })),
      { status: "failed", finished_at: iso(since + 30 * MIN) },
      { status: "completed", finished_at: iso(since - 5 * MIN) },
    ],
    caseFilesForReview: 2,
    alerts: [
      { created_at: iso(since + 60 * MIN), resolved_at: iso(since + 72 * MIN) },
      { created_at: iso(since + 90 * MIN), resolved_at: iso(since + 110 * MIN) },
      { created_at: iso(since - 10 * MIN), resolved_at: null },
    ],
    relayItems: [
      ...Array.from({ length: 3 }, () => ({ created_at: iso(since + MIN), status: "pending" })),
      ...Array.from({ length: 2 }, () => ({ created_at: iso(since + MIN), status: "succeeded" })),
      { created_at: iso(since - MIN), status: "pending" },
    ],
    scoreMoves: [
      { lead_id: "a", score: 80, previous_score: 60, tier: "hot", previous_tier: "warm", historic: false, created_at: iso(since + MIN) },
      { lead_id: "a", score: 82, previous_score: 80, tier: "hot", previous_tier: "hot", historic: false, created_at: iso(since + 2 * MIN) },
      { lead_id: "b", score: 55, previous_score: 40, tier: "warm", previous_tier: "cool", historic: false, created_at: iso(since + MIN) },
      { lead_id: "c", score: 30, previous_score: 20, tier: "cool", previous_tier: "cold", historic: false, created_at: iso(since + MIN) },
      { lead_id: "d", score: 52, previous_score: 49, tier: "warm", previous_tier: "warm", historic: false, created_at: iso(since + MIN) },
      { lead_id: "e", score: 90, previous_score: null, tier: "hot", previous_tier: null, historic: true, created_at: iso(since + MIN) },
      { lead_id: "f", score: 10, previous_score: 30, tier: "cold", previous_tier: "cool", historic: false, created_at: iso(since + MIN) },
    ],
    dueNow: 2,
  };
}

describe("briefing truth", () => {
  it("counts exactly what the seeded records hold, and ignores history imports", () => {
    const facts = aggregateBriefing(seededRecords(), iso(NOW - DAY), false);
    expect(facts.newLeads).toBe(9);
    expect(facts.caseFiles).toBe(6);
    expect(facts.caseFilesForReview).toBe(2);
    expect(facts.sentryCaught).toBe(2);
    expect(facts.sentryReached).toBe(2);
    expect(facts.sentrySlowestMinutes).toBe(20);
    expect(facts.relayDrafted).toBe(5);
    expect(facts.relayWaiting).toBe(3);
    expect(facts.relayApproved).toBe(2);
    expect(facts.relaySent).toBe(2);
    expect(facts.assayMovedUp).toBe(4);
    expect(facts.assayNewlyHotIds).toEqual(["a"]);
  });

  it("prints only numbers that come from the facts", () => {
    const facts = { ...aggregateBriefing(seededRecords(), iso(NOW - DAY), false), assayNewlyHot: ["Jordan Reyes"] };
    const briefing = voice.briefingFrom(facts, NOW, TZ);
    const allowed = briefingNumbers(facts);
    const text = [briefing.headline, ...briefing.lines.map((line) => line.text)].join(" ").replace(/\d{1,2}:\d{2} [AP]M/g, "");
    for (const match of text.match(/\d[\d,]*/g) ?? []) {
      expect(allowed.has(Number(match.replace(/,/g, ""))), `${match} has no source`).toBe(true);
    }
    expect(briefing.headline).toBe("Since yesterday at 12:00 PM: 9 new leads came in, 6 calls were processed, and 2 leads need you today.");
    expect(briefing.lines.map((line) => line.agentId)).toEqual(["scribe", "sentry", "relay", "assay"]);
    expect(briefing.lines[2].text).toBe("I drafted 5 follow-ups. 3 are waiting for you, 2 were approved, and 2 were marked sent.");
  });

  it("says so plainly when nothing happened", () => {
    const empty: BriefingRecords = { leads: [], scribeRuns: [], caseFilesForReview: 0, alerts: [], relayItems: [], scoreMoves: [], dueNow: 0 };
    const briefing = voice.briefingFrom(aggregateBriefing(empty, iso(NOW - DAY), false), NOW, TZ);
    expect(briefing).toEqual({ headline: "No new activity since you were last here.", lines: [], quiet: true });
  });

  it("only history imported: summaries stay silent", () => {
    const records: BriefingRecords = {
      leads: Array.from({ length: 50 }, (_, index) => ({ id: `h${index}`, created_at: iso(NOW - MIN), historic: true })),
      scribeRuns: [],
      caseFilesForReview: 0,
      alerts: [],
      relayItems: [],
      scoreMoves: [{ lead_id: "h1", score: 90, previous_score: 10, tier: "hot", previous_tier: "cold", historic: true, created_at: iso(NOW - MIN) }],
      dueNow: 0,
    };
    expect(voice.briefingFrom(aggregateBriefing(records, iso(NOW - DAY), false), NOW, TZ).quiet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle states (Part 10)
// ---------------------------------------------------------------------------

function stateInput(overrides: Partial<StateInput> = {}): StateInput {
  return {
    role: "owner",
    workspaceStatus: "active",
    wentLiveAt: iso(NOW - 30 * DAY),
    importRunning: false,
    imported: 0,
    runsSinceLive: 400,
    learning: false,
    problems: [],
    welcome: { firstSeenAt: NOW - 30 * DAY, dismissedAt: NOW - 29 * DAY },
    now: NOW,
    ...overrides,
  };
}

describe("workspace state detection", () => {
  it("first sign-in shows the welcome to Owners only, for two weeks or until dismissed", () => {
    const fresh = { welcome: { firstSeenAt: null, dismissedAt: null } };
    expect(detectWorkspaceState(stateInput(fresh)).showWelcome).toBe(true);
    expect(detectWorkspaceState(stateInput({ ...fresh, role: "member" })).showWelcome).toBe(false);
    expect(detectWorkspaceState(stateInput({ ...fresh, role: "operator" })).showWelcome).toBe(false);
    expect(detectWorkspaceState(stateInput({ welcome: { firstSeenAt: NOW - 15 * DAY, dismissedAt: null } })).showWelcome).toBe(false);
    expect(detectWorkspaceState(stateInput({ welcome: { firstSeenAt: NOW - DAY, dismissedAt: NOW } })).showWelcome).toBe(false);
  });

  it("importing hides decisions and work", () => {
    const state = detectWorkspaceState(stateInput({ importRunning: true, imported: 1240 }));
    expect(state.lifecycle).toBe("importing");
    expect(state.showWork).toBe(false);
  });

  it("live but quiet, steady, and setup come from go-live and real activity", () => {
    expect(detectWorkspaceState(stateInput({ wentLiveAt: iso(NOW - 2 * DAY), runsSinceLive: 3 })).lifecycle).toBe("quiet");
    expect(detectWorkspaceState(stateInput()).lifecycle).toBe("steady");
    expect(detectWorkspaceState(stateInput({ wentLiveAt: null })).lifecycle).toBe("setup");
    expect(detectWorkspaceState(stateInput({ wentLiveAt: iso(NOW - 2 * DAY), runsSinceLive: 3 })).liveDays).toBe(2);
  });

  it("learning shows only to people who manage the workspace", () => {
    expect(detectWorkspaceState(stateInput({ learning: true })).learning).toBe(true);
    expect(detectWorkspaceState(stateInput({ learning: true, role: "operator" })).learning).toBe(false);
  });

  it("attention shows the most important problem with a count of the rest", () => {
    const attention = attentionFor([
      { kind: "delayed", connector: "Calendly", href: "/x" },
      { kind: "agent_stopped", agentId: "scribe", href: "/y" },
      { kind: "reconnect", connector: "HighLevel", href: "/z" },
    ]);
    expect(attention?.text).toBe("HighLevel lost access. Reconnect to keep your data current.");
    expect(attention?.others).toBe(2);
    expect(attentionFor([])).toBeNull();
  });

  it("paused and closed workspaces say so", () => {
    expect(detectWorkspaceState(stateInput({ workspaceStatus: "paused" })).workspacePaused).toBe(true);
    expect(detectWorkspaceState(stateInput({ workspaceStatus: "closed" })).workspacePaused).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ordering (Part 6 and Part 16)
// ---------------------------------------------------------------------------

describe("due now and work next ordering", () => {
  const due = (id: string, state: "missed" | "at_risk", minutes: number): DueRow => ({
    leadId: id,
    name: id,
    phone: null,
    kind: "first_touch",
    state,
    deadlineAt: iso(NOW + minutes * MIN),
    reason: null,
    tier: null,
  });

  it("puts late leads first, most late at the top, then windows closing soonest", () => {
    const ordered = orderDueNow([due("soon", "at_risk", 5), due("late", "missed", -8), due("later", "at_risk", 20), due("latest", "missed", -30)]);
    expect(ordered.map((row) => row.leadId)).toEqual(["latest", "late", "soon", "later"]);
  });

  it("orders work next by score or by age, as the person chose", () => {
    const work = (id: string, score: number, ageDays: number): WorkRow => ({ leadId: id, name: id, phone: null, tier: "warm", score, reason: null, createdAt: iso(NOW - ageDays * DAY) });
    const rows = [work("a", 60, 1), work("b", 90, 3), work("c", 75, 5)];
    expect(orderWorkNext(rows, "best").map((row) => row.leadId)).toEqual(["b", "c", "a"]);
    expect(orderWorkNext(rows, "oldest").map((row) => row.leadId)).toEqual(["c", "b", "a"]);
  });

  it("never moves rows under the cursor", () => {
    const incoming = [{ id: "new" }, { id: "b" }, { id: "a" }];
    expect(holdOrder(["a", "b", "gone"], incoming, (row) => row.id)).toEqual({ rows: [{ id: "a" }, { id: "b" }], waiting: 1 });
  });

  it("puts overdue tasks first", () => {
    const rows = sortTasks(
      [
        { id: "later", text: "", dueAt: iso(NOW + 60 * MIN), source: "person", leadId: null, leadName: null, snoozed: false },
        { id: "late", text: "", dueAt: iso(NOW - 60 * MIN), source: "sentry", leadId: null, leadName: null, snoozed: false },
      ],
      NOW
    );
    expect(rows.map((row) => row.id)).toEqual(["late", "later"]);
  });
});

// ---------------------------------------------------------------------------
// Outcome strip (Part 8)
// ---------------------------------------------------------------------------

function facts(overrides: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    earliest_lead_at: null,
    has_leads: true,
    has_response: true,
    has_case_files: true,
    has_bands: true,
    has_stage_changes: true,
    has_bookings: true,
    has_relay: true,
    has_alerts: true,
    has_objections: true,
    has_revenue: true,
    has_typed_revenue: false,
    can_see_money: true,
    can_see_people: true,
    can_export: true,
    can_approve: true,
    top_band: null,
    bands: [],
    first_touch_minutes: 15,
    sources: [],
    people: null,
    fields: [],
    ...overrides,
  };
}

const agg = (count: number, median: number | null = null, sum: number | null = null) => ({ count, leads: count, sum, avg: null, median });

describe("outcome strip", () => {
  it("leaves out what the workspace does not track, and money for people who may not see it", () => {
    expect(outcomeCatalog({ facts: facts({ has_bookings: false }), canSeeMoney: true, operator: false }).has("bookings")).toBe(false);
    expect(outcomeCatalog({ facts: facts(), canSeeMoney: false, operator: false }).has("revenue")).toBe(false);
    expect(outcomeCatalog({ facts: facts(), canSeeMoney: true, operator: true }).size).toBe(0);
  });

  it("adds approved-as-written and approved-after-edits, and only compares with enough data", () => {
    const catalog = outcomeCatalog({ facts: facts(), canSeeMoney: true, operator: false });
    const week: Summary = {
      relay_approved_unchanged: { current: agg(12), previous: agg(4) },
      relay_edited: { current: agg(3), previous: agg(1) },
    };
    const tile = outcomeValue(catalog.get("relay_approved")!, { week, live: {}, daily: [] });
    expect(tile?.value).toBe(15);
    expect(tile?.change).toBeNull();
    expect(tile?.compareNote).toBe("Not enough data to compare yet.");
    const big: Summary = {
      relay_approved_unchanged: { current: agg(30), previous: agg(20) },
      relay_edited: { current: agg(5), previous: agg(5) },
    };
    expect(outcomeValue(catalog.get("relay_approved")!, { week: big, live: {}, daily: [] })?.change).toEqual({ previous: 25, better: true });
  });

  it("hides a tile the database hid instead of showing zero", () => {
    const catalog = outcomeCatalog({ facts: facts(), canSeeMoney: true, operator: false });
    expect(outcomeValue(catalog.get("bookings")!, { week: { bookings: { hidden: true } }, live: {}, daily: [] })).toBeNull();
    expect(outcomeValue(catalog.get("leads_waiting")!, { week: {}, live: { missed_now: { current: agg(2), previous: null }, at_risk_now: { current: agg(3), previous: null } }, daily: [] })?.value).toBe(5);
  });
});
