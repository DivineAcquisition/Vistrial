/**
 * Everything about a page that can be counted is counted here, in code: buttons and their wording, where
 * they lead, links in the header, form fields, FAQ questions. The model is given these numbers and never
 * asked to count. This file also turns a model's reading of a page into something safe to keep: section
 * ranges that exist, and quotes that are really on the page.
 */
import { snapshotText, type PageBlock, type PageSnapshot } from "../../lib/pageReader/extract";
import { FRAMEWORK, SECTION_KEYS, WEAK_CTA, type SectionKey } from "./framework";
import { MAX_PAGE_CHARS, type PageAnalysis, type PageFacts, type PatternRow, type TeardownPage } from "./shapes";

const BOOKING_HOSTS = /(calendly\.com|cal\.com|savvycal\.com|acuityscheduling\.com|oncehub\.com|hubspot\.com|tidycal\.com|msgsndr\.com|leadconnectorhq\.com|youcanbook\.me)$/i;
const VIDEO_HOSTS = /(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|wistia\.(com|net)|loom\.com|vidyard\.com|vturb\.com|converteai\.net)$/i;

export function pageFacts(snapshot: PageSnapshot): PageFacts {
  const ctas = snapshot.blocks.filter((block): block is Extract<PageBlock, { kind: "cta" }> => block.kind === "cta");
  const texts = [...new Set(ctas.map((row) => row.text))];
  const targets = new Set(ctas.map((row) => (row.href ? row.href.replace(/[#?].*$/, "").replace(/\/$/, "") : row.form !== null ? `form:${row.form}` : "button")));
  const embeds = snapshot.blocks.filter((block): block is Extract<PageBlock, { kind: "embed" }> => block.kind === "embed");
  return {
    words: snapshot.facts.words,
    ctaCount: ctas.length,
    ctaTexts: texts.slice(0, 12),
    ctaTargets: targets.size,
    weakCtas: texts.filter((row) => WEAK_CTA.test(row.trim())),
    navLinks: snapshot.facts.navLinks,
    stickyNavHint: snapshot.facts.stickyNavHint,
    formFields: snapshot.forms.reduce((sum, form) => sum + form.fields.length, 0),
    hasVideo: embeds.some((row) => row.what === "video" || (row.host !== null && VIDEO_HOSTS.test(row.host))),
    hasBookingEmbed: embeds.some((row) => row.host !== null && BOOKING_HOSTS.test(row.host)),
    faqQuestions: snapshot.blocks.filter((block) => block.kind === "text" && (block.tag === "summary" || block.tag === "dt")).length,
    mobileViewport: snapshot.facts.mobileViewport,
  };
}

function line(block: PageBlock, forms: PageSnapshot["forms"]): string {
  const where = block.region ? `${block.region} ` : "";
  if (block.kind === "heading") return `${where}h${block.level}: ${block.text}`;
  if (block.kind === "text") return `${where}${block.tag === "div" ? "text" : block.tag}: ${block.text}`;
  if (block.kind === "cta") return `${where}button: ${block.text}${block.href ? ` -> ${block.href.slice(0, 120)}` : block.form !== null ? " (submits the form)" : ""}`;
  if (block.kind === "image") return `${where}image: ${block.alt === null ? "(no alt text)" : block.alt || "(decorative)"}`;
  if (block.kind === "form") {
    const form = forms[block.form];
    return `${where}form: ${form ? form.fields.map((field) => `${field.label || field.type}${field.required ? "*" : ""}`).join(", ") || "no fields" : "no fields"}`;
  }
  return `${where}${block.what}${block.host ? ` from ${block.host}` : ""}`;
}

/**
 * The page as numbered lines for the model, one per block, so a section is named by the numbers it spans.
 * Cut at a length; `shown` is how many blocks made it in.
 */
export function numberedPage(snapshot: PageSnapshot): { text: string; shown: number; cut: boolean } {
  const lines: string[] = [];
  let size = 0;
  for (const [index, block] of snapshot.blocks.entries()) {
    const text = `[${index}] ${line(block, snapshot.forms)}`;
    if (size + text.length > MAX_PAGE_CHARS) return { text: lines.join("\n"), shown: index, cut: true };
    lines.push(text);
    size += text.length + 1;
  }
  return { text: lines.join("\n"), shown: snapshot.blocks.length, cut: false };
}

const flat = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^\p{L}\p{N}$%+]+/gu, " ")
    .trim();

/** Whether these words are on the page, ignoring case, quote marks and punctuation. An empty quote is "not given". */
export function onPage(quote: string, pageText: string): boolean {
  const wanted = flat(quote);
  return wanted.length > 0 && pageText.includes(wanted);
}

export function flatPage(snapshot: PageSnapshot) {
  return flat(snapshotText(snapshot));
}

/**
 * A model's reading of a page with everything unverifiable removed: sections outside the page or out of
 * order are dropped, and any quote that is not on the page is blanked. Returns how many quotes went.
 */
export function sanitise(analysis: PageAnalysis, snapshot: PageSnapshot): { analysis: PageAnalysis; droppedQuotes: number } {
  const pageText = flatPage(snapshot);
  let dropped = 0;
  const keep = (quote: string) => {
    if (!quote) return "";
    if (onPage(quote, pageText)) return quote;
    dropped += 1;
    return "";
  };
  const keepAll = (quotes: string[]) => quotes.map(keep).filter(Boolean);
  const last = snapshot.blocks.length - 1;
  let floor = 0;
  const sections = [...analysis.sections]
    .sort((a, b) => a.from - b.from)
    .flatMap((section) => {
      if (section.from < floor || section.from > last || section.to < section.from) return [];
      const to = Math.min(section.to, last);
      floor = to + 1;
      return [{ ...section, to }];
    });
  const cleaned: PageAnalysis = {
      ...analysis,
      sections,
      qualifier: { quote: keep(analysis.qualifier.quote), threshold: analysis.qualifier.quote && onPage(analysis.qualifier.quote, pageText) ? analysis.qualifier.threshold : "" },
      headline: { quote: keep(analysis.headline.quote), statesOutcome: analysis.headline.statesOutcome },
      proof: { ...analysis.proof, quotes: keepAll(analysis.proof.quotes) },
      pains: keepAll(analysis.pains),
      solutions: keepAll(analysis.solutions),
      offer: { deliverables: keepAll(analysis.offer.deliverables), effortLine: keep(analysis.offer.effortLine), price: keep(analysis.offer.price), delivery: keep(analysis.offer.delivery) },
      scarcity: keep(analysis.scarcity),
  };
  return { analysis: cleaned, droppedQuotes: dropped };
}

/** The framework jobs a page does, in the order they first appear, and the expected ones it has no section for. */
export function orderOf(analysis: PageAnalysis | null): { order: SectionKey[]; skipped: SectionKey[] } {
  const order: SectionKey[] = [];
  for (const section of analysis?.sections ?? []) {
    if (section.job !== "other" && section.does !== "no" && !order.includes(section.job)) order.push(section.job);
  }
  return { order, skipped: FRAMEWORK.filter((row) => row.expected && !order.includes(row.key)).map((row) => row.key) };
}

/** For each framework job, which of the other businesses' pages have a section for it. The business's own page is left out. */
export function patternTable(pages: Pick<TeardownPage, "id" | "own" | "order" | "analysis">[]): PatternRow[] {
  const others = pages.filter((page) => !page.own && page.analysis);
  return SECTION_KEYS.map((job) => {
    const having = others.filter((page) => page.order.includes(job)).map((page) => page.id);
    return { job, pages: having, share: others.length ? having.length / others.length : 0 };
  });
}
