import type { ChatDetail, ChatRow } from "@/components/chat/agent-chat";
import { EMPTY_OFFER, cleanOffer, type OfferInput } from "../../../../convex/lib/offerCards";
import type {
  DiagnosticsData,
  ItemDecision,
  OfferAnalysisView,
  OfferCardFull,
  OfferCardRow,
  ReportPdfData,
  SkillChatData,
  TabData,
} from "@/components/work/types";

/**
 * Story data for the agent's pages: one agency, Northlight Growth, which sells lead generation and paid ads
 * management to home-service brands. Real-looking but invented rows.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 15);
const id = <T>(value: string) => value as unknown as T;

export const STORY_NOW = NOW;

export function storyTab(skillSlug: TabData["skillSlug"], state: string): TabData {
  const empty = state === "empty";
  const kind = { "market-intelligence": "Home-service lead generation: market report", "offer-intelligence": "Offer analysis: Lead generation retainer", "growth-diagnostics": "Growth diagnosis, 2026-11-08" }[skillSlug];
  return {
    skillSlug,
    running: empty
      ? []
      : [
          { id: id("run1"), status: "running", startedAt: NOW - 4 * 60_000, costCents: 38, stepsDone: 6, phase: skillSlug === "market-intelligence" ? "classify" : "write", question: null, projectId: id("p1") },
          ...(skillSlug === "market-intelligence"
            ? [{ id: id<TabData["running"][number]["id"]>("run2"), status: "waiting" as const, startedAt: NOW - 50 * 60_000, costCents: 12, stepsDone: 3, phase: "ask", question: "Should I include agencies that only run Google ads, or Meta and Google both?", projectId: id<TabData["running"][number]["projectId"]>("p2") }]
            : []),
        ],
    finished: empty ? [] : [{ id: id("run0"), status: "completed", stopReason: "done", startedAt: NOW - 6 * DAY, finishedAt: NOW - 6 * DAY + 600_000, costCents: 84 }],
    results: empty
      ? []
      : [
          { id: id("a1"), title: kind, status: "draft", model: { family: "gpt" as const, name: "GPT-6.1 Sol" }, currentVersion: 1, createdAt: NOW - 2 * 3_600_000, runId: id("run1"), projectId: id("p1") },
          { id: id("a0"), title: kind.replace("2026-11-08", "2026-10-12"), status: "approved", model: null, currentVersion: 2, createdAt: NOW - 20 * DAY, runId: id("run0"), projectId: id("p0") },
        ],
    suggestions: empty
      ? [{ id: "research-first", title: "Approve a report to unlock the next steps", detail: "Offers and Diagnostics build on research you have approved.", tab: "research" }]
      : skillSlug === "market-intelligence"
        ? [
            { id: "offers-from-report", title: "Analyse your offer against this", detail: "Sets your offer beside what competitors lead with in your approved research.", tab: "offers", prompt: "Analyse my offer against my approved market research." },
            { id: "diagnostics-from-report", title: "Find where growth stalls", detail: "A diagnosis from your own figures, with a 90-day roadmap toward your goal.", tab: "diagnostics", prompt: "Find where my growth stalls." },
          ]
        : skillSlug === "offer-intelligence"
          ? [{ id: "diagnostics-from-report", title: "Find where growth stalls", detail: "A diagnosis from your own figures, with a 90-day roadmap toward your goal.", tab: "diagnostics", prompt: "Find where my growth stalls." }]
          : [{ id: "offers-from-diagnosis", title: "Test your offer next", detail: "Compare your offer with competitors' before scaling spend.", tab: "offers", prompt: "Analyse my offer before I scale." }],
    state: { approvedReport: !empty, approvedOffer: !empty, approvedDiagnosis: !empty, ownData: !empty, goal: !empty },
  };
}

/** The agency's main offer, as the builder saves it. */
const retainer: OfferInput = {
  name: "Done-for-you lead generation retainer",
  targetCustomer: "Home-service brands doing $1M to $5M a year",
  outcome: "20 booked sales calls every month, without hiring a marketer",
  price: "",
  pricing: { kind: "monthly", amount: "$2,500", was: "$3,000", tiers: [] },
  included: [],
  items: [
    { text: "Paid ads management on Meta and Google", value: "$1,500" },
    { text: "Two landing pages, built and tested", value: "$2,000" },
    { text: "Lead follow-up by text within five minutes", value: "$800" },
    { text: "Weekly lead report", value: "" },
  ],
  bonuses: ["90-day content calendar", "Sales call scripts"],
  guaranteeType: "results",
  guarantee: "20 booked calls in 60 days or we work free until you get them.",
  terms: "Month to month. 30-day notice. Ad spend billed by the platforms.",
  cta: "Book a strategy call",
  channel: "Cold outreach",
};

export const STORY_OFFER = cleanOffer(retainer);

/** What "Start from: Business profile" fills in. */
export const STORY_PROFILE_OFFER = cleanOffer({
  ...EMPTY_OFFER,
  name: "Paid ads management for home-service brands",
  targetCustomer: "Roofers, HVAC and plumbing companies in Texas",
  pricing: { kind: "monthly", amount: "$1,500", was: "", tiers: [] },
  channel: "Referrals",
});

export function storyCards(state: string): { cards: OfferCardRow[]; card: OfferCardFull | null } {
  if (state === "empty") return { cards: [], card: null };
  const version = (n: number, change: Partial<OfferInput>, rest: Pick<OfferCardFull["versions"][number], "origin" | "assetId" | "note" | "createdAt">) => ({ version: n, ...cleanOffer({ ...retainer, ...change }), ...rest });
  const versions: OfferCardFull["versions"] = [
    version(1, { pricing: null, price: "$2,000/mo", outcome: "", items: retainer.items!.slice(0, 2).map((row) => ({ ...row, value: "" })), bonuses: [], guaranteeType: "", guarantee: "", cta: "", channel: "" }, { origin: "chat", assetId: null, note: null, createdAt: NOW - 30 * DAY }),
    version(2, { pricing: { kind: "monthly", amount: "$2,000", was: "", tiers: [] }, bonuses: [], guaranteeType: "", guarantee: "", cta: "Get a free ad account audit" }, { origin: "person", assetId: null, note: "Added the outcome, the line items and a call to action", createdAt: NOW - 18 * DAY }),
    version(3, {}, { origin: "person", assetId: null, note: "Raised the price, added the booked-calls guarantee and two bonuses", createdAt: NOW - 2 * DAY }),
  ];
  const second = {
    version: 1,
    ...cleanOffer({ ...EMPTY_OFFER, name: "Paid ads management for home-service brands", targetCustomer: "Roofers, HVAC and plumbers", pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Starter", price: "$1,500/mo" }, { name: "Growth", price: "$2,500/mo" }] }, items: [{ text: "Meta and Google ads", value: "" }, { text: "Monthly creative refresh", value: "" }] }),
    origin: "person" as const,
    assetId: null,
    note: null,
    createdAt: NOW - 9 * DAY,
  };
  return {
    cards: [
      { id: id("c1"), versions: 3, updatedAt: NOW - 2 * DAY, current: versions[2] },
      { id: id("c2"), versions: 1, updatedAt: NOW - 9 * DAY, current: second },
    ],
    card: {
      id: id("c1"),
      name: retainer.name,
      currentVersion: 3,
      versions,
      analyses: state === "analysing" ? [{ runId: id("run1"), version: 3, at: NOW - 4 * 60_000, state: "running", assetId: null, assetStatus: null }] : [{ runId: id("run1"), version: 3, at: NOW - 2 * 3_600_000, state: "done", assetId: id("a1"), assetStatus: "draft" }],
    },
  };
}

export function storyAnalysis(): OfferAnalysisView {
  return {
    assetId: id("a1"),
    model: { family: "gpt" as const, name: "GPT-6.1 Sol" },
    title: "Offer analysis: Lead generation retainer",
    status: "draft",
    createdAt: NOW - 2 * 3_600_000,
    summary: "Your retainer is priced in line with the two agencies that state a price, but you are the only one with no stated guarantee and no low-commitment way to start.",
    position: "Lead with a results guarantee in outreach, where competitors lead with a free audit.",
    ours: { product: "Done-for-you lead generation retainer", price: "$2,500/mo", guarantee: "Not stated", terms: "Month to month, 30-day notice", basis: "stated" },
    competitors: [
      { competitor: "LeadForge Media", offer: "Free ad account audit, then a 90-day pilot", price: "$1,950/mo pilot", guarantee: "30 qualified leads in 30 days or the next month is free", basisLabel: "Observed", sources: [{ id: "s1", title: "LeadForge Media: Meta ad, Oct 2026", url: "https://www.facebook.com/ads/library/?id=1", platform: "metaAdLibrary" }], gaps: { price: false, guarantee: true } },
      { competitor: "Summit Scale", offer: "Pay per booked appointment", price: "From $85 a booked call", guarantee: "Not stated", basisLabel: "Observed", sources: [{ id: "s2", title: "Summit Scale pricing page", url: "https://example.com/pricing", platform: "web" }], gaps: { price: false, guarantee: false } },
      { competitor: "HomePro Marketing", offer: "Exclusive territory per trade", price: "Not stated", guarantee: "Cancel any time in the first 60 days", basisLabel: "Inference", sources: [{ id: "s3", title: "HomePro Marketing on Instagram", url: "https://instagram.com/p/x", platform: "instagram" }], gaps: { price: false, guarantee: true } },
    ],
    gapsAndRisks: [
      { kind: "gap", statement: "Two of three agencies state a guarantee; you state none.", basisLabel: "Observed" },
      { kind: "risk", statement: "Matching a $1,950 pilot would cut your first three months by $1,650.", basisLabel: "Inference" },
    ],
    changes: [
      { index: 0, title: "State a results guarantee up front", proposedChange: "Put “20 booked calls in 60 days or we work free until you get them.” in the first line of every outreach email and on the sales page.", validationMethod: "Compare booked sales calls for four weeks before and after.", evidence: "LeadForge Media leads every ad with a lead-count promise.", basisLabel: "Observed", channel: "Paid social", newChannel: false, metric: "bookings" },
      { index: 1, title: "Add a 60-day pilot, not a discount", proposedChange: "Offer the first 60 days at $2,000/mo, moving to $2,500/mo when the guarantee is met.", validationMethod: "Watch cost per signed client and how many pilots convert to the full retainer.", evidence: "Two agencies lead with a low-commitment start.", basisLabel: "Inference", channel: "Paid social", newChannel: false, metric: "costPerBooking" },
      { index: 2, title: "Ask retained clients for a referral", proposedChange: "After each client's third monthly report, ask for one introduction to another home-service owner.", validationMethod: "Count referred sales calls over 60 days.", evidence: "Your own results show most signed clients came from referrals.", basisLabel: "Your data", channel: "Referrals", newChannel: true, metric: "callVolume" },
    ],
    limits: ["The research covered Meta ads, websites and Instagram, not cold email."],
    reports: [{ title: "Home-service lead generation: market report", version: 2 }],
  };
}

export function storyDecisions(): Map<number, ItemDecision> {
  return new Map([
    [
      0,
      {
        id: id("d1"),
        itemKind: "offerChange",
        phase: null,
        assetId: id("a1"),
        opportunityIndex: 0,
        opportunity: "State a results guarantee up front",
        proposedAction: "Put the promise first.",
        validationMethod: "Compare booked sales calls.",
        checkInAt: NOW + 21 * DAY,
        createdAt: NOW - 9 * DAY,
        due: false,
        baseline: [{ source: "meta", label: "Meta ads", currency: "USD", dateStart: "2026-10-01", dateStop: "2026-10-31", spend: 1200, conversions: 41, capturedAt: NOW - 9 * DAY }],
        outcome: null,
      },
    ],
  ]);
}

export function storyOfferChat(state: string): SkillChatData | null {
  if (state === "empty") return null;
  const msg = (n: number, role: "you" | "agent", kind: string, text: string, extra: { chips?: string[]; data?: unknown } = {}) => ({ id: id<SkillChatData["messages"][number]["id"]>(`m${n}`), role, kind, text, chips: extra.chips ?? [], model: null, data: extra.data ?? null, at: NOW + n });
  return {
    intake: { id: id("i1"), skillSlug: "offer-intelligence", status: "ready", asking: null, answers: {}, runId: null, projectId: null, questions: [] },
    messages: [
      msg(1, "you", "text", "Is our $2,500/mo lead generation retainer strong enough?"),
      msg(2, "agent", "known", "From what you told Vistrial before:", { data: [{ key: "acquisitionChannels", value: "Referrals, cold outreach, Facebook and Instagram ads" }] }),
      msg(3, "agent", "question", "Which offer is this about? Its name and price, for example \"Done-for-you lead generation retainer, $2,500/mo\"."),
      msg(4, "you", "text", "Done-for-you lead generation retainer, $2,500/mo"),
      msg(5, "agent", "question", "What's included, and what guarantee or terms do you give? Separate items with commas."),
      msg(6, "you", "text", "Paid ads management, landing pages, weekly lead report, 20 booked calls in 60 days or we work free"),
      msg(7, "agent", "plan", "Here's the plan.", {
        data: {
          name: "Offer Intelligence",
          steps: ["Read your approved market reports and what you told it about your offer", "Set your offer beside what competitors lead with, from that research", "Suggest two or three changes to test, each with how to tell if it worked", "Check every claim against its sources, then save it for you to approve"],
          reads: "Only approved research and your own words. It does not change your offer.",
          capCents: 150,
          dayLeftCents: 916,
        },
      }),
    ],
  };
}

export function storyDiagnosisChat(): SkillChatData {
  return {
    intake: { id: id("i2"), skillSlug: "growth-diagnostics", status: "chatting", asking: "goal", answers: {}, runId: null, projectId: null, questions: [] },
    messages: [
      { id: id("m1"), role: "you", kind: "text", text: "Find where my growth stalls.", chips: [], data: null, at: NOW },
      { id: id("m2"), role: "agent", kind: "question", text: "First, what's your goal for the next 90 days? Say it with a number if you can.", chips: ["10 more retained clients this quarter", "Lower our cost per booked call", "Keep clients past month three"], data: null, at: NOW + 1 },
    ],
  };
}

export function storyDiagnostics(state: string): DiagnosticsData {
  if (state === "empty") return { goal: null, data: { meta: false, resultsFiles: 0, outcomes: 0 }, diagnosis: null };
  const f = (fid: string, label: string, display: string, computed: boolean, formula: string | null = null, period: string | null = "Oct 1 to Oct 31, 2026") => ({ id: fid, label, display, computed, formula, period });
  const cpl = f("F3", "Meta ads: cost per booked call", "$86.00", true, "spend $3,870.00 ÷ 45 calls");
  const lead = f("F4", "Clicks that became booked calls", "2.4%", true, "45 calls ÷ 1,874 clicks");
  const ctr = f("F2", "Meta ads: click-through rate", "1.26%", false);
  const book = f("F5", "Calls that signed a retainer (your file)", "17.8%", true, "8 signed ÷ 45 calls");
  const repeat = f("F6", "Clients kept past month three", "14 of 22", false);
  return {
    goal: { text: "10 more retained clients this quarter", target: 10, metric: "clients", period: "quarter", setAt: NOW - 3 * DAY },
    data: { meta: true, resultsFiles: 2, outcomes: 0 },
    diagnosis: {
      assetId: id("g1"),
      model: { family: "gpt" as const, name: "GPT-6.1 Sol" },
      title: "Growth diagnosis, 2026-11-08",
      status: "draft",
      createdAt: NOW - 3_600_000,
      projectId: id("p9"),
      goalUsed: "10 more retained clients this quarter",
      hasData: true,
      missing: ["Not enough data on revenue: upload a clients file with retainer values to see revenue per client."],
      summary: "Prospects book sales calls at a steady rate, but fewer than one call in five signs. Fixing the step from call to signed retainer is the fastest way toward 10 more retained clients this quarter.",
      stage: "leads",
      stageReason: "Sales calls turn into signed retainers at 17.8%, the weakest step in your own funnel.",
      stageFigures: [book, cpl],
      findings: [
        { statement: "Each booked call costs $86.00 on Meta.", figures: [cpl] },
        { statement: "2.4% of clicks became booked calls.", figures: [lead] },
        { statement: "17.8% of calls signed a retainer.", figures: [book] },
      ],
      roadmap: [
        { index: 0, phase: "fix", problem: "17.8% of sales calls sign; the rest go quiet.", action: "Send a one-page proposal within two hours of every sales call", targetMetric: "Calls that signed a retainer (your file)", target: "Above 17.8% by week 4", figures: [book] },
        { index: 1, phase: "fix", problem: "Each booked call costs $86.00 on Meta.", action: "Pause the two ad sets with the highest cost per booked call", targetMetric: "Meta ads: cost per booked call", target: "Below $86.00", figures: [cpl] },
        { index: 2, phase: "build", problem: "2.4% of clicks became booked calls.", action: "Put two client results and the calendar above the fold on the landing page", targetMetric: "Clicks that became booked calls", target: "Above 2.4%", figures: [lead] },
        { index: 3, phase: "build", problem: "Only 14 of 22 clients stayed past month three.", action: "Hold a 60-day results review with every new client", targetMetric: "Clients kept past month three", target: "More than 14 of every 22", figures: [repeat] },
        { index: 4, phase: "scale", problem: "Meta click-through rate holds at 1.26%.", action: "Move the saved budget into the best ad and raise spend weekly", targetMetric: "Meta ads: cost per booked call", target: "Toward 10 more retained clients this quarter at or below $86.00 a call", figures: [ctr, cpl] },
        { index: 5, phase: "scale", problem: "Not enough data on revenue per client.", action: "Upload a clients file with retainer values before raising spend further", targetMetric: "Revenue per client", target: "Not enough data", figures: [] },
      ],
      fixes: [],
      limits: ["Compared only with your own October figures."],
    },
  };
}

export function storyRoadmapDecisions(): Map<number, ItemDecision> {
  return new Map([
    [
      0,
      {
        id: id("d9"),
        itemKind: "roadmapStep",
        phase: "fix",
        assetId: id("g1"),
        opportunityIndex: 0,
        opportunity: "17.8% of sales calls sign.",
        proposedAction: "Send a proposal within two hours of every call",
        validationMethod: "Watch calls that signed.",
        checkInAt: NOW + 14 * DAY,
        createdAt: NOW - DAY,
        due: false,
        baseline: [{ source: "upload", label: "HubSpot deals", currency: "USD", dateStart: "2026-10-01", dateStop: "2026-10-31", conversions: 8, revenue: 20000, capturedAt: NOW - DAY }],
        outcome: null,
      },
    ],
  ]);
}

export function storyReportPdf(): ReportPdfData {
  const src = (n: number, platform: ReportPdfData["sources"][number]["platform"], title: string, url: string, publisher: string, offer: string | null, cta: string | null) => ({ id: `s${n}`, platform, title, url, publisher, offer, callToAction: cta });
  return {
    title: "Home-service lead generation: market report",
    model: { family: "claude" as const, name: "Claude Opus 5.5" },
    status: "approved",
    version: 2,
    createdAt: NOW - 20 * DAY,
    businessName: "Northlight Growth",
    market: "Lead generation for home-service brands",
    geography: "Texas",
    objective: "What do competing agencies lead with, and where is there room for us?",
    summary: "Agencies selling to home-service brands lead with free audits on Meta and with case studies on their websites. Few state a guarantee, and almost none show a fixed monthly price.",
    findings: [
      { statement: "Four of seven agencies lead their Meta ads with a free audit or strategy call.", basisLabel: "Observed", sourceIds: ["s1", "s2", "s4"] },
      { statement: "Only two agencies state a results guarantee anywhere.", basisLabel: "Observed", sourceIds: ["s1", "s5"] },
      { statement: "Fixed retainer prices are rare; most ask you to book a call.", basisLabel: "Inference", sourceIds: ["s3", "s6"] },
      { statement: "Your booked calls from Meta cost $86.00 each in October.", basisLabel: "Your data", sourceIds: [] },
    ],
    opportunities: [
      { opportunity: "Own the guarantee", proposedAction: "Lead with 20 booked calls in 60 days or we work free.", validationMethod: "Compare booked sales calls for four weeks before and after.", uncertainty: "none", sourceIds: ["s1", "s5"] },
      { opportunity: "Show a fixed price", proposedAction: "Publish the $2,500/mo retainer with what is included.", validationMethod: "Track sales calls that sign.", uncertainty: "hypothesis", sourceIds: ["s3"] },
    ],
    limits: ["TikTok has no public search, so only videos found on the web were checked."],
    sources: [
      src(1, "metaAdLibrary", "LeadForge Media ad: free ad account audit", "https://www.facebook.com/ads/library/?id=1", "LeadForge Media", "Free audit, 90-day pilot", "Book a call"),
      src(2, "metaAdLibrary", "Summit Scale: pay per booked appointment", "https://www.facebook.com/ads/library/?id=2", "Summit Scale", "From $85 a booked call", "Get pricing"),
      src(3, "web", "HomePro Marketing: Pricing", "https://example.com/homepro/pricing", "HomePro Marketing", null, "Book a call"),
      src(4, "instagram", "Trade Leads Co reel: a roofer's first 30 days", "https://instagram.com/p/abc", "Trade Leads Co", "Free strategy call", "Book a call"),
      src(5, "web", "LeadForge Media: Our guarantee", "https://example.com/leadforge/guarantee", "LeadForge Media", "30 leads in 30 days guarantee", "Book a call"),
      src(6, "youtube", "What should a contractor pay a marketing agency?", "https://youtube.com/watch?v=xyz", "Contractor Growth", null, null),
      src(7, "tiktok", "HVAC owner on firing his agency", "https://tiktok.com/@hvac/video/1", "Lone Star HVAC", null, "Follow"),
    ],
    figures: [
      { source: "meta", label: "Meta ads", currency: "USD", period: "2026-10-01 to 2026-10-31", spend: 3870, conversions: 45, revenue: null },
      { source: "upload", label: "HubSpot deals", currency: "USD", period: "2026-10-01 to 2026-10-31", spend: null, conversions: 8, revenue: 20000 },
    ],
  };
}

/** The Chat tab's past conversations: one per route, and one the chat is still asking about. */
export function storyChats(): ChatRow[] {
  const row = (n: number, route: ChatRow["route"], title: string, status: ChatRow["status"], ago: number, result: ChatRow["result"] = null): ChatRow => ({ id: id(`i${n}`), route, title, status, updatedAt: NOW - ago, mine: n !== 4, context: null, result });
  return [
    row(1, null, "I want more clients", "chatting", 2 * 60_000),
    row(2, "offer-intelligence", "Is our $2,500/mo lead generation retainer strong enough?", "ready", 40 * 60_000),
    row(3, "growth-diagnostics", "Why did we stop adding retained clients this quarter?", "started", 3 * 3_600_000, { state: "done", tab: "diagnostics", path: "/work/diagnostics/p9", title: "Growth diagnosis, 2026-11-08", assetStatus: "draft", runId: id("run9") }),
    row(4, "market-intelligence", "What do other lead-gen agencies charge home-service brands?", "started", 2 * DAY, { state: "running", tab: "research", path: "/work/research/p1", title: null, assetStatus: null, runId: id("run1") }),
    row(5, "market-intelligence", "Who is winning roofing leads in Dallas?", "started", 20 * DAY, { state: "done", tab: "research", path: "/work/research/p0", title: "Home-service lead generation: market report", assetStatus: "approved", runId: id("run0") }),
  ];
}

const chatMsg = (n: number, role: "you" | "agent", kind: string, text: string, extra: { chips?: string[]; data?: unknown } = {}) => ({ id: id<ChatDetail["messages"][number]["id"]>(`cm${n}`), role, kind, text, chips: extra.chips ?? [], data: extra.data ?? null, model: null, at: NOW + n });

/** An unclear first message: the chat asks which of the three skills the person wants. */
export function storyUndecidedChat(): ChatDetail {
  const choices = [
    { skill: "market-intelligence", chip: "Research my market", name: "Market Intelligence", does: "researches your market and competitors, with every source" },
    { skill: "offer-intelligence", chip: "Work on my offer", name: "Offer Intelligence", does: "sets your offer beside competitors' and suggests changes to test" },
    { skill: "growth-diagnostics", chip: "Find why I'm not growing", name: "Growth Diagnostics", does: "finds where growth stalls in your own data and writes a 90-day roadmap" },
  ];
  return {
    id: id("i1"),
    page: null,
    model: null,
    route: null,
    checklist: false,
    title: "I want more clients",
    status: "chatting",
    mine: true,
    context: null,
    result: null,
    messages: [chatMsg(1, "you", "text", "I want more clients"), chatMsg(2, "agent", "route", "I can take this three ways. Which do you want?", { chips: choices.map((row) => row.chip), data: { choices } })],
  };
}

/** A finished diagnosis conversation: the questions, the plan, and the link to the result in its tab. */
export function storyFinishedChat(): { chat: ChatDetail; data: SkillChatData } {
  const messages = [
    chatMsg(1, "you", "text", "Why did we stop adding retained clients this quarter?"),
    chatMsg(2, "agent", "question", "First, what's your goal for the next 90 days? Say it with a number if you can."),
    chatMsg(3, "you", "text", "10 more retained clients this quarter"),
    chatMsg(4, "agent", "plan", "Here's the plan. Nothing runs or spends until you press Start.", {
      data: {
        name: "Growth Diagnostics",
        steps: ["Read your own results: Meta ads and the results files you uploaded", "Work out every figure in code, compared only with your own past", "Find where growth stalls and write a 90-day roadmap: Fix, Build, Scale", "Check every number against your figures, then save it for you to approve"],
        reads: "Only your own connected data. It changes nothing in your accounts.",
        capCents: 100,
        dayLeftCents: 400,
      },
    }),
  ];
  return {
    chat: { id: id("i3"), page: null, model: null, route: "growth-diagnostics", checklist: true, title: "Why did we stop adding retained clients this quarter?", status: "started", mine: true, context: null, result: storyChats()[2].result, messages },
    data: { intake: { id: id("i3"), skillSlug: "growth-diagnostics", status: "started", asking: null, answers: {}, runId: id("run9"), projectId: id("p9"), questions: [] }, messages },
  };
}

/** An offer conversation with its plan ready and the offer attached with "Refine in chat". */
export function storyPlanChat(): { chat: ChatDetail; data: SkillChatData } {
  const data = storyOfferChat("full")!;
  return {
    chat: { id: id("i2"), page: null, model: null, route: "offer-intelligence", checklist: true, title: "Is our $2,500/mo lead generation retainer strong enough?", status: "ready", mine: true, context: { kind: "offer", id: "c1", title: "Done-for-you lead generation retainer" }, result: null, messages: data.messages.map((row) => ({ ...row, model: null })) },
    data,
  };
}
