/**
 * The app, drawn on the public page. Each visual is a simplified drawing of a real screen, built from
 * the page's own parts, so it fits its window at every width. It shows the same parts the screen shows
 * (expected return, credit cost, evidence, approve, the model that did the work) and nothing the app
 * does not have. All of it is sample data: an agency, Northlight Growth, and the coaches and
 * consultants it works for.
 */

export type Basis = "observed" | "inferred" | "hypothesis" | "firstParty" | "insufficient";
export type Model = { family: "claude"; name: string };

const OPUS: Model = { family: "claude", name: "Claude Opus 5.5" };
const SONNET: Model = { family: "claude", name: "Claude Sonnet 5.5" };

export const APP_VISUALS = {
  id: "app",
  eyebrow: "Inside Vistrial",
  headline: "Where the work shows up.",
  lead: "Agents propose the work. You see what each piece is expected to return, what it may cost in credits, and the evidence behind it, and you approve.",
  agent: "Strategist",
  app: "Vistrial",
  organization: "Northlight Growth",
  tourLabel: "Screens in the app",
  /** Under every window. These are drawings of the app, not pictures of it. */
  note: "A simplified view of the app, with sample data.",
  skillsTitle: "What the skills hand back",
  skillsLead: "Three finished pieces, as the app lays them out.",
  loopTitle: "The same loop, in the app",
} as const;

/* ---------------------------------------------------------------------------
 * The window: Tasks, Briefing, Home, Clients.
 * ------------------------------------------------------------------------- */

export const TOUR = [
  { id: "tasks", tab: "Tasks", title: "Tasks: proposed work, ranked", doing: "Proposes work and ranks it by expected return" },
  { id: "briefing", tab: "Briefing", title: "Briefing: approve where you read", doing: "Asks before it runs anything" },
  { id: "home", tab: "Home", title: "Home: what needs you", doing: "Lists what needs you, and what changed" },
  { id: "clients", tab: "Clients", title: "Clients, and who can see each one", doing: "Keeps each client's work with that client" },
] as const;

export type TaskCard = {
  id: string;
  kind: string;
  client: string;
  model?: Model;
  title: string;
  /** Left out when the app has no figure to give: the card then says "Not enough data" and nothing more. */
  expected?: string;
  basis: Basis;
  /** The app says this under an estimate that no source backs. */
  estimate?: string;
  cost: string;
  evidence: string;
  state: "proposed" | "approved" | "running";
  foot?: string;
};

export const TASKS = {
  expectedLabel: "Expected return",
  costLabel: "Credit cost",
  actions: { approve: "Approve", edit: "Edit", skip: "Skip" },
  columns: [
    { id: "proposed", name: "Proposed", note: "Waiting for an Owner or Admin" },
    { id: "approved", name: "Approved", note: "Agreed, or being tried" },
    { id: "running", name: "Running", note: "An agent is working" },
  ],
  cards: [
    {
      id: "two-call",
      kind: "A change you make",
      client: "Aster Coaching",
      model: OPUS,
      title: "Test a two-call close for Aster's leadership program",
      expected: "2 to 5 more new clients a month",
      basis: "firstParty",
      cost: "No credits",
      evidence: "Evidence: 3 items",
      state: "proposed",
    },
    {
      id: "own-enquiries",
      kind: "Agent work · Growth Diagnostics",
      client: "Northlight Growth",
      title: "Find why Northlight's own enquiries slowed",
      basis: "insufficient",
      estimate: "No results file covers the site yet, so the size of the effect cannot be estimated.",
      cost: "Up to 300 credits",
      evidence: "Evidence: 1 item",
      state: "proposed",
    },
    {
      id: "outcome-headline",
      kind: "A change you make",
      client: "Dana Reyes",
      title: "Lead Dana's page with the outcome, not the method",
      expected: "3 to 8 more booked calls a month",
      basis: "inferred",
      estimate: "An estimate, not a measurement.",
      cost: "No credits",
      evidence: "Evidence: 1 item",
      state: "approved",
      foot: "Being tried. Check-in on Dec 4.",
    },
    {
      id: "cfo-pricing",
      kind: "Agent work · Market Intelligence",
      client: "Ledgerline CFO",
      model: SONNET,
      title: "Research what fractional CFO firms charge agencies",
      expected: "1 to 3 more new clients a month",
      basis: "inferred",
      estimate: "An estimate, not a measurement.",
      cost: "Up to 900 credits",
      evidence: "Evidence: 1 item",
      state: "running",
      foot: "Strategist is working",
    },
  ] satisfies readonly TaskCard[],
} as const;

export const BRIEFING = {
  filters: [
    { name: "All", count: 12 },
    { name: "Approvals", count: 3, on: true },
    { name: "Drafts", count: 2 },
    { name: "Weekly report", count: 1 },
    { name: "Finished", count: 1 },
    { name: "Alerts", count: 3 },
  ],
  kind: "Approval",
  needs: "Needs your decision",
  fresh: "New",
  actions: { approve: "Approve", decline: "Decline" },
  posts: [
    {
      id: "two-call",
      client: "Aster Coaching",
      when: "40m ago",
      title: "Proposed: Test a two-call close for Aster's leadership program",
      body: "Aster's booked calls rose in October but fewer became clients. Three competing programs now split the sale into a fit call and a decision call.",
      reason: "Needs approval: a task an agent wants to run",
      cost: "No credits",
    },
    {
      id: "cfo-pricing",
      client: "Ledgerline CFO",
      when: "3h ago",
      title: "Research what fractional CFO firms charge agencies",
      body: "Ledgerline is repricing in January and the last market report is five months old.",
      reason: "Needs approval: a task an agent wants to run",
      cost: "Up to 900 credits",
    },
    {
      id: "going-public",
      client: "Northlight Growth",
      when: "Yesterday",
      title: "Offer analysis for Northlight's retainer",
      body: "The analysis is ready to share outside the workspace. It stays private until you say so.",
      reason: "Needs approval: going public",
      cost: null,
    },
  ],
} as const;

export const HOME = {
  ask: "What should Vistrial work on?",
  placeholder: "Ask in your own words: who are we losing to, which offer to lead with, why enquiries dropped.",
  needsTitle: "Needs you",
  actions: { approve: "Approve", decline: "Decline" },
  needs: [
    {
      id: "question",
      kind: "A question from an agent",
      client: "Ledgerline CFO",
      title: "Which of Ledgerline's three services should the research start with?",
      action: "Answer it",
    },
    {
      id: "approval",
      kind: "Approval",
      client: "Northlight Growth",
      title: "Offer analysis for Northlight's retainer",
      approval: "Needs approval: going public",
    },
    {
      id: "check-in",
      kind: "Check-in",
      client: "Aster Coaching",
      title: "Send a pre-call video before Aster's sales calls.",
      action: "Say what happened",
    },
  ],
  sinceTitle: "Since you were last here",
  since: [
    { label: "Booked calls", value: "22", was: "was 18", change: "+22.2%", good: true },
    { label: "Aster bookings: results", value: "31", was: "was 24", change: "+29.2%", good: true },
    { label: "Ledgerline pipeline: results", value: "5", was: "was 5", change: "0%", good: null },
  ],
} as const;

export const CLIENTS = {
  list: [
    { name: "Aster Coaching", line: "Executive coaching for new directors", on: true },
    { name: "Lumen Course Co", line: "Online courses for freelance designers" },
    { name: "Ledgerline CFO", line: "Fractional CFO for agencies" },
    { name: "Dana Reyes", line: "Leave her job and coach full time", person: true },
    { name: "Marcus Bell", line: "A paid newsletter for first-time founders", person: true },
  ],
  profile: {
    name: "Aster Coaching",
    kind: "Client · business",
    fields: [
      { label: "What they do", value: "Executive coaching for new directors" },
      { label: "What they sell", value: "A twelve week leadership program" },
      { label: "Who they sell to", value: "First-time directors at tech companies" },
    ],
    note: "Agents read this when they work for this client. Its brand kit, offers, calls and results files stay with it.",
  },
  accessTitle: "Who can see Aster Coaching",
  everyClient: "Sees every client",
  access: [
    { name: "Nora Sannie", role: "Owner", sees: "all" },
    { name: "Jordan Lee", role: "Member", sees: "on" },
    { name: "Priya Nair", role: "Member", sees: "off" },
    { name: "Sam Patel", role: "Viewer", sees: "off" },
  ],
  canSee: "Can see this client",
  cannotSee: "Cannot see this client",
} as const;

/* ---------------------------------------------------------------------------
 * What the skills hand back: an offer comparison, an ad set, a page teardown.
 * ------------------------------------------------------------------------- */

export const OFFER_COMPARE = {
  skill: "Offer Intelligence",
  title: "Your offer beside theirs",
  heading: "You vs competitors",
  status: "Draft",
  model: OPUS,
  answerLabel: "The answer",
  answer: "Your retainer is priced in line with the two agencies that state a price, but you are the only one with no stated guarantee.",
  you: "You",
  flag: "A competitor states this",
  notStated: "Not stated",
  columns: ["You", "LeadForge Media", "Summit Scale", "Coachline Studio"],
  rows: [
    { label: "Leads with", cells: ["Done-for-you lead generation retainer", "Free ad account audit, then a 90-day pilot", "Pay per booked appointment", "One agency per coaching niche"] },
    { label: "Price", cells: ["$2,500/mo", "$1,950/mo pilot", "From $85 a booked call", null] },
    { label: "Guarantee", cells: [null, "30 qualified leads in 30 days or the next month is free", null, "Cancel any time in the first 60 days"], flagged: true },
  ],
  sources: "Each competitor's column links to the page it was read from.",
} as const;

export const AD_SET = {
  skill: "Creative Production",
  title: "Four variations for a client brand",
  brand: "Aster Coaching",
  brandNote: "Client, kit version 2",
  model: SONNET,
  checks: "Passed all 7 checks: new wording, on brand, claims backed.",
  heading: "Four variations to test",
  headlineLabel: "Headline:",
  buttonLabel: "Button:",
  hypothesisLabel: "Untested hypothesis:",
  headline: "Lead your first team well",
  button: "Book a fit call",
  variations: [
    { letter: "A", angle: "Worry question", hook: "Just promoted, and working it out as you go?", hypothesis: "A question about a worry earns more clicks than a statement." },
    { letter: "B", angle: "Reassurance", hook: "Nobody taught you to manage. Most new directors start there.", hypothesis: "Reassurance up front beats naming the worry." },
    { letter: "C", angle: "Offer first", hook: "A twelve week leadership program for first-time directors.", hypothesis: "Leading with the offer brings in more bookings per click." },
    { letter: "D", angle: "Peers", hook: "Learn beside six other directors in their first year.", hypothesis: "A peer angle reaches people the other three miss." },
  ],
} as const;

export const PAGE_TEARDOWN = {
  skill: "Landing Page Teardown",
  title: "Your page, section by section",
  heading: "Landing page teardown: Marketing agencies for coaches",
  meta: "3 pages read · 1 not read",
  model: OPUS,
  answerLabel: "The answer",
  answer: "The 2 other pages open with a qualifier and show results before explaining how. Yours makes the same promise but shows no results and answers no remaining questions.",
  counts: [
    { value: "3", label: "pages read" },
    { value: "3", label: "sections yours lacks that others have" },
    { value: "4", label: "shared patterns" },
    { value: "2", label: "changes to try" },
  ],
  caution: "Vistrial reads the page, not its results. A pattern several pages share is something they do, not proof of why they convert.",
  mapLabel: "Your page",
  states: { does: "Does its job", partly: "Partly", skipped: "Skipped" },
  sections: [
    { name: "Nav", state: "does" },
    { name: "Hero", state: "does" },
    { name: "Problem", state: "does" },
    { name: "Solution", state: "does" },
    { name: "The offer", state: "does" },
    { name: "Process timeline", state: "partly" },
    { name: "Final call to action", state: "partly" },
    { name: "With vs without", state: "skipped" },
    { name: "Your role vs ours", state: "skipped" },
    { name: "FAQ", state: "skipped" },
  ],
  weakTitle: "Weakest points",
  weak: [
    { title: "No With vs without section", body: "Nothing answers \"What if I do nothing?\"" },
    { title: "No Your role vs ours section", body: "Nothing answers \"How much work is it for me?\"" },
    { title: "No FAQ section", body: "Nothing answers \"What about price, guarantee, fit and timing?\"" },
  ],
} as const;

/* ---------------------------------------------------------------------------
 * The loop in the app: the test plan, then what was measured.
 * ------------------------------------------------------------------------- */

export const TEST_PLAN = {
  by: "Test plan",
  title: "Pick a change, set a check-in",
  heading: "Test plan",
  lead: "Two or three changes to test. Pick one, set a check-in, and record what happened.",
  tryButton: "We'll try this",
  checkBack: "Check back in",
  days: "30 days",
  changes: [
    {
      title: "State a results guarantee up front",
      body: "Put the guarantee in the first line of every outreach email and on the sales page.",
      basis: "observed",
      channel: "Paid social",
      trying: "You're trying this.",
      note: "Check-in Nov 30, 2026. Starting figures saved from Meta ads.",
    },
    {
      title: "Add a 60-day pilot, not a discount",
      body: "Offer the first 60 days at a lower price, moving to the full retainer when the guarantee is met.",
      basis: "inferred",
      channel: "Paid social",
    },
  ],
} as const;

export const RESULTS = {
  by: "Tasks",
  title: "Result: what was measured",
  column: "Result",
  note: "What was measured at the check-in",
  kind: "A change you make",
  expectedLabel: "Expected beforehand:",
  cards: [
    {
      client: "Aster Coaching",
      title: "Add reminder texts before Aster's sales calls",
      dates: "Approved September 28, checked October 28.",
      result: "It helped",
      tone: "good",
      measured: "Measured Oct 28",
      figures: [
        { label: "Aster bookings conversions", from: "24", to: "31", change: "+29.2%", good: true },
        { label: "Aster bookings spend", from: "2,400", to: "2,350", change: "-2.1%", good: null },
      ],
      quote: "No-shows dropped in the first week and stayed down.",
      expected: "3 to 6 more booked calls a month",
      basis: "firstParty",
    },
    {
      client: "Ledgerline CFO",
      title: "Raise Ledgerline's entry price",
      dates: "Approved August 30, checked October 30.",
      result: "No clear change",
      tone: "neutral",
      measured: "Measured Oct 30",
      figures: [{ label: "Ledgerline pipeline conversions", from: "5", to: "5", change: "0%", good: null }],
      quote: "Same number of new clients; nobody mentioned the price.",
      expected: "1 to 2 more new clients a month",
      basis: "inferred",
    },
  ],
} as const;
