import type { Basis } from "../../lib/researchShapes";
import type { PageSnapshot } from "../../lib/pageReader/extract";
import { FAQ_TOPICS, SECTION_KEYS, isSectionKey, type FaqTopic, type SectionKey } from "./framework";

export const SKILL_SLUG = "landing-page-teardown";

export const PHASE = {
  context: "context",
  discover: "discover",
  read: "read",
  apply: "apply",
  industry: "industry",
  check: "check",
  revise: "revise",
  recheck: "recheck",
  save: "save",
} as const;

/** The phase of the model step that reads page number `index` (0-based). */
export const analysePhase = (index: number) => `analyse:${index}`;

/** Pages in one teardown: the business's own page plus up to five others. */
export const MAX_PAGES = 6;
/** Pages the agent may add by searching, when asked to find what competitors run. */
export const MAX_FOUND = 4;
export const MAX_SEARCHES = 3;
/** How much of one page the model is shown. Landing pages are short; the rest is cut and said so. */
export const MAX_PAGE_CHARS = 24_000;
export const MAX_INDUSTRY = 80;
export const MAX_NOTE = 600;

/** The standing limit on every teardown, written in code so it is always there, in these words. */
export const HONEST_LIMIT = "Vistrial reads the page, not its results. A pattern several running pages share is something they do, not proof of why they convert. Only your own results can show what works for you.";

const str = { type: "string" } as const;
const strs = { type: "array", items: str } as const;
const bool = { type: "boolean" } as const;
const int = { type: "integer" } as const;

/** What the model returns for one page. Every `quote` must be words that are on the page. */
export const PAGE_SCHEMA = {
  type: "object",
  properties: {
    goal: str,
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { job: { type: "string", enum: [...SECTION_KEYS, "other"] }, from: int, to: int, does: { type: "string", enum: ["yes", "partly", "no"] }, note: str },
        required: ["job", "from", "to", "does", "note"],
        additionalProperties: false,
      },
    },
    qualifier: { type: "object", properties: { quote: str, threshold: str }, required: ["quote", "threshold"], additionalProperties: false },
    headline: { type: "object", properties: { quote: str, statesOutcome: bool }, required: ["quote", "statesOutcome"], additionalProperties: false },
    proof: {
      type: "object",
      properties: { kind: { type: "string", enum: ["numbersAndQuotes", "numbers", "quotes", "logos", "none"] }, named: bool, quotes: strs, note: str },
      required: ["kind", "named", "quotes", "note"],
      additionalProperties: false,
    },
    pains: strs,
    solutions: strs,
    offer: { type: "object", properties: { deliverables: strs, effortLine: str, price: str, delivery: str }, required: ["deliverables", "effortLine", "price", "delivery"], additionalProperties: false },
    faqTopics: { type: "array", items: { type: "string", enum: [...FAQ_TOPICS] } },
    scarcity: str,
  },
  required: ["goal", "sections", "qualifier", "headline", "proof", "pains", "solutions", "offer", "faqTopics", "scarcity"],
  additionalProperties: false,
} as const;

const cited = { type: "array", items: str } as const;

/** What the model returns across the pages. `pageIds` are the ids given in the input (p1, p2, ...). */
export const INDUSTRY_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: { statement: str, job: { type: "string", enum: [...SECTION_KEYS, "none"] }, basis: { type: "string", enum: ["observed", "inferred"] }, pageIds: cited, whyItMayWork: str },
        required: ["statement", "job", "basis", "pageIds", "whyItMayWork"],
        additionalProperties: false,
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: { statement: str, job: { type: "string", enum: [...SECTION_KEYS, "none"] }, pageIds: cited },
        required: ["statement", "job", "pageIds"],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: str, change: str, why: str, basis: { type: "string", enum: ["inferred", "hypothesis"] }, pageIds: cited, howToTell: str },
        required: ["title", "change", "why", "basis", "pageIds", "howToTell"],
        additionalProperties: false,
      },
    },
    brief: {
      type: "object",
      properties: {
        audience: str,
        qualifier: str,
        promise: str,
        cta: str,
        sections: { type: "array", items: { type: "object", properties: { job: { type: "string", enum: [...SECTION_KEYS] }, direction: str }, required: ["job", "direction"], additionalProperties: false } },
        proofNeeded: strs,
        avoid: strs,
      },
      required: ["audience", "qualifier", "promise", "cta", "sections", "proofNeeded", "avoid"],
      additionalProperties: false,
    },
    limits: strs,
  },
  required: ["summary", "patterns", "gaps", "suggestions", "brief", "limits"],
  additionalProperties: false,
} as const;

export const DISCOVER_SCHEMA = {
  type: "object",
  properties: { pages: { type: "array", items: { type: "object", properties: { url: str, business: str }, required: ["url", "business"], additionalProperties: false } } },
  required: ["pages"],
  additionalProperties: false,
} as const;

export type SectionRead = { job: SectionKey | "other"; from: number; to: number; does: "yes" | "partly" | "no"; note: string };

export type PageAnalysis = {
  goal: string;
  sections: SectionRead[];
  qualifier: { quote: string; threshold: string };
  headline: { quote: string; statesOutcome: boolean };
  proof: { kind: "numbersAndQuotes" | "numbers" | "quotes" | "logos" | "none"; named: boolean; quotes: string[]; note: string };
  pains: string[];
  solutions: string[];
  offer: { deliverables: string[]; effortLine: string; price: string; delivery: string };
  faqTopics: FaqTopic[];
  scarcity: string;
};

export type Pattern = { statement: string; job: SectionKey | null; basis: "observed" | "inferred"; pageIds: string[]; whyItMayWork: string };
export type Gap = { statement: string; job: SectionKey | null; pageIds: string[] };
export type Suggestion = { title: string; change: string; why: string; basis: "inferred" | "hypothesis"; pageIds: string[]; howToTell: string };
export type CreativeBrief = { audience: string; qualifier: string; promise: string; cta: string; sections: { job: SectionKey; direction: string }[]; proofNeeded: string[]; avoid: string[] };
export type IndustryRead = { summary: string; patterns: Pattern[]; gaps: Gap[]; suggestions: Suggestion[]; brief: CreativeBrief; limits: string[] };

/** What code counted on one page. Exact, never a model's reading. */
export type PageFacts = {
  words: number;
  ctaCount: number;
  /** Distinct button wordings, in page order. */
  ctaTexts: string[];
  /** Distinct places buttons lead. More than one means more than one goal. */
  ctaTargets: number;
  weakCtas: string[];
  navLinks: number;
  stickyNavHint: boolean;
  formFields: number;
  hasVideo: boolean;
  hasBookingEmbed: boolean;
  faqQuestions: number;
  mobileViewport: boolean;
};

/** One page of a teardown, as saved: what was read, what code counted and what the model made of it. */
export type TeardownPage = {
  /** p1, p2, ... The id findings cite. */
  id: string;
  readId: string;
  sourceRefId: string | null;
  url: string;
  finalUrl: string;
  host: string;
  title: string;
  own: boolean;
  origin: "supplied" | "found";
  driver: "fetch" | "browser";
  /** "read", or "partial" when the page was cut or built itself in the browser. */
  status: string;
  facts: PageFacts;
  analysis: PageAnalysis | null;
  /** The framework jobs the page does, in the order they first appear. */
  order: SectionKey[];
  /** Expected jobs the page has no section for. */
  skipped: SectionKey[];
  /** Quotes the model gave that are not on the page. They were removed. */
  droppedQuotes: number;
};

export type UnreadPage = { url: string; own: boolean; reasonCode: string; reason: string };

export type PatternRow = { job: SectionKey; pages: string[]; share: number };

export type PagesRecord = {
  industry: string;
  pages: TeardownPage[];
  unread: UnreadPage[];
  /** For each framework job, which pages (other than the business's own) have a section for it. Counted in code. */
  table: PatternRow[];
  ownId: string | null;
};

export type ContextRecord = {
  requestId: string;
  industry: string;
  note: string;
  urls: string[];
  ownUrl: string | null;
  find: boolean;
  profile: { offer: string; audience: string } | null;
  /** The business's own measured results, when it has any connected. Totals only. */
  figures: { label: string; period: string; spend: number | null; conversions: number | null; revenue: number | null }[];
  decisions: string[];
};

export type CheckResult = { key: string; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

export type TeardownRecord = {
  industry: string;
  pages: TeardownPage[];
  unread: UnreadPage[];
  table: PatternRow[];
  ownId: string | null;
  read: IndustryRead | null;
  checks: ChecksRecord;
  versions: number;
  limits: string[];
  measured: boolean;
};

export type { Basis, PageSnapshot };

const text = (value: unknown, max = 600) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (value: unknown, max = 12, each = 300) => (Array.isArray(value) ? value.map((row) => text(row, each)).filter(Boolean).slice(0, max) : []);
const oneOf = <T extends string>(options: readonly T[], value: unknown): T | null => (typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null);
const object = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function parseJson(body: string | undefined | null): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** A model's reading of one page, made safe: unknown values dropped, lengths capped. Null when it is not one. */
export function readAnalysis(raw: unknown): PageAnalysis | null {
  const value = object(raw);
  if (!Array.isArray(value.sections)) return null;
  const proof = object(value.proof);
  const offer = object(value.offer);
  const qualifier = object(value.qualifier);
  const headline = object(value.headline);
  return {
    goal: text(value.goal, 300),
    sections: value.sections.slice(0, 30).flatMap((row): SectionRead[] => {
      const section = object(row);
      const job = isSectionKey(section.job) ? section.job : section.job === "other" ? "other" : null;
      const from = Number(section.from);
      const to = Number(section.to);
      if (!job || !Number.isInteger(from) || !Number.isInteger(to)) return [];
      return [{ job, from, to, does: oneOf(["yes", "partly", "no"] as const, section.does) ?? "partly", note: text(section.note, 400) }];
    }),
    qualifier: { quote: text(qualifier.quote, 300), threshold: text(qualifier.threshold, 120) },
    headline: { quote: text(headline.quote, 300), statesOutcome: headline.statesOutcome === true },
    proof: { kind: oneOf(["numbersAndQuotes", "numbers", "quotes", "logos", "none"] as const, proof.kind) ?? "none", named: proof.named === true, quotes: list(proof.quotes, 6), note: text(proof.note, 300) },
    pains: list(value.pains, 8),
    solutions: list(value.solutions, 8),
    offer: { deliverables: list(offer.deliverables, 12, 160), effortLine: text(offer.effortLine, 300), price: text(offer.price, 200), delivery: text(offer.delivery, 200) },
    faqTopics: Array.isArray(value.faqTopics) ? FAQ_TOPICS.filter((topic) => (value.faqTopics as unknown[]).includes(topic)) : [],
    scarcity: text(value.scarcity, 300),
  };
}

const jobOrNull = (value: unknown): SectionKey | null => (isSectionKey(value) ? value : null);

export function readIndustry(raw: unknown): IndustryRead | null {
  const value = object(raw);
  if (!Array.isArray(value.patterns) || !Array.isArray(value.suggestions)) return null;
  const brief = object(value.brief);
  return {
    summary: text(value.summary, 900),
    patterns: value.patterns.slice(0, 12).map((row) => {
      const item = object(row);
      return { statement: text(item.statement), job: jobOrNull(item.job), basis: oneOf(["observed", "inferred"] as const, item.basis) ?? "inferred", pageIds: list(item.pageIds, 8, 8), whyItMayWork: text(item.whyItMayWork) };
    }),
    gaps: (Array.isArray(value.gaps) ? value.gaps : []).slice(0, 12).map((row) => {
      const item = object(row);
      return { statement: text(item.statement), job: jobOrNull(item.job), pageIds: list(item.pageIds, 8, 8) };
    }),
    suggestions: value.suggestions.slice(0, 8).map((row) => {
      const item = object(row);
      return { title: text(item.title, 160), change: text(item.change), why: text(item.why), basis: oneOf(["inferred", "hypothesis"] as const, item.basis) ?? "hypothesis", pageIds: list(item.pageIds, 8, 8), howToTell: text(item.howToTell) };
    }),
    brief: {
      audience: text(brief.audience, 300),
      qualifier: text(brief.qualifier, 300),
      promise: text(brief.promise, 300),
      cta: text(brief.cta, 80),
      sections: (Array.isArray(brief.sections) ? brief.sections : []).slice(0, 11).flatMap((row) => {
        const item = object(row);
        return isSectionKey(item.job) ? [{ job: item.job, direction: text(item.direction, 400) }] : [];
      }),
      proofNeeded: list(brief.proofNeeded, 6),
      avoid: list(brief.avoid, 6),
    },
    limits: list(value.limits, 6, 400),
  };
}
