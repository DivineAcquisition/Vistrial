/**
 * @vitest-environment edge-runtime
 *
 * Landing page teardown end to end, with a scripted web and a scripted model: the plan and budget before a
 * run, a full run over the business's own page and two others, what code counts versus what the model reads,
 * a draft that claims a cause and is revised, an invented quote that is dropped, text on a page addressed to
 * an AI, found links that are not public pages, a run where nothing could be read, roles and isolation.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { extractPage } from "./lib/pageReader/extract";
import type { RawResponse, Renderer } from "./lib/pageReader/read";
import { SAMPLE_PAGE_HTML, SAMPLE_PAGE_URL } from "./lib/pageReader/sample";
import type { ScriptedModel } from "./lib/toolRouter";
import type { ScriptedPages } from "./pageReadActions";
import { causalPhrase, runChecks } from "./skills/landingTeardown/checks";
import { numberedPage, orderOf, pageFacts, patternTable, sanitise } from "./skills/landingTeardown/compute";
import { FRAMEWORK, SECTION_KEYS, type SectionKey } from "./skills/landingTeardown/framework";
import { HONEST_LIMIT, readAnalysis, type IndustryRead, type PageAnalysis, type PagesRecord, type TeardownPage } from "./skills/landingTeardown/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
type Globals = { __vistrialScriptedPages?: ScriptedPages; __vistrialScriptedRenderer?: Renderer | null; __vistrialScriptedModel?: ScriptedModel };
const AGENT = "growth-architect";

const OWN = "https://brightside-agency.example.com/";
const RIVAL = "https://rival-growth.example.com/apply";
const BLOCKED = "https://members-only.example.com/offer";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

/** The sample page with some sections taken out. */
const without = (ids: string[]) => ids.reduce((html, id) => html.replace(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`), ""), SAMPLE_PAGE_HTML);
const OWN_HTML = without(["results", "compare", "faq"]).replace("Northlight Growth |", "Brightside Agency |");
const RIVAL_HTML = without(["process"]).replace("Northlight Growth |", "Rival Growth |");

const response = (text: string, extra: Partial<RawResponse> = {}): RawResponse => {
  const body = new TextEncoder().encode(text);
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body, truncated: false, wireBytes: body.byteLength, address: "93.184.216.34", ...extra };
};

function web() {
  const requested: string[] = [];
  (globalThis as Globals).__vistrialScriptedPages = (url) => {
    requested.push(url.href);
    if (url.pathname === "/robots.txt") return response("", { status: 404 });
    if (url.href === OWN) return response(OWN_HTML);
    if (url.href === RIVAL) return response(RIVAL_HTML);
    if (url.href === SAMPLE_PAGE_URL) return response(SAMPLE_PAGE_HTML);
    if (url.href === BLOCKED) return response("", { status: 401 });
    return response("", { status: 404 });
  };
  (globalThis as Globals).__vistrialScriptedRenderer = null;
  return requested;
}

const JOB_BY_HEADING: [RegExp, SectionKey][] = [
  [/Fill your calendar/, "hero"],
  [/What clients got/, "results"],
  [/Sound familiar/, "problem"],
  [/What changes/, "solution"],
  [/Booked Calendar Build/, "offer"],
  [/vs without/, "compare"],
  [/How it works/, "process"],
  [/Questions/, "faq"],
  [/Ready for a full calendar/, "finalCta"],
];

/** What a careful reader would say about each section of the sample page, for a coach comparing agencies. */
const NOTES: Record<string, string> = {
  nav: "One button and no menu, so the only way forward is the call. A coach skimming on a phone has nothing else to tap.",
  hero: "The badge turns away anyone under $10K a month before they read further, and the headline is the outcome a coach wants in their own words.",
  results: "Numbers come first and each quote has a name and a role, which may matter to coaches who have been burned by agencies before.",
  problem: "Each pain is a moment a coach will recognise, with a cost beside it, rather than a general complaint.",
  solution: "Three fixes for three pains, in the same order, so each worry is closed where it was opened.",
  offer: "Every deliverable is a thing, the effort line takes the work off the buyer, and the price is stated instead of hidden behind the call.",
  compare: "Short matched pairs make doing nothing look like a choice with a cost.",
  process: "Four steps with the client's time on most of them. The last step has no time on it.",
  faq: "Price, timing and fit are answered in the buyer's voice. There is no question about a guarantee or what happens if it does not work.",
  finalCta: "It restates the outcome and repeats the scarcity line, but asks for an application where every other button says Book a call.",
};

const HEADLINES: Partial<Record<SectionKey, string>> = {
  nav: "One button, no menu",
  hero: "Names who it is for, then the outcome",
  results: "Three numbered results with named quotes",
  problem: "Three recognisable pains, each with a cost",
  solution: "One fix per pain, in the same order",
  offer: "Deliverables, an effort line and a stated price",
  compare: "Matched rows, with and without",
  process: "Four steps; the last has no time on it",
  faq: "Covers price, timing and fit; no guarantee",
  finalCta: "Restates the outcome but asks for an application",
};

const SHARED: Record<string, { statement: string; why: string }> = {
  nav: { statement: "Both keep the header to a logo and one button that says Book a call.", why: "With nothing else to tap, a visitor from an ad may stay on the one path the page is built for." },
  hero: { statement: "Both open with a qualifier that names coaches and a revenue threshold, above an outcome headline.", why: "A coach under the threshold leaves early, and one above it may read on feeling the page is for them." },
  results: { statement: "Both put numbered results with named quotes straight after the hero, before explaining how.", why: "A coach who has paid an agency before may want proof before a pitch." },
  problem: { statement: "Both name three specific pains, each with a cost.", why: "A recognisable moment may land harder than a general complaint." },
  solution: { statement: "Both answer each pain with one fix, in the same order.", why: "Matching one for one may make the page feel complete." },
  offer: { statement: "Both state the price and list what is delivered in a boxed offer.", why: "A stated price may filter out buyers who cannot afford it before the call." },
};

type Plan = {
  /** The first draft across pages claims a cause; the revision does not. */
  causal?: boolean;
  /** Every draft claims a cause. */
  alwaysCausal?: boolean;
  /** The page reading quotes a line that is not on the page. */
  inventQuote?: boolean;
  /** What the search step returns. */
  found?: string[];
  /** The page reading is in the shape from before verdicts and section headlines existed. */
  oldShape?: boolean;
  /** The page reading's verdict claims a result. */
  causalVerdict?: boolean;
};

/** A scripted model that reads the numbered page it is given and answers like a real one would. */
function script(plan: Plan = {}) {
  const calls: { system: string; input: string }[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    calls.push({ system: typeof params.system === "string" ? params.system : JSON.stringify(params.system ?? ""), input });
    if (input.startsWith("Find up to")) {
      return { text: JSON.stringify({ pages: (plan.found ?? []).map((url) => ({ url, business: "Found Co" })) }), searches: 1, sources: (plan.found ?? []).map((url) => ({ url, title: "Found" })) };
    }
    if (input.startsWith("Read this one landing page")) {
      const lines = [...input.slice(input.lastIndexOf("UNTRUSTED CONTENT")).matchAll(/^\[(\d+)\] (.*)$/gm)].map((match) => ({ index: Number(match[1]), text: match[2] }));
      const starts: { job: SectionKey; from: number }[] = [];
      if (lines[0]?.text.startsWith("header")) starts.push({ job: "nav", from: 0 });
      for (const line of lines) {
        const job = / h[12]: /.test(` ${line.text}`) ? JOB_BY_HEADING.find(([pattern]) => pattern.test(line.text))?.[1] : undefined;
        // The hero starts at the badge above its heading.
        if (job) starts.push({ job, from: job === "hero" ? line.index - 1 : line.index });
      }
      const last = lines[lines.length - 1]?.index ?? 0;
      const sections = starts.map((row, i) => ({ job: row.job, from: row.from, to: i + 1 < starts.length ? starts[i + 1].from - 1 : last, does: row.job === "faq" || row.job === "finalCta" || row.job === "process" ? "partly" : "yes", headline: plan.oldShape ? undefined : HEADLINES[row.job], note: NOTES[row.job] }));
      const has = (text: string) => input.includes(text);
      const analysis: PageAnalysis = {
        goal: "Get a qualified coach to book a call.",
        ...(plan.oldShape ? {} : { verdict: plan.causalVerdict ? "This page is proven and will increase bookings." : has("41 booked calls in 30 days") ? "Qualifies its reader, proves results before explaining how, and states a price. The last button changes what it asks for." : "Qualifies its reader and states a price, but shows no proof and leaves the remaining questions unanswered." }),
        sections: sections as PageAnalysis["sections"],
        qualifier: { quote: "For coaches and consultants doing $10K+ a month", threshold: "$10K+ a month" },
        headline: { quote: "Fill your calendar with sales calls from people who can afford you", statesOutcome: true },
        proof: has("41 booked calls in 30 days") ? { kind: "numbersAndQuotes", named: true, quotes: ["41 booked calls in 30 days", ...(plan.inventQuote ? ["We tripled revenue in one week"] : [])], note: "Three numbered results with named quotes." } : { kind: "none", named: false, quotes: plan.inventQuote ? ["We tripled revenue in one week"] : [], note: "No proof on the page." },
        pains: ["A lead fills in your form at 9pm and hears nothing until Monday.", "You boost a post, get likes, and book nothing.", "Half your calls are with people who cannot afford you."],
        solutions: ["Every lead gets a reply in under 60 seconds, day or night.", "Your ads send people to one page with one job: book the call.", "An application screens out anyone under your minimum before they see your calendar."],
        offer: { deliverables: ["Three ad concepts, written and designed"], effortLine: "You give us access. We build everything else.", price: "$3,500 setup, live in 14 days.", delivery: "" },
        faqTopics: has("How much does it cost?") ? ["price", "howLong", "whoFor"] : [],
        scarcity: "We take on 4 new clients a month.",
      };
      return { text: JSON.stringify(analysis) };
    }
    if (input.startsWith("Write what these pages share") || input.startsWith("Revise the findings")) {
      const revising = input.startsWith("Revise");
      const pages = JSON.parse(input.slice(input.lastIndexOf("UNTRUSTED CONTENT") + "UNTRUSTED CONTENT".length).trim()) as { id: string; whose: string; order: string[] }[];
      const own = pages.find((row) => row.whose.startsWith("the business's own"));
      const others = pages.filter((row) => row !== own);
      const table = [...input.matchAll(/^- [^(]+\((\w+)\): (.*)$/gm)].map((match) => ({ job: match[1] as SectionKey, pages: match[2] === "no page" ? [] : match[2].split(", ") }));
      const shared = table.filter((row) => row.pages.length >= 2);
      const claim = plan.alwaysCausal || (plan.causal && !revising);
      const read: IndustryRead = {
        summary: `The ${others.length} other pages open with a qualifier and show results before explaining how. Yours makes the same promise but shows no results and answers no remaining questions.`,
        patterns: shared.slice(0, 4).map((row, i) => ({
          statement: i === 0 && claim ? `They all have a ${row.job} section, which converts better than pages without one.` : (SHARED[row.job]?.statement ?? `Both have a ${row.job} section.`),
          job: row.job,
          basis: "observed",
          pageIds: row.pages,
          whyItMayWork: SHARED[row.job]?.why ?? "A coach comparing agencies may want this answered before booking.",
        })),
        gaps: own
          ? table.filter((row) => row.pages.length >= 1 && !own.order.includes(FRAMEWORK.find((item) => item.key === row.job)!.name)).map((row) => ({ statement: `Your page has no ${FRAMEWORK.find((item) => item.key === row.job)!.name} section. ${row.pages.length} of the other pages do.`, job: row.job, pageIds: row.pages }))
          : [],
        suggestions: [
          { title: "Add a Results section under the hero", change: "Add three result cards, each leading with a number and a named quote.", why: "Both other pages prove results before explaining how.", basis: "inferred", pageIds: others.map((row) => row.id), howToTell: "Watch booked calls from this page for 30 days against the 30 days before." },
          { title: "Try a shorter application form", change: "Cut the form to name, email and revenue.", why: "Fewer fields may lower the effort to apply.", basis: "hypothesis", pageIds: [], howToTell: "Compare applications started and finished over 30 days." },
        ],
        brief: {
          audience: "Coaches and consultants already selling",
          qualifier: "For coaches and consultants doing $10K+ a month",
          promise: "A calendar of calls with people who can afford you",
          cta: "Book a call",
          sections: [
            { job: "hero", direction: "Qualifier badge, outcome headline, one button." },
            { job: "problem", direction: "Three moments a coach will recognise, each with a cost." },
            { job: "solution", direction: "One fix per pain, same order." },
            { job: "results", direction: "Three cards, number first, only with real proof." },
            { job: "offer", direction: "Box the deliverables, the effort line, the price." },
          ],
          proofNeeded: ["Three client results with a number, a name and a role"],
          avoid: ["Menu links in the header"],
        },
        limits: ["One page could not be read."],
      };
      return { text: JSON.stringify(read) };
    }
    throw new Error(`unscripted call: ${input.slice(0, 60)}`);
  };
  (globalThis as Globals).__vistrialScriptedModel = model;
  return calls;
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await t.run(async (ctx) => {
    for (const workKind of ["write", "classify", "research"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  return { owner, workspaceId };
}

async function finish(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 60 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

const ASK = { industry: "Marketing agencies for coaches", ownUrl: OWN, urls: [RIVAL, SAMPLE_PAGE_URL, BLOCKED], find: false };

async function run(t: Tester, a: { owner: Caller; workspaceId: Id<"workspaces"> }, ask: typeof ASK | (Omit<typeof ASK, "ownUrl"> & { ownUrl?: string }) = ASK) {
  const quote = await a.owner.query(api.landingTeardown.quote, { workspaceId: a.workspaceId, ...ask });
  const started = await a.owner.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, ...ask, confirmedCents: quote.maxCents });
  const status = await finish(t, a.owner, a.workspaceId, started.runId);
  const tab = await a.owner.query(api.landingTeardown.tab, { workspaceId: a.workspaceId });
  return { ...started, status, quote, tab };
}

describe("what code counts on a page", () => {
  const snapshot = extractPage(SAMPLE_PAGE_HTML, SAMPLE_PAGE_URL);

  it("counts buttons, where they lead, header links, form fields and FAQ questions", () => {
    expect(pageFacts(snapshot)).toMatchObject({ ctaCount: 4, ctaTexts: ["Book a call", "Apply for a call"], ctaTargets: 2, weakCtas: [], navLinks: 2, stickyNavHint: true, formFields: 3, hasBookingEmbed: true, hasVideo: false, faqQuestions: 3, mobileViewport: true });
    const weak = extractPage('<a class="btn" href="/a">Learn more</a><button>Submit</button><a class="btn" href="/b">Get my plan</a>', "https://example.com/");
    expect(pageFacts(weak).weakCtas).toEqual(["Learn more", "Submit"]);
  });

  it("numbers the page for the model and cuts a long one", () => {
    const numbered = numberedPage(snapshot);
    expect(numbered.cut).toBe(false);
    expect(numbered.text).toContain("main h1: Fill your calendar with sales calls from people who can afford you");
    expect(numbered.text).toMatch(/\[\d+\] header button: Book a call -> https:\/\/northlight-growth\.example\.com\/book/);
    const long = extractPage(`<body>${"<p>word word word word word word word word word word word word</p>".repeat(550)}</body>`, "https://example.com/");
    const cut = numberedPage(long);
    expect(cut.cut).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(24_000);
  });

  it("keeps only sections that exist and quotes that are on the page", () => {
    const raw = readAnalysis({
      goal: "Book a call",
      sections: [
        { job: "hero", from: 2, to: 6, does: "yes", note: "Clear." },
        { job: "results", from: 5, to: 9, does: "yes", note: "Overlaps the hero, so it is dropped." },
        { job: "faq", from: 9000, to: 9010, does: "yes", note: "Past the end of the page." },
        { job: "made-up-job", from: 10, to: 12, does: "yes", note: "Not a framework job." },
        { job: "offer", from: 10, to: 99999, does: "partly", note: "Runs past the end, so it is cut to the last block." },
      ],
      qualifier: { quote: "for coaches and consultants doing $10k+ a month", threshold: "$10K+" },
      headline: { quote: "Double your revenue in 7 days guaranteed", statesOutcome: true },
      proof: { kind: "quotes", named: true, quotes: ["41 booked calls in 30 days", "Best agency on earth, says everyone"], note: "" },
      pains: ["You boost a post, get likes, and book nothing."],
      solutions: [],
      offer: { deliverables: ["Three ad concepts, written and designed", "A free yacht"], effortLine: "You give us access. We build everything else.", price: "", delivery: "" },
      faqTopics: ["price", "nonsense"],
      scarcity: "",
    })!;
    const cleaned = sanitise(raw, snapshot);
    expect(cleaned.analysis.sections.map((row) => [row.job, row.from, row.to])).toEqual([
      ["hero", 2, 6],
      ["offer", 10, snapshot.blocks.length - 1],
    ]);
    expect(cleaned.analysis.qualifier.quote).toBe("for coaches and consultants doing $10k+ a month");
    expect(cleaned.analysis.headline.quote).toBe("");
    expect(cleaned.analysis.proof.quotes).toEqual(["41 booked calls in 30 days"]);
    expect(cleaned.analysis.offer.deliverables).toEqual(["Three ad concepts, written and designed"]);
    expect(cleaned.analysis.faqTopics).toEqual(["price"]);
    expect(cleaned.droppedQuotes).toBe(3);
    expect(orderOf(cleaned.analysis)).toEqual({ order: ["hero", "offer"], skipped: ["nav", "problem", "solution", "compare", "process", "roles", "faq", "finalCta"] });
  });

  it("refuses an at-a-glance line that claims a result, and keeps a plain one", () => {
    const base = { qualifier: { quote: "", threshold: "" }, headline: { quote: "", statesOutcome: false }, proof: { kind: "none", named: false, quotes: [], note: "" }, pains: [], solutions: [], offer: { deliverables: [], effortLine: "", price: "", delivery: "" }, faqTopics: [], scarcity: "" };
    const raw = readAnalysis({
      ...base,
      goal: "Book a call",
      verdict: "This page is proven and will increase bookings.",
      sections: [
        { job: "hero", from: 2, to: 6, does: "yes", headline: "Names who it is for, then the outcome", note: "This hero converts better than any other." },
        { job: "offer", from: 10, to: 12, does: "partly", headline: "The best-performing offer box in the industry", note: "Boxed, with the price stated." },
      ],
      proof: { kind: "none", named: false, quotes: [], note: "Adding proof will increase bookings." },
    })!;
    const cleaned = sanitise(raw, snapshot);
    expect(cleaned.analysis.verdict).toBe("");
    expect(cleaned.analysis.sections.map((row) => row.headline)).toEqual(["Names who it is for, then the outcome", ""]);
    // The notes and the proof note are screened the same way: a claim of a result goes, a plain reading stays.
    expect(cleaned.analysis.sections.map((row) => row.note)).toEqual(["", "Boxed, with the price stated."]);
    expect(cleaned.analysis.proof.note).toBe("");
    expect(cleaned.analysis.goal).toBe("Book a call");
    expect(cleaned.droppedLines).toBe(4);

    const plain = sanitise(readAnalysis({ ...base, goal: "Book a call", verdict: "Qualifies its reader and states a price, but shows no proof.", sections: [] })!, snapshot);
    expect(plain.analysis.verdict).toBe("Qualifies its reader and states a price, but shows no proof.");
    expect(plain.droppedLines).toBe(0);
  });

  it("reads a page saved before verdicts and section headlines existed", () => {
    const old = readAnalysis({ goal: "Book a call", sections: [{ job: "hero", from: 2, to: 6, does: "yes", note: "Clear." }], qualifier: {}, headline: {}, proof: {}, pains: [], solutions: [], offer: {}, faqTopics: [], scarcity: "" })!;
    expect(old.verdict).toBe("");
    expect(old.sections[0].headline).toBe("");
    const cleaned = sanitise(old, snapshot);
    expect(cleaned.droppedLines).toBe(0);
    expect(cleaned.analysis.sections).toHaveLength(1);
  });

  it("caps the at-a-glance lines", () => {
    const long = readAnalysis({ goal: "", verdict: "word ".repeat(200), sections: [{ job: "hero", from: 0, to: 1, does: "yes", headline: "word ".repeat(60), note: "" }] })!;
    expect(long.verdict!.length).toBeLessThanOrEqual(280);
    expect(long.sections[0].headline!.length).toBeLessThanOrEqual(90);
  });

  it("counts shared sections across the other pages only", () => {
    const page = (id: string, own: boolean, order: SectionKey[]) => ({ id, own, order, analysis: {} as PageAnalysis });
    const table = patternTable([page("p1", true, ["hero", "roles"]), page("p2", false, ["hero", "results"]), page("p3", false, ["hero"]), { ...page("p4", false, ["roles"]), analysis: null }]);
    expect(table.find((row) => row.job === "hero")).toEqual({ job: "hero", pages: ["p2", "p3"], share: 1 });
    expect(table.find((row) => row.job === "results")).toEqual({ job: "results", pages: ["p2"], share: 0.5 });
    expect(table.find((row) => row.job === "roles")).toEqual({ job: "roles", pages: [], share: 0 });
    expect(table.map((row) => row.job)).toEqual([...SECTION_KEYS]);
  });
});

describe("the completion checks", () => {
  const page = (id: string, own: boolean, order: SectionKey[]): TeardownPage => ({ id, own, order, skipped: [], analysis: {} as PageAnalysis, readId: id, sourceRefId: id, url: "", finalUrl: "", host: "", title: "", origin: "supplied", driver: "fetch", status: "read", facts: {} as TeardownPage["facts"], droppedQuotes: 0 });
  const record: PagesRecord = { industry: "Agencies", pages: [page("p1", true, ["hero"]), page("p2", false, ["hero", "results"]), page("p3", false, ["hero", "results"])], unread: [], table: [], ownId: "p1" };
  const good: IndustryRead = {
    summary: "Both other pages prove results before explaining how.",
    patterns: [{ statement: "Both lead with results cards.", job: "results", basis: "observed", pageIds: ["p2", "p3"], whyItMayWork: "A buyer may want proof first." }],
    gaps: [{ statement: "Your page has no Results section.", job: "results", pageIds: ["p2", "p3"] }],
    suggestions: [{ title: "Add results", change: "Add three result cards.", why: "The others do.", basis: "inferred", pageIds: ["p2", "p3"], howToTell: "Watch booked calls for 30 days." }],
    brief: { audience: "Coaches", qualifier: "", promise: "A full calendar", cta: "Book a call", sections: [{ job: "hero", direction: "x" }, { job: "results", direction: "x" }, { job: "offer", direction: "x" }], proofNeeded: [], avoid: [] },
    limits: [],
  };
  const failed = (read: IndustryRead, pages = record) => runChecks(read, pages).results.filter((row) => !row.passed).map((row) => row.key);

  it("passes findings that point at pages which carry them", () => {
    expect(runChecks(good, record).passed).toBe(true);
    expect(runChecks(null, record).passed).toBe(false);
  });

  it("refuses a page that was not read, a pattern on one page, and a pattern its pages do not have", () => {
    expect(failed({ ...good, patterns: [{ ...good.patterns[0], pageIds: ["p2", "p9"] }] })).toEqual(["pages_cited", "patterns_shared"]);
    expect(failed({ ...good, patterns: [{ ...good.patterns[0], pageIds: ["p2"] }] })).toEqual(["patterns_shared"]);
    // The business's own page does not count toward "shared".
    expect(failed({ ...good, patterns: [{ ...good.patterns[0], job: "hero", pageIds: ["p1", "p2"] }] })).toEqual(["patterns_shared"]);
    expect(failed({ ...good, patterns: [{ ...good.patterns[0], job: "faq" }] })).toEqual(["patterns_true"]);
    expect(failed({ ...good, gaps: [{ statement: "No hero.", job: "hero", pageIds: ["p2"] }] })).toEqual(["gaps_true"]);
    expect(failed({ ...good, suggestions: [{ ...good.suggestions[0], pageIds: [] }] })).toEqual(["pages_cited"]);
    expect(failed({ ...good, suggestions: [{ ...good.suggestions[0], howToTell: "" }] })).toEqual(["suggestions_testable"]);
    const one = { ...record, pages: record.pages.slice(0, 2) };
    expect(failed(good, one)).toContain("patterns_shared");
    expect(failed({ ...good, patterns: [], gaps: [], suggestions: [{ ...good.suggestions[0], pageIds: ["p2"] }] }, one)).toEqual([]);
  });

  it("refuses any line that claims to know why a page converts", () => {
    for (const text of [
      "This layout converts better.",
      "A proven structure for agencies.",
      "Adding a guarantee will increase bookings.",
      "The highest-converting pages lead with proof.",
      "A sticky header boosts conversions.",
      "This is why the page works.",
      "Results cards give a 30% lift in sign-ups, 30% more than without.",
      "It is the best-performing hero.",
    ]) {
      expect(causalPhrase(text), text).not.toBeNull();
      expect(failed({ ...good, summary: text }), text).toEqual(["no_causal_claims"]);
    }
    for (const text of ["Both pages lead with results cards.", "It may reassure a buyer who has been burned before.", "Watch booked calls for 30 days to see whether it helped.", "The page offers a 14-day delivery guarantee."]) {
      expect(causalPhrase(text), text).toBeNull();
    }
  });
});

describe("landing page teardown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    for (const key of ["__vistrialScriptedPages", "__vistrialScriptedRenderer", "__vistrialScriptedModel"] as const) delete (globalThis as Globals)[key];
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("shows the plan and the budget before anything runs", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const requested = web();
    const quote = await a.owner.query(api.landingTeardown.quote, { workspaceId: a.workspaceId, industry: "  Marketing agencies for coaches ", ownUrl: "brightside-agency.example.com", urls: [RIVAL, "http://localhost/admin"], find: true });
    expect(quote.pages).toEqual([
      { url: OWN, own: true, ok: true, reason: null },
      { url: RIVAL, own: false, ok: true, reason: null },
      { url: "http://localhost/admin", own: false, ok: false, reason: "This address is not on the public internet, so it is not read." },
    ]);
    // The run's cap is 300 cents of cost, which is $9.00 of credit at the 3x markup. Reading is a cent of it.
    expect(quote).toMatchObject({ industry: "Marketing agencies for coaches", found: 4, maxPages: 6, maxCents: 900, readingCents: 2, driver: "fetch", screenshots: false, ready: false, canStart: true, honest: HONEST_LIMIT });
    expect(quote.steps[0]).toBe("Search the web for up to 4 landing pages that businesses in Marketing agencies for coaches run");
    expect(quote.steps[1]).toContain("no screenshots");
    expect(requested).toEqual([]);

    const ready = await a.owner.query(api.landingTeardown.quote, { workspaceId: a.workspaceId, ...ASK });
    expect(ready).toMatchObject({ ready: true, found: 0, maxPages: 4 });
    expect(await message(a.owner.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, ...ASK, confirmedCents: 100 }))).toBe("The budget changed. Check the new one and confirm again.");
    expect(await message(a.owner.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, ...ASK, industry: " ", confirmedCents: 900 }))).toBe("Say which industry these pages are in.");
    expect(await message(a.owner.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, ...ASK, urls: ["http://10.0.0.1/"], confirmedCents: 900 }))).toBe("http://10.0.0.1/: This address is not on the public internet, so it is not read.");
    expect(await message(a.owner.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, industry: "Agencies", urls: [], find: false, confirmedCents: 900 }))).toBe("Add a page to read, or ask Vistrial to find pages competitors run.");
    expect(await t.run((ctx) => ctx.db.query("agentRuns").collect())).toEqual([]);
  });

  it("reads each page against the framework and reports what the others share and what yours lacks", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const requested = web();
    const calls = script();
    const done = await run(t, a);
    expect(done.status).toBe("completed");
    expect(done.tab.results).toMatchObject([{ status: "draft", industry: "Marketing agencies for coaches", pages: 3, unread: 1, suggestions: 2 }]);
    const assetId = done.tab.results[0].id;

    // One page a step, robots first, and the page behind a login was asked for once and left alone.
    expect(requested.filter((url) => !url.endsWith("/robots.txt"))).toEqual([OWN, RIVAL, SAMPLE_PAGE_URL, BLOCKED]);
    const steps = (await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId: done.runId })).steps;
    expect(steps.map((row) => `${row.toolSlug ?? row.kind}:${row.resultCode}`)).toEqual([
      "lp.context:ok",
      "page.read:read",
      "page.read:read",
      "page.read:read",
      "page.read:blocked",
      "page.read:done",
      "model:ok",
      "model:ok",
      "model:ok",
      "lp.apply:ok",
      "model:ok",
      "lp.check:passed",
      "lp.save:ok",
    ]);

    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId });
    expect(view.pages.map((row) => [row.id, row.host, row.own, row.order.length, row.skipped])).toEqual([
      ["p1", "brightside-agency.example.com", true, 7, ["compare", "roles", "faq"]],
      ["p2", "rival-growth.example.com", false, 9, ["process", "roles"]],
      ["p3", "northlight-growth.example.com", false, 10, ["roles"]],
    ]);
    expect(view.pages[0].order).toEqual(["nav", "hero", "problem", "solution", "offer", "process", "finalCta"]);
    expect(view.pages[1].facts).toMatchObject({ ctaCount: 4, ctaTargets: 2, navLinks: 2 });
    expect(view.unread).toEqual([{ url: BLOCKED, own: false, reasonCode: "login_required", reason: "This page asks for a login. Vistrial does not log in to read pages." }]);
    // Counted in code: both other pages have Results, FAQ and With vs without; one has a process timeline; none has roles.
    const share = Object.fromEntries(view.table.map((row) => [row.job, `${row.pages.length}/${row.of}`]));
    expect(share).toMatchObject({ results: "2/2", faq: "2/2", compare: "2/2", process: "1/2", roles: "0/2" });
    expect(view.patterns.every((row) => row.basisLabel === "Observed" && row.pageIds.length === 2)).toBe(true);
    expect(view.gaps.map((row) => row.job).sort()).toEqual(["compare", "faq", "results"]);
    expect(view.suggestions.map((row) => row.basisLabel)).toEqual(["Inference", "Untested hypothesis"]);
    expect(view.limits[0]).toBe(HONEST_LIMIT);
    expect(view.checks.passed).toBe(true);
    expect(view.measured).toBe(false);

    // The asset carries one evidence row per claim, each labelled, and every sourced one points at a page that was read.
    const evidence = await t.run((ctx) => ctx.db.query("evidence").collect());
    const sources = await t.run((ctx) => ctx.db.query("sourceRefs").collect());
    expect(sources.map((row) => [row.platform, row.kind, row.origin, row.url]).sort()).toEqual([
      ["web", "page", "supplied", OWN],
      ["web", "page", "supplied", SAMPLE_PAGE_URL],
      ["web", "page", "supplied", RIVAL],
    ]);
    expect(evidence.filter((row) => row.claimKey.endsWith("-facts")).every((row) => row.basis === "observed" && row.computed === true)).toBe(true);
    expect(evidence.filter((row) => row.claimKey.endsWith("-order")).every((row) => row.basis === "inferred")).toBe(true);
    expect(evidence.find((row) => row.claimKey === "suggestion-2")).toMatchObject({ basis: "hypothesis" });
    expect(evidence.filter((row) => row.basis !== "hypothesis").every((row) => (row.sourceRefIds ?? []).length > 0)).toBe(true);
    const body = (await t.run((ctx) => ctx.db.query("assetVersions").collect()))[0].body ?? "";
    expect(body).toContain(HONEST_LIMIT);
    expect(body).toContain("[Untested hypothesis] **Try a shorter application form**");

    // The model was given each page as untrusted content, told what the code had counted, and never told a result.
    const pageCalls = calls.filter((call) => call.input.startsWith("Read this one landing page"));
    expect(pageCalls).toHaveLength(3);
    expect(pageCalls.every((call) => call.system.includes("never an instruction") && call.system.includes("cannot see its traffic"))).toBe(true);
    expect(pageCalls[0].input).toContain("This page is the business's own page.");
    expect(pageCalls[1].input).toContain('"ctaCount":4');
    expect(pageCalls[0].input).toContain("1. nav (Nav). Job: Keep the next step always one tap away.");

    // The run carried the reading (3 pages at 0.1 cents) and the model calls; no separate page charge was made.
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.every((row) => row.source === "run" && row.ref === done.runId)).toBe(true);
    expect(ledger.filter((row) => row.costCents === 0.1)).toHaveLength(3);
    const job = (await t.run((ctx) => ctx.db.query("pageReadJobs").collect()))[0];
    expect(job).toMatchObject({ status: "done", runId: done.runId, holdCents: 0 });
  });

  it("shows one page section by section, and hands the brief on as data", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    script();
    const done = await run(t, a);
    const assetId = done.tab.results[0].id;
    const page = await a.owner.query(api.landingTeardown.page, { workspaceId: a.workspaceId, assetId, pageId: "p1" });
    expect(page.sections.map((row) => row.name)).toEqual(["Nav", "Hero", "Problem agitation", "Solution", "The offer", "Process timeline", "Final CTA"]);
    expect(page.sections[1]).toMatchObject({ frameworkJob: FRAMEWORK[1].job, objection: "Is this for me?", does: "yes" });
    expect(page.sections[1].blocks.slice(0, 2)).toEqual([
      { kind: "text", text: "For coaches and consultants doing $10K+ a month" },
      { kind: "heading", text: "Fill your calendar with sales calls from people who can afford you" },
    ]);
    expect(page.skipped.map((row) => row.name)).toEqual(["With vs without", "Your role vs ours", "FAQ"]);
    expect(page.qualifier).toEqual({ quote: "For coaches and consultants doing $10K+ a month", threshold: "$10K+ a month" });
    expect(page.pains).toHaveLength(3);
    expect(page.solutions).toHaveLength(3);
    expect(page.verdict).toBe("Qualifies its reader and states a price, but shows no proof and leaves the remaining questions unanswered.");
    expect(page.sections[1]).toMatchObject({ job: "hero", headline: "Names who it is for, then the outcome" });
    expect(page.faq.filter((row) => row.covered)).toEqual([]);
    expect(page.screenshots).toEqual({ desktop: null, phone: null });
    expect(await message(a.owner.query(api.landingTeardown.page, { workspaceId: a.workspaceId, assetId, pageId: "p9" }))).toBe(NOT_FOUND);

    const brief = await a.owner.query(api.landingTeardown.brief, { workspaceId: a.workspaceId, assetId });
    expect(brief).toMatchObject({ kind: "landingPageBrief", version: 1, approved: false, industry: "Marketing agencies for coaches", cta: "Book a call", framework: "docs/rebuild/landing-page-framework.md", limits: [HONEST_LIMIT] });
    expect(brief?.sections[0]).toEqual({ key: "hero", name: "Hero", job: FRAMEWORK[1].job, direction: "Qualifier badge, outcome headline, one button." });
    expect(brief?.basedOn.map((row) => row.url)).toEqual([RIVAL, SAMPLE_PAGE_URL]);
    // The development stories draw this same data. Regenerate with VISTRIAL_WRITE_FIXTURE=1.
    if (process.env.VISTRIAL_WRITE_FIXTURE) {
      const { writeFileSync } = await import("node:fs");
      const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId });
      const pages = [];
      for (const row of view.pages) pages.push(await a.owner.query(api.landingTeardown.page, { workspaceId: a.workspaceId, assetId, pageId: row.id }));
      const quote = await a.owner.query(api.landingTeardown.quote, { workspaceId: a.workspaceId, ...ASK, find: true });
      writeFileSync("src/app/dev/pages-tab/fixture.json", `${JSON.stringify({ tab: done.tab, view, pages, quote, brief }, null, 1)}\n`);
    }
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId });
    expect((await a.owner.query(api.landingTeardown.brief, { workspaceId: a.workspaceId, assetId }))?.approved).toBe(true);
    // The hand-off is data only: asking for the brief started nothing.
    expect((await t.run((ctx) => ctx.db.query("agentRuns").collect())).map((row) => row.skillSlug)).toEqual(["landing-page-teardown"]);
  });

  it("feeds a suggestion into We'll try this, with today's figures and a check-in", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    script();
    const done = await run(t, a);
    const assetId = done.tab.results[0].id;
    const decisionId = await a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 30 });
    const rows = await a.owner.query(api.decisions.forAsset, { workspaceId: a.workspaceId, assetId });
    expect(rows).toMatchObject([{ id: decisionId, itemKind: "pageChange", opportunity: "Add a Results section under the hero", proposedAction: "Add three result cards, each leading with a number and a named quote.", validationMethod: "Watch booked calls from this page for 30 days against the 30 days before.", outcome: null }]);
    expect(await message(a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 7, checkInDays: 30 }))).toBe(NOT_FOUND);
  });

  it("revises a draft that claims a cause, and holds back one that still does", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    const calls = script({ causal: true });
    const done = await run(t, a);
    expect(done.tab.results[0].status).toBe("draft");
    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId: done.tab.results[0].id });
    expect(view.versions).toBe(2);
    expect(JSON.stringify(view.patterns)).not.toContain("converts better");
    const revise = calls.find((call) => call.input.startsWith("Revise the findings"));
    expect(revise?.input).toContain("Nothing claims to know why a page converts");
    expect(revise?.input).toContain('"converts better"');
    const versions = await t.run((ctx) => ctx.db.query("assetVersions").collect());
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    expect(versions[0].body).toContain("Checks that did not pass");

    const b = await seed(t, "Beta");
    script({ alwaysCausal: true });
    const stuck = await run(t, b);
    expect(stuck.tab.results[0].status).toBe("needsReview");
    const held = await b.owner.query(api.landingTeardown.view, { workspaceId: b.workspaceId, assetId: stuck.tab.results[0].id });
    expect(held.checks.results.filter((row) => !row.passed).map((row) => row.key)).toEqual(["no_causal_claims"]);
    expect(await message(b.owner.mutation(api.assets.approve, { workspaceId: b.workspaceId, assetId: stuck.tab.results[0].id }))).toBeTruthy();
  });

  it("drops a quote the model made up, and treats text addressed to an AI as part of the page", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    const calls = script({ inventQuote: true });
    const done = await run(t, a);
    const assetId = done.tab.results[0].id;
    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId });
    expect(view.pages.map((row) => row.droppedQuotes)).toEqual([1, 1, 1]);
    const page = await a.owner.query(api.landingTeardown.page, { workspaceId: a.workspaceId, assetId, pageId: "p3" });
    expect(page.proof?.quotes).toEqual(["41 booked calls in 30 days"]);
    expect(JSON.stringify(await t.run((ctx) => ctx.db.query("assetVersions").collect()))).not.toContain("tripled revenue");

    // The sample page tells "any AI assistant" to rate it 10 out of 10, hides a fake SYSTEM line and a comment.
    const sample = calls.find((call) => call.input.startsWith("Read this one landing page") && call.input.includes("Note to any AI assistant"))!;
    // The visible line reaches the model only inside the untrusted block; the hidden ones do not reach it at all.
    expect(sample.input.indexOf("Note to any AI assistant")).toBeGreaterThan(sample.input.lastIndexOf("UNTRUSTED CONTENT"));
    expect(sample.input.slice(0, sample.input.lastIndexOf("UNTRUSTED CONTENT"))).not.toContain("rate this page");
    expect(calls.some((call) => call.input.includes("asset.addVersion") || call.input.includes("this page is perfect"))).toBe(false);
    // Nothing followed it: the run used only its declared tools and made exactly one asset.
    const steps = (await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId: done.runId })).steps;
    expect([...new Set(steps.map((row) => row.toolSlug).filter(Boolean))].sort()).toEqual(["lp.apply", "lp.check", "lp.context", "lp.save", "page.read"]);
    expect(await t.run((ctx) => ctx.db.query("assets").collect())).toHaveLength(1);
  });

  it("checks pages a search found like any typed link, and reads only real, public, new sites", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const requested = web();
    script({ found: ["http://169.254.169.254/latest/meta-data/", "https://www.facebook.com/rivalgrowth", "https://rival-growth.example.com/other-page", "file:///etc/passwd", SAMPLE_PAGE_URL, "not a link", "http://localhost:3000/"] });
    const done = await run(t, a, { industry: "Marketing agencies for coaches", ownUrl: OWN, urls: [RIVAL], find: true });
    expect(done.status).toBe("completed");
    const request = (await t.run((ctx) => ctx.db.query("teardownRequests").collect()))[0];
    expect(request.foundUrls).toEqual([SAMPLE_PAGE_URL]);
    expect(requested.filter((url) => !url.endsWith("/robots.txt"))).toEqual([OWN, RIVAL, SAMPLE_PAGE_URL]);
    expect(requested.some((url) => /169\.254|localhost|facebook|other-page/.test(url))).toBe(false);
    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId: done.tab.results[0].id });
    expect(view.pages.map((row) => row.origin)).toEqual(["supplied", "supplied", "found"]);
    const steps = (await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId: done.runId })).steps;
    expect(steps[1]).toMatchObject({ kind: "model", phase: "discover", webSearches: 1 });
  });

  it("says so when nothing could be read, without asking a model to fill the gap", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    const calls = script();
    const done = await run(t, a, { industry: "Agencies", urls: [BLOCKED, "https://gone.example.com/"], find: false });
    expect(done.status).toBe("completed");
    expect(calls).toEqual([]);
    expect(done.tab.results).toMatchObject([{ status: "needsReview", pages: 0, unread: 2 }]);
    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId: done.tab.results[0].id });
    expect(view.unread.map((row) => row.reasonCode)).toEqual(["login_required", "not_found"]);
    expect(view.limits[1]).toMatch(/^Not enough data: none of the pages could be read/);
    expect(view.patterns).toEqual([]);
    const evidence = await t.run((ctx) => ctx.db.query("evidence").collect());
    expect(evidence.map((row) => [row.claimKey, row.basis])).toEqual([["patterns-insufficient", "insufficient"]]);
  });

  it("reports no shared pattern from a single other page", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    script();
    const done = await run(t, a, { industry: "Agencies", ownUrl: OWN, urls: [RIVAL], find: false });
    const view = await a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId: done.tab.results[0].id });
    expect(view.patterns).toEqual([]);
    expect(view.gaps.length).toBeGreaterThan(0);
    expect(done.quote.steps[2]).toBe("Too few other pages for shared patterns: each page is still read against the framework");
  });

  it("lets Owners and Admins start and Viewers read, and never crosses workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    web();
    script();
    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "viewer@example.com", role: "viewer" });
    const viewer = t.withIdentity({ ...person("viewer"), email: "viewer@example.com" });
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await message(viewer.mutation(api.landingTeardown.start, { workspaceId: a.workspaceId, ...ASK, confirmedCents: 900 }))).toBe(NOT_ALLOWED);
    expect((await viewer.query(api.landingTeardown.quote, { workspaceId: a.workspaceId, ...ASK })).canStart).toBe(false);

    const done = await run(t, a);
    const assetId = done.tab.results[0].id;
    expect((await viewer.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId })).pages).toHaveLength(3);
    expect((await viewer.query(api.landingTeardown.page, { workspaceId: a.workspaceId, assetId, pageId: "p2" })).sections.length).toBeGreaterThan(0);
    expect(await message(viewer.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 30 }))).toBe(NOT_ALLOWED);

    for (const workspaceId of [b.workspaceId, a.workspaceId]) {
      expect(await message(b.owner.query(api.landingTeardown.view, { workspaceId, assetId }))).toBe(NOT_FOUND);
      expect(await message(b.owner.query(api.landingTeardown.page, { workspaceId, assetId, pageId: "p1" }))).toBe(NOT_FOUND);
      expect(await message(b.owner.query(api.landingTeardown.brief, { workspaceId, assetId }))).toBe(NOT_FOUND);
    }
    expect((await b.owner.query(api.landingTeardown.tab, { workspaceId: b.workspaceId })).results).toEqual([]);
    // A view of some other kind of asset is refused too.
    const other = await t.run((ctx) => ctx.db.insert("assets", { workspaceId: a.workspaceId, kind: "marketReport", title: "x", status: "draft", currentVersion: 1, createdAt: 1 }));
    expect(await message(a.owner.query(api.landingTeardown.view, { workspaceId: a.workspaceId, assetId: other }))).toBe(NOT_FOUND);
  });
});
