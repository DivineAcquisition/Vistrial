/**
 * Which of a site's pages a capture reads after the home page, and what each page is for. Decided in code
 * from what a link says and where it points, so the choice is the same every time and can be tested.
 */
import type { PageSnapshot } from "../pageReader/extract";
import type { PageKind } from "./fields";

/** Pages read after the home page. With it, the page reader's 8-page job. */
export const MORE_PAGES = 7;

/** Booking tools a coach or agency links to. A link there is the booking page, recorded but not read. */
export const BOOKING_HOSTS = /(^|\.)(calendly\.com|cal\.com|leadconnectorhq\.com|msgsndr\.com|acuityscheduling\.com|as\.me|tidycal\.com|savvycal\.com|youcanbook\.me|oncehub\.com|zcal\.co)$/i;
const HUBSPOT_MEETINGS = /^meetings(-[a-z0-9]+)?\.hubspot\.com$/i;

/** The signals for each kind, in link words or the path. Earlier kinds win a tie. */
const KINDS: { kind: Exclude<PageKind, "home" | "other">; words: RegExp; score: number }[] = [
  { kind: "pricing", words: /\b(pricing|prices?|plans?|packages?|rates|investment)\b/i, score: 9 },
  { kind: "booking", words: /\b(book|booking|schedule|appointment|call|consult(ation)?|discovery|strategy[- ]session|apply|application)\b/i, score: 9 },
  { kind: "sales", words: /\b(program(me)?|course|coaching|mastermind|membership|academy|accelerator|bootcamp|enrol+|join|work[- ]with[- ](me|us)|done[- ]for[- ]you|offer)\b/i, score: 8 },
  { kind: "optin", words: /\b(free|guide|download|training|webinar|masterclass|checklist|template|ebook|e-book|quiz|workshop|challenge|lead[- ]magnet)\b/i, score: 7 },
  { kind: "services", words: /\b(services?|solutions?|what[- ]we[- ]do|how[- ]we[- ]help|agency|marketing|ads|seo|funnels?)\b/i, score: 6 },
  { kind: "results", words: /\b(results|testimonials?|reviews?|case[- ]stud(y|ies)|success[- ]stor(y|ies)|clients|portfolio|wins)\b/i, score: 6 },
  { kind: "about", words: /\b(about|story|team|who[- ]we[- ]are|meet)\b/i, score: 3 },
  { kind: "contact", words: /\b(contact|get[- ]in[- ]touch|reach)\b/i, score: 2 },
];

/** Paths that are never worth a page: legal, account, cart, feeds and files. */
const SKIP_PATH = /(privacy|terms|cookie|legal|disclaimer|login|log-in|signin|sign-in|account|cart|checkout|wp-admin|wp-login|feed|sitemap|\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?)$)/i;

export function bareHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "");
}

export function isBookingHost(host: string) {
  return BOOKING_HOSTS.test(host) || HUBSPOT_MEETINGS.test(host);
}

/** What a link or address is for, from its words and path; null when nothing says. */
export function kindOf(text: string, url: URL): { kind: Exclude<PageKind, "home" | "other">; score: number } | null {
  if (isBookingHost(url.hostname)) return { kind: "booking", score: 10 };
  const path = decodeURIComponent(url.pathname).replace(/[/_-]+/g, " ");
  for (const row of KINDS) {
    if (row.words.test(text) || row.words.test(path)) return { kind: row.kind, score: row.score + (row.words.test(text) && row.words.test(path) ? 1 : 0) };
  }
  return null;
}

export type ChosenPage = { url: string; kind: PageKind; text: string; score: number };

/**
 * The pages to read after the home page, most useful first, and the booking pages on other sites (found,
 * not read). Same-site links only; one page per address; legal and account pages are skipped.
 */
export function choosePages(home: PageSnapshot, homeUrl: string, max = MORE_PAGES): { read: ChosenPage[]; booking: ChosenPage[] } {
  const homeAt = new URL(homeUrl);
  const site = bareHost(homeAt.hostname);
  const best = new Map<string, ChosenPage>();
  const booking = new Map<string, ChosenPage>();
  const links = [
    ...home.links,
    // A button that is a link counts as one, with its own words.
    ...home.blocks.flatMap((block) => (block.kind === "cta" && block.href ? [{ text: block.text, href: block.href, sameSite: false, region: block.region }] : [])),
  ];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    const kind = kindOf(link.text, url);
    if (isBookingHost(url.hostname)) {
      if (!booking.has(url.href)) booking.set(url.href, { url: url.href, kind: "booking", text: link.text, score: 10 });
      continue;
    }
    if (bareHost(url.hostname) !== site) continue;
    if (SKIP_PATH.test(url.pathname)) continue;
    const address = url.href.replace(/\/$/, "");
    if (address === homeAt.href.replace(/\/$/, "") || url.pathname === "/" || url.pathname === "") continue;
    if (!kind) continue;
    // Links in the page's main body and its buttons say more than the footer.
    const score = kind.score + (link.region === "main" || link.region === "" ? 1 : 0) - (link.region === "footer" ? 1 : 0);
    const prior = best.get(address);
    if (!prior || prior.score < score) best.set(address, { url: url.href, kind: kind.kind, text: link.text.slice(0, 80), score });
  }
  // One page per kind first, so a site with ten blog-style "services" links still has its pricing and booking read.
  const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const picked: ChosenPage[] = [];
  const kinds = new Set<PageKind>();
  for (const row of ranked) {
    if (picked.length >= max) break;
    if (!kinds.has(row.kind)) {
      picked.push(row);
      kinds.add(row.kind);
    }
  }
  for (const row of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(row)) picked.push(row);
  }
  return { read: picked, booking: [...booking.values()].slice(0, 3) };
}

const PRICE = /([$€£]\s?\d[\d,]*(\.\d{2})?|\d[\d,]*(\.\d{2})?\s?(usd|eur|gbp|dollars))/i;

/**
 * What a page that was read is for, from what is on it, falling back to how it was linked. A booking widget
 * makes it a booking page; a short form asking for an email makes it an opt-in page; prices and a button
 * make it a sales page.
 */
export function purposeOf(snapshot: PageSnapshot, url: string, linked: PageKind): PageKind {
  const blocks = snapshot.blocks;
  if (blocks.some((block) => block.kind === "embed" && block.host && isBookingHost(block.host))) return "booking";
  if (snapshot.links.some((link) => link.region === "main" && isBookingHost(safeHost(link.href))) && linked === "booking") return "booking";
  if (linked !== "sales" && linked !== "pricing" && linked !== "booking") {
    const optin = snapshot.forms.some((form) => form.fields.length > 0 && form.fields.length <= 4 && form.fields.some((field) => field.type === "email" || /e-?mail/i.test(field.label + field.name)));
    if (optin && snapshot.facts.words < 900) return "optin";
  }
  if (linked === "other" || linked === "services" || linked === "landing") {
    const priced = blocks.some((block) => (block.kind === "text" || block.kind === "heading") && PRICE.test(block.text));
    if (priced && snapshot.facts.ctas > 0) return linked === "services" ? "services" : "sales";
  }
  return linked;
}

function safeHost(href: string) {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}

/** The order pages go into a teardown: what sells and books before what informs. */
export const TEARDOWN_ORDER: PageKind[] = ["home", "sales", "landing", "booking", "optin", "pricing", "services", "results", "about", "contact", "other"];

/** The pages a first teardown would read: the home page plus the four most important, at most five. */
export function teardownPick<T extends { kind: PageKind; read: boolean }>(pages: T[], max = 5): T[] {
  return pages
    .filter((page) => page.read)
    .sort((a, b) => TEARDOWN_ORDER.indexOf(a.kind) - TEARDOWN_ORDER.indexOf(b.kind))
    .slice(0, max);
}
