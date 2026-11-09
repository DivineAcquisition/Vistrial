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

/** Story data for the three work tabs: one cleaning business in Austin, with real-looking but invented rows. */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 15);
const id = <T>(value: string) => value as unknown as T;

export const STORY_NOW = NOW;

export function storyTab(skillSlug: TabData["skillSlug"], state: string): TabData {
  const empty = state === "empty";
  const kind = { "market-intelligence": "Austin deep cleaning: market report", "offer-intelligence": "Offer analysis: Deep clean", "growth-diagnostics": "Growth diagnosis, 2026-11-08" }[skillSlug];
  return {
    skillSlug,
    running: empty
      ? []
      : [
          { id: id("run1"), status: "running", startedAt: NOW - 4 * 60_000, costCents: 38, stepsDone: 6, phase: skillSlug === "market-intelligence" ? "classify" : "write", question: null, projectId: id("p1") },
          ...(skillSlug === "market-intelligence"
            ? [{ id: id<TabData["running"][number]["id"]>("run2"), status: "waiting" as const, startedAt: NOW - 50 * 60_000, costCents: 12, stepsDone: 3, phase: "ask", question: "Should I include Round Rock, or only Austin city limits?", projectId: id<TabData["running"][number]["projectId"]>("p2") }]
            : []),
        ],
    finished: empty ? [] : [{ id: id("run0"), status: "completed", stopReason: "done", startedAt: NOW - 6 * DAY, finishedAt: NOW - 6 * DAY + 600_000, costCents: 84 }],
    results: empty
      ? []
      : [
          { id: id("a1"), title: kind, status: "draft", currentVersion: 1, createdAt: NOW - 2 * 3_600_000, runId: id("run1"), projectId: id("p1") },
          { id: id("a0"), title: kind.replace("2026-11-08", "2026-10-12"), status: "approved", currentVersion: 2, createdAt: NOW - 20 * DAY, runId: id("run0"), projectId: id("p0") },
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

const deepClean = {
  name: "Deep clean",
  included: ["Kitchen, inside the oven and fridge", "Bathrooms, descaled", "Baseboards and door frames", "Inside windows"],
  guarantee: "Not happy? We come back within 24 hours, free.",
  terms: "48-hour cancel notice. Pay after the clean.",
  targetCustomer: "Busy homeowners in central Austin",
};

export function storyCards(state: string): { cards: OfferCardRow[]; card: OfferCardFull | null } {
  if (state === "empty") return { cards: [], card: null };
  const versions: OfferCardFull["versions"] = [
    { version: 1, ...deepClean, price: "$180", included: deepClean.included.slice(0, 3), guarantee: "", origin: "chat", assetId: null, note: null, createdAt: NOW - 30 * DAY },
    { version: 2, ...deepClean, price: "$180", origin: "analysis", assetId: id("a0"), note: "From the offer analysis: what you stated.", createdAt: NOW - 18 * DAY },
    { version: 3, ...deepClean, price: "$199", origin: "person", assetId: null, note: "Raised the price, added the re-clean promise", createdAt: NOW - 2 * DAY },
  ];
  return {
    cards: [
      { id: id("c1"), versions: 3, updatedAt: NOW - 2 * DAY, current: versions[2] },
      { id: id("c2"), versions: 1, updatedAt: NOW - 9 * DAY, current: { version: 1, name: "Move-out clean", price: "$260", included: ["Whole home", "Inside cabinets"], guarantee: "", terms: "", targetCustomer: "Renters moving out", origin: "person", assetId: null, note: null, createdAt: NOW - 9 * DAY } },
    ],
    card: { id: id("c1"), currentVersion: 3, versions },
  };
}

export function storyAnalysis(): OfferAnalysisView {
  return {
    assetId: id("a1"),
    title: "Offer analysis: Deep clean",
    status: "draft",
    createdAt: NOW - 2 * 3_600_000,
    summary: "Your deep clean is priced in line with the two competitors that state a price, but you are the only one with no stated guarantee and no first-visit offer.",
    position: "Lead with the re-clean promise on paid social, where competitors lead with discounts.",
    ours: { product: "Deep clean", price: "$180", guarantee: "Not stated", terms: "48-hour cancel notice", basis: "stated" },
    competitors: [
      { competitor: "Sparkle Co", offer: "20% off your first deep clean", price: "$160 first visit", guarantee: "100% satisfaction or we re-clean", basisLabel: "Observed", sources: [{ id: "s1", title: "Sparkle Co: Meta ad, Oct 2026", url: "https://www.facebook.com/ads/library/?id=1", platform: "metaAdLibrary" }], gaps: { price: false, guarantee: true } },
      { competitor: "Maid Right Austin", offer: "Weekly plan, locked rate", price: "From $139 a visit", guarantee: "Not stated", basisLabel: "Observed", sources: [{ id: "s2", title: "Maid Right pricing page", url: "https://example.com/pricing", platform: "web" }], gaps: { price: false, guarantee: false } },
      { competitor: "Casa Clean", offer: "Eco products included", price: "Not stated", guarantee: "Bonded and insured", basisLabel: "Inference", sources: [{ id: "s3", title: "Casa Clean on Instagram", url: "https://instagram.com/p/x", platform: "instagram" }], gaps: { price: false, guarantee: true } },
    ],
    gapsAndRisks: [
      { kind: "gap", statement: "Two of three competitors state a guarantee; you state none.", basisLabel: "Observed" },
      { kind: "risk", statement: "Matching a 20% first-visit discount would cut your first job to $144.", basisLabel: "Inference" },
    ],
    changes: [
      { index: 0, title: "State the re-clean guarantee up front", proposedChange: "Put “Not happy? We come back within 24 hours, free.” in the first line of every ad and on the booking page.", validationMethod: "Compare bookings from Meta for four weeks before and after.", evidence: "Sparkle Co leads every ad with a satisfaction promise.", basisLabel: "Observed", channel: "Paid social", newChannel: false, metric: "bookings" },
      { index: 1, title: "Add a first-clean price, not a discount", proposedChange: "Offer the first deep clean at $165 with the second booked at $180.", validationMethod: "Watch cost per booking and how many first-time customers book a second clean within 30 days.", evidence: "Two competitors lead with a first-visit price.", basisLabel: "Inference", channel: "Paid social", newChannel: false, metric: "costPerBooking" },
      { index: 2, title: "Ask happy customers for a Google review", proposedChange: "Text a review link the evening after each clean.", validationMethod: "Count new Google reviews and search calls over 60 days.", evidence: "Your own results show most bookings come from search.", basisLabel: "Your data", channel: "Search", newChannel: true, metric: "callVolume" },
    ],
    limits: ["The research covered Meta ads, websites and Instagram, not Google ads."],
    reports: [{ title: "Austin deep cleaning: market report", version: 2 }],
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
        opportunity: "State the re-clean guarantee up front",
        proposedAction: "Put the promise first.",
        validationMethod: "Compare bookings.",
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
  const msg = (n: number, role: "you" | "agent", kind: string, text: string, extra: { chips?: string[]; data?: unknown } = {}) => ({ id: id<SkillChatData["messages"][number]["id"]>(`m${n}`), role, kind, text, chips: extra.chips ?? [], data: extra.data ?? null, at: NOW + n });
  return {
    intake: { id: id("i1"), skillSlug: "offer-intelligence", status: "ready", asking: null, answers: {}, runId: null, projectId: null, questions: [] },
    messages: [
      msg(1, "you", "text", "Analyse my offer against my approved market research."),
      msg(2, "agent", "known", "From what you told Vistrial before:", { data: [{ key: "acquisitionChannels", value: "Facebook and Instagram ads, Google search" }] }),
      msg(3, "agent", "question", "Which offer is this about? Its name and price, for example \"Deep clean, $180\"."),
      msg(4, "you", "text", "Deep clean, $199"),
      msg(5, "agent", "question", "What's included, and what guarantee or terms do you give? Separate items with commas."),
      msg(6, "you", "text", "Kitchen, bathrooms, baseboards, inside windows, free re-clean within 24 hours"),
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
      { id: id("m2"), role: "agent", kind: "question", text: "First, what's your goal for the next 90 days? Say it with a number if you can.", chips: ["40 more bookings a month", "Lower my cost per lead", "More repeat customers"], data: null, at: NOW + 1 },
    ],
  };
}

export function storyDiagnostics(state: string): DiagnosticsData {
  if (state === "empty") return { goal: null, diagnosis: null };
  const f = (fid: string, label: string, display: string, computed: boolean, formula: string | null = null, period: string | null = "Oct 1 to Oct 31, 2026") => ({ id: fid, label, display, computed, formula, period });
  const cpl = f("F3", "Meta ads: cost per lead", "$21.50", true, "spend $3,913.89 ÷ 182 leads");
  const lead = f("F4", "Clicks that became leads", "9.71%", true, "182 leads ÷ 1,874 clicks");
  const ctr = f("F2", "Meta ads: click-through rate", "1.26%", false);
  const book = f("F5", "Leads that booked (your file)", "31.9%", true, "58 bookings ÷ 182 leads");
  const repeat = f("F6", "Second bookings within 60 days", "12 of 58", false);
  return {
    goal: { text: "40 more bookings a month", target: 40, metric: "bookings", period: "month", setAt: NOW - 3 * DAY },
    diagnosis: {
      assetId: id("g1"),
      title: "Growth diagnosis, 2026-11-08",
      status: "draft",
      createdAt: NOW - 3_600_000,
      projectId: id("p9"),
      goalUsed: "40 more bookings a month",
      hasData: true,
      missing: ["Not enough data on revenue: upload a bookings file with job values to see revenue per booking."],
      summary: "People click your ads at a steady rate, but fewer than one lead in three books. Fixing the step from lead to booking is the fastest way toward 40 more bookings a month.",
      stage: "leads",
      stageReason: "Leads turn into bookings at 31.9%, the weakest step in your own funnel.",
      stageFigures: [book, cpl],
      findings: [
        { statement: "Each lead costs $21.50 on Meta.", figures: [cpl] },
        { statement: "9.71% of clicks became leads.", figures: [lead] },
        { statement: "31.9% of leads booked a clean.", figures: [book] },
      ],
      roadmap: [
        { index: 0, phase: "fix", problem: "31.9% of leads book; the rest go quiet.", action: "Call or text every new lead within 15 minutes, 8am to 8pm", targetMetric: "Leads that booked (your file)", target: "Above 31.9% by week 4", figures: [book] },
        { index: 1, phase: "fix", problem: "Each lead costs $21.50 on Meta.", action: "Pause the two ad sets with the highest cost per lead", targetMetric: "Meta ads: cost per lead", target: "Below $21.50", figures: [cpl] },
        { index: 2, phase: "build", problem: "9.71% of clicks became leads.", action: "Add instant online booking to the ad's landing page", targetMetric: "Clicks that became leads", target: "Above 9.71%", figures: [lead] },
        { index: 3, phase: "build", problem: "Only 12 of 58 customers booked a second clean.", action: "Offer a recurring plan at the end of every first clean", targetMetric: "Second bookings within 60 days", target: "More than 12 of every 58", figures: [repeat] },
        { index: 4, phase: "scale", problem: "Meta click-through rate holds at 1.26%.", action: "Move the saved budget into the best ad and raise spend weekly", targetMetric: "Meta ads: cost per lead", target: "Toward 40 more bookings a month at or below $21.50 a lead", figures: [ctr, cpl] },
        { index: 5, phase: "scale", problem: "Not enough data on revenue per booking.", action: "Upload a bookings file with job values before raising spend further", targetMetric: "Revenue per booking", target: "Not enough data", figures: [] },
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
        opportunity: "31.9% of leads book.",
        proposedAction: "Call every lead within 15 minutes",
        validationMethod: "Watch leads that booked.",
        checkInAt: NOW + 14 * DAY,
        createdAt: NOW - DAY,
        due: false,
        baseline: [{ source: "upload", label: "Jobber bookings", currency: "USD", dateStart: "2026-10-01", dateStop: "2026-10-31", conversions: 58, revenue: 11020, capturedAt: NOW - DAY }],
        outcome: null,
      },
    ],
  ]);
}

export function storyReportPdf(): ReportPdfData {
  const src = (n: number, platform: ReportPdfData["sources"][number]["platform"], title: string, url: string, publisher: string, offer: string | null, cta: string | null) => ({ id: `s${n}`, platform, title, url, publisher, offer, callToAction: cta });
  return {
    title: "Austin deep cleaning: market report",
    status: "approved",
    version: 2,
    createdAt: NOW - 20 * DAY,
    businessName: "Bright Nest Cleaning",
    market: "Residential deep cleaning",
    geography: "Austin, TX",
    objective: "What do competitors in Austin lead with, and where is there room for us?",
    summary: "Austin cleaners lead with first-visit discounts on Meta and with trust signals (insured, background-checked) on their websites. Few state a guarantee, and almost none show a fixed price for a deep clean.",
    findings: [
      { statement: "Four of seven competitors lead their Meta ads with a first-visit discount of 15–25%.", basisLabel: "Observed", sourceIds: ["s1", "s2", "s4"] },
      { statement: "Only two competitors state a satisfaction guarantee anywhere.", basisLabel: "Observed", sourceIds: ["s1", "s5"] },
      { statement: "Fixed deep-clean prices are rare; most ask for a quote.", basisLabel: "Inference", sourceIds: ["s3", "s6"] },
      { statement: "Your Meta leads cost $21.50 each in October.", basisLabel: "Your data", sourceIds: [] },
    ],
    opportunities: [
      { opportunity: "Own the guarantee", proposedAction: "Lead with a 24-hour free re-clean promise.", validationMethod: "Compare Meta bookings for four weeks before and after.", uncertainty: "none", sourceIds: ["s1", "s5"] },
      { opportunity: "Show a fixed price", proposedAction: "Publish a fixed price for a 3-bed deep clean.", validationMethod: "Track quote requests that book.", uncertainty: "hypothesis", sourceIds: ["s3"] },
    ],
    limits: ["TikTok has no public search, so only videos found on the web were checked."],
    sources: [
      src(1, "metaAdLibrary", "Sparkle Co ad: 20% off your first deep clean", "https://www.facebook.com/ads/library/?id=1", "Sparkle Co", "20% off first clean", "Book now"),
      src(2, "metaAdLibrary", "Maid Right: First visit $139", "https://www.facebook.com/ads/library/?id=2", "Maid Right Austin", "First visit $139", "Get quote"),
      src(3, "web", "Casa Clean: Pricing", "https://example.com/casa/pricing", "Casa Clean", null, "Get quote"),
      src(4, "instagram", "Tidy Tex reel: before and after", "https://instagram.com/p/abc", "Tidy Tex", "15% off", "Book now"),
      src(5, "web", "Sparkle Co: Our promise", "https://example.com/sparkle/promise", "Sparkle Co", "Re-clean guarantee", "Call us"),
      src(6, "youtube", "How much does a deep clean cost in Austin?", "https://youtube.com/watch?v=xyz", "ATX Home", null, null),
      src(7, "tiktok", "Cleaning hacks with Lone Star Maids", "https://tiktok.com/@lsm/video/1", "Lone Star Maids", null, "Follow"),
    ],
    figures: [
      { source: "meta", label: "Meta ads", currency: "USD", period: "2026-10-01 to 2026-10-31", spend: 3913.89, conversions: 182, revenue: null },
      { source: "upload", label: "Jobber bookings", currency: "USD", period: "2026-10-01 to 2026-10-31", spend: null, conversions: 58, revenue: 11020 },
    ],
  };
}
