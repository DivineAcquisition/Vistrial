import type { Board, SelfNote, TaskCard } from "@/components/tasks/task-board";
import type { Id } from "../../../../convex/_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 12, 15);

let count = 0;
/** One card, with the defaults of a task an agent proposed for the organization itself. */
function card(input: Partial<TaskCard> & Pick<TaskCard, "title" | "column">): TaskCard {
  count += 1;
  return {
    id: `t${count}` as Id<"agentTasks">,
    note: null,
    why: "",
    client: null,
    clientId: null,
    by: "agent",
    agentSlug: "growth-architect",
    type: "work",
    ask: null,
    skill: null,
    skillSlug: null,
    workTab: null,
    checkInDays: null,
    expectedReturn: { text: "Not enough data", basis: "Not enough data", known: false },
    creditCost: 0,
    evidence: [],
    approvalId: null,
    link: null,
    checkInAt: null,
    model: null,
    decisionId: null,
    result: null,
    skippedReason: null,
    createdAt: NOW - count * 3600_000,
    ...input,
  };
}

const range = (low: number, high: number, metric: string, basis: "Inference" | "Your data") => ({ text: `${low} to ${high} more ${metric} a month`, basis, known: true });
const approval = (n: number) => `ap${n}` as Id<"approvals">;

/** Northlight Growth's board in an ordinary week: an agency with coaching and consulting clients. */
export function storyBoard(state: string): Board {
  count = 0;
  const viewer = state === "viewer";
  const member = state === "member";
  const proposed: TaskCard[] = [
    card({
      column: "proposed",
      model: { family: "claude", name: "Claude Opus 5.5" },
      title: "Test a two-call close for Aster's leadership program",
      why: "Aster's booked calls rose in October but fewer became clients. Three competing programs now split the sale into a fit call and a decision call.",
      client: "Aster Coaching",
      type: "change",
      checkInDays: 30,
      expectedReturn: range(2, 5, "new clients", "Your data"),
      evidence: [
        { kind: "figure", label: "31 booked calls, 4 new clients in October (Aster results file)", href: null, external: false },
        { kind: "asset", label: "Offer analysis: Aster leadership program", href: "/app/assets/a2", external: false },
        { kind: "sourceRef", label: "Reboot.io: how the fit call works", href: "https://example.com/fit-call", external: true },
      ],
      approvalId: approval(1),
    }),
    card({
      column: "proposed",
      model: { family: "gemini", name: "Gemini 4 Carbon" },
      title: "Research what fractional CFO firms charge agencies",
      why: "Ledgerline is repricing in January and the last market report is five months old.",
      client: "Ledgerline CFO",
      skill: "Strategist · Research",
      skillSlug: "market-intelligence",
      ask: "What do fractional CFO firms charge marketing agencies, and what is included at each price?",
      expectedReturn: range(1, 3, "new clients", "Inference"),
      creditCost: 900,
      evidence: [{ kind: "asset", label: "Market report: fractional CFO services (June)", href: "/app/assets/a5", external: false }],
      approvalId: approval(2),
    }),
    card({
      column: "proposed",
      title: "Find why Northlight's own enquiries slowed",
      why: "Enquiries through the site fell for the third week. No results file covers the site yet, so the size of the effect cannot be estimated.",
      skill: "Strategist · Growth diagnosis",
      skillSlug: "growth-diagnostics",
      ask: "Find where Northlight Growth's own enquiries stall between the site and a booked call.",
      creditCost: 300,
      evidence: [{ kind: "figure", label: "9, 7, then 4 enquiries in the last three weeks (calendar bookings)", href: null, external: false }],
      approvalId: approval(3),
      by: member ? "person" : "agent",
    }),
  ];
  if (state === "inference") {
    // What the proposer adds where a client has no results of its own: a range from the report's cited sources.
    proposed.splice(
      1,
      0,
      card({
        column: "proposed",
        title: "Offer Ledgerline's audit as a fixed-fee first engagement",
        why: "Two of the firms the market report read lead with a fixed-fee audit before any retainer. Ledgerline has no results connected, so this rests on what was observed elsewhere.",
        client: "Ledgerline CFO",
        type: "change",
        checkInDays: 30,
        expectedReturn: range(1, 3, "new clients", "Inference"),
        evidence: [
          { kind: "asset", label: "Market report: fractional CFO services (June)", href: "/app/assets/a5", external: false },
          { kind: "sourceRef", label: "Fixed-fee finance audits for agencies (Brightwater Advisory, published 2026-05-28)", href: "https://example.com/brightwater-audit", external: true },
          { kind: "sourceRef", label: "Our first 30 days: the audit (Calder & Voss, read 2026-06-02)", href: "https://example.com/calder-voss", external: true },
        ],
        approvalId: approval(9),
      }),
    );
  }
  const approved: TaskCard[] = [
    card({
      column: "approved",
      title: "Lead Dana's page with the outcome, not the method",
      why: "The page teardown found the headline describes the coaching method; four comparable pages lead with the result.",
      client: "Dana Reyes",
      type: "change",
      note: "Being tried. Check-in on Dec 4.",
      checkInAt: NOW + 22 * DAY,
      expectedReturn: range(3, 8, "booked calls", "Inference"),
      evidence: [{ kind: "asset", label: "Page teardown: danareyes.example", href: "/app/assets/a7", external: false }],
      link: { href: "/app/assets/a7", label: "Open the report it came from" },
    }),
  ];
  const running: TaskCard[] = [
    card({
      column: "running",
      title: "Research dental membership plans near Harbor's three locations",
      why: "Harbor asked whether a membership plan would bring uninsured patients back.",
      client: "Harbor Dental Group",
      skill: "Strategist · Research",
      skillSlug: "market-intelligence",
      expectedReturn: range(10, 25, "new patients", "Inference"),
      creditCost: 900,
      evidence: [{ kind: "figure", label: "38% of Harbor's lapsed patients had no insurance on file (results file)", href: null, external: false }],
      link: { href: "/app/runs/r3", label: "Open the run" },
    }),
  ];
  const needsYou: TaskCard[] = [
    card({
      column: "needsYou",
      title: "Offer analysis for Northlight's retainer",
      why: "Two prospects this month asked for a shorter commitment.",
      skill: "Strategist · Offer analysis",
      skillSlug: "offer-intelligence",
      note: "A draft is ready to review.",
      expectedReturn: range(1, 2, "new retainers", "Your data"),
      creditCost: 450,
      evidence: [
        { kind: "figure", label: "2 of 6 lost proposals named the three-month minimum (call transcripts)", href: null, external: false },
        { kind: "asset", label: "Market report: paid ads retainers", href: "/app/assets/a1", external: false },
      ],
      link: { href: "/app/assets/a9", label: "Review the draft" },
    }),
    card({
      column: "needsYou",
      title: "Send a pre-call video before Aster's sales calls",
      why: "Tried since October 12. Thirty days are up.",
      client: "Aster Coaching",
      type: "change",
      note: "The check-in is due: say what happened.",
      checkInAt: NOW - DAY,
      decisionId: viewer ? null : ("d4" as Id<"decisions">),
      expectedReturn: range(2, 4, "new clients", "Your data"),
      evidence: [{ kind: "decision", label: "Earlier result: reminder texts cut no-shows", href: "/app/assets/a2", external: false }],
    }),
  ];
  const done: TaskCard[] = [
    card({
      column: "done",
      title: "Market report: executive coaching programs",
      why: "Approved on November 6.",
      client: "Aster Coaching",
      skill: "Strategist · Research",
      skillSlug: "market-intelligence",
      expectedReturn: { text: "Not enough data", basis: "Not enough data", known: false },
      creditCost: 900,
      evidence: [{ kind: "sourceRef", label: "14 competitor pricing pages", href: "https://example.com/pricing", external: true }],
      link: { href: "/app/assets/a3", label: "Open the result" },
    }),
  ];
  const result: TaskCard[] = [
    card({
      column: "result",
      title: "Add reminder texts before Aster's sales calls",
      why: "Approved September 28, checked October 28.",
      client: "Aster Coaching",
      type: "change",
      expectedReturn: range(3, 6, "booked calls", "Your data"),
      result: {
        result: "better",
        note: "No-shows dropped in the first week and stayed down.",
        recordedAt: NOW - 15 * DAY,
        changes: [
          { source: "upload", label: "Aster bookings", metric: "conversions", before: 24, after: 31, percent: 29.2 },
          { source: "upload", label: "Aster bookings", metric: "spend", before: 2400, after: 2350, percent: -2.1 },
        ],
      },
    }),
    card({
      column: "result",
      title: "Raise Ledgerline's entry price to $2,500",
      why: "Approved August 30, checked October 30.",
      client: "Ledgerline CFO",
      type: "change",
      expectedReturn: range(1, 2, "new clients", "Inference"),
      result: { result: "same", note: "Same number of new clients; nobody mentioned the price.", recordedAt: NOW - 13 * DAY, changes: [{ source: "upload", label: "Ledgerline pipeline", metric: "conversions", before: 5, after: 5, percent: 0 }] },
    }),
  ];
  const empty = state === "empty";
  const columns = empty ? [[], [], [], [], [], []] : [proposed, approved, running, needsYou, done, result];
  const names = ["proposed", "approved", "running", "needsYou", "done", "result"] as const;
  return {
    columns: names.map((column, index) => ({ column, cards: columns[index] })),
    skipped: empty ? [] : [card({ column: null, title: "Start a podcast for Northlight", skippedReason: "Not this quarter." })],
    spendLimit: empty ? null : 500,
    canApprove: !viewer && !member,
    canWork: !viewer,
    skills: [
      { slug: "market-intelligence", name: "Research", does: "researches your market and competitors, with every source" },
      { slug: "offer-intelligence", name: "Offer analysis", does: "sets your offer beside competitors' and suggests changes to test" },
      { slug: "growth-diagnostics", name: "Growth diagnosis", does: "finds where growth stalls in your own data and writes a 90-day roadmap" },
    ],
    approvalWords: "A task an agent wants to run",
  };
}

export function storyNotes(state: string): SelfNote[] {
  if (state === "empty") return [];
  return [
    { id: "n1" as Id<"personalNotes">, body: "Ask Dana for October's enrolment numbers before Thursday", done: false, client: "Dana Reyes", createdAt: NOW - DAY },
    { id: "n2" as Id<"personalNotes">, body: "Renew the Ledgerline contract: draft the new scope", done: false, client: null, createdAt: NOW - 2 * DAY },
    { id: "n3" as Id<"personalNotes">, body: "Send Harbor the September report", done: true, client: "Harbor Dental Group", createdAt: NOW - 6 * DAY },
  ];
}
