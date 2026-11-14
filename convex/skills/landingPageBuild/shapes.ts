/**
 * Landing Page Build: a full landing page layout for a business with no website, following the owner's
 * framework (docs/rebuild/landing-page-framework.md), all eleven sections in order. Every claim on the page
 * points at what it was built from. The JSON schema the model answers in, the defensive reader, and the shapes
 * the checks and screens share.
 */
import { FAQ_TOPICS, type FaqTopic } from "../landingTeardown/framework";

export const SKILL_SLUG = "landing-page-build";

export const PHASE = { context: "context", write: "write", check: "check", revise: "revise", recheck: "recheck", save: "save" } as const;

/** One thing the page may rest on: a research finding, a stated offer, a confirmed fact, the offer idea, a figure. */
export type ContextItem = { id: string; kind: "research" | "offer" | "idea" | "fact" | "profile" | "data"; text: string; proof?: boolean };

export type BuildContext = {
  businessName: string;
  /** The offer the page sells: the acquisition idea from the first package, else the confirmed offer. */
  selling: { from: string; title: string; text: string };
  items: ContextItem[];
  /** What is missing, said plainly to the model and kept on the page's limits. */
  gaps: string[];
};

const str = { type: "string" };
const from = { type: "array", items: str, description: "Ids of the context items this rests on." };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const list = (item: Record<string, unknown>) => ({ type: "array", items: item });

export const PAGE_SCHEMA = obj({
  goal: str,
  audience: str,
  nav: obj({ cta: str }),
  hero: obj({ qualifier: str, headline: str, subline: str, cta: str, scarcity: str, from }),
  results: list(obj({ metric: str, context: str, quote: str, name: str, role: str, from })),
  problem: list(obj({ moment: str, cost: str, from })),
  solution: list(obj({ outcome: str, from })),
  offer: obj({ deliverables: list(str), effortLine: str, price: str, delivery: str, from }),
  compare: list(obj({ without: str, with: str })),
  process: list(obj({ step: str, yourTime: str })),
  roles: obj({ yours: list(str), ours: list(str) }),
  faq: list(obj({ question: str, answer: str, topic: { type: "string", enum: [...FAQ_TOPICS, "other"] }, from })),
  finalCta: obj({ line: str, cta: str, timing: str }),
  limits: list(str),
});

export type Cited = { from: string[] };
export type PageLayout = {
  goal: string;
  audience: string;
  nav: { cta: string };
  hero: { qualifier: string; headline: string; subline: string; cta: string; scarcity: string } & Cited;
  results: ({ metric: string; context: string; quote: string; name: string; role: string } & Cited)[];
  problem: ({ moment: string; cost: string } & Cited)[];
  solution: ({ outcome: string } & Cited)[];
  offer: { deliverables: string[]; effortLine: string; price: string; delivery: string } & Cited;
  compare: { without: string; with: string }[];
  process: { step: string; yourTime: string }[];
  roles: { yours: string[]; ours: string[] };
  faq: ({ question: string; answer: string; topic: FaqTopic | "other" } & Cited)[];
  finalCta: { line: string; cta: string; timing: string };
  limits: string[];
};

const text = (value: unknown, max = 400) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const texts = (value: unknown, items = 12, max = 200) => (Array.isArray(value) ? value.map((row) => text(row, max)).filter(Boolean).slice(0, items) : []);
const ids = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter((row): row is string => typeof row === "string").map((row) => row.trim()).filter(Boolean))].slice(0, 12) : []);
const rows = (value: unknown, max: number) => (Array.isArray(value) ? value.filter((row) => row && typeof row === "object").slice(0, max) : []) as Record<string, unknown>[];

/** The model's answer as a layout. Anything malformed is emptied, never trusted. Null when it is not an object. */
export function readLayout(value: unknown): PageLayout | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const section = (key: string) => (row[key] && typeof row[key] === "object" ? (row[key] as Record<string, unknown>) : {});
  const hero = section("hero");
  const offer = section("offer");
  const roles = section("roles");
  const finalCta = section("finalCta");
  return {
    goal: text(row.goal, 200),
    audience: text(row.audience, 200),
    nav: { cta: text(section("nav").cta, 60) },
    hero: { qualifier: text(hero.qualifier, 160), headline: text(hero.headline, 160), subline: text(hero.subline, 240), cta: text(hero.cta, 60), scarcity: text(hero.scarcity, 160), from: ids(hero.from) },
    results: rows(row.results, 3).map((item) => ({ metric: text(item.metric, 40), context: text(item.context, 160), quote: text(item.quote, 300), name: text(item.name, 80), role: text(item.role, 80), from: ids(item.from) })),
    problem: rows(row.problem, 6).map((item) => ({ moment: text(item.moment, 200), cost: text(item.cost, 80), from: ids(item.from) })),
    solution: rows(row.solution, 6).map((item) => ({ outcome: text(item.outcome, 200), from: ids(item.from) })),
    offer: { deliverables: texts(offer.deliverables, 10, 120), effortLine: text(offer.effortLine, 200), price: text(offer.price, 80), delivery: text(offer.delivery, 120), from: ids(offer.from) },
    compare: rows(row.compare, 8).map((item) => ({ without: text(item.without, 120), with: text(item.with, 120) })),
    process: rows(row.process, 5).map((item) => ({ step: text(item.step, 160), yourTime: text(item.yourTime, 60) })),
    roles: { yours: texts(roles.yours, 6, 100), ours: texts(roles.ours, 12, 100) },
    faq: rows(row.faq, 8).map((item) => ({
      question: text(item.question, 200),
      answer: text(item.answer, 500),
      topic: ((FAQ_TOPICS as readonly string[]).includes(String(item.topic)) ? item.topic : "other") as FaqTopic | "other",
      from: ids(item.from),
    })),
    finalCta: { line: text(finalCta.line, 200), cta: text(finalCta.cta, 60), timing: text(finalCta.timing, 160) },
    limits: texts(row.limits, 8, 300),
  };
}

export type CheckResult = { key: string; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };
