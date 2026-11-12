/**
 * Industry trend posts: the shapes and the rules that need no database. Once a month, where an Owner or
 * Admin switched them on, Vistrial searches the web for what changed in an organization's industry (and
 * in the industries of its clients) and posts what was reported to the Briefing, with its sources.
 *
 * What a post may rest on is decided here, in code, never by the model:
 *   - only links the search itself returned, each with its own date, no older than MAX_AGE_DAYS;
 *   - at least two of them, from different sites, and at least one that is not a social post;
 *   - words that report what was said, never what will happen to this organization.
 * Vistrial opens no page for a trend post. It keeps what the search returned: the link, the title, the
 * date and the line that was cited. Nothing found on the web is ever followed as an instruction.
 */
import { parsePublicUrl } from "../../lib/sourceRefs";
import { claimsResult } from "../../lib/agentTasks";

export const SKILL_SLUG = "industry-trends";
export const PHASE = { read: "read", research: "research", write: "write", save: "save" } as const;

/** The organization itself and up to three of its clients. */
export const MAX_SUBJECTS = 4;
export const MAX_SEARCHES = 4;
/** A monthly post reports the last month and a little before it. An older source is not news. */
export const MAX_AGE_DAYS = 45;
export const MIN_SOURCES = 2;
export const MAX_SOURCES_ON_POST = 4;
/** The most sources shown to the model for writing. */
export const MAX_SOURCES_READ = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Subject = {
  id: string;
  /** Null for the organization itself. */
  clientId: string | null;
  name: string;
  /** What it sells and to whom, in its own words: what the search is about. */
  industry: string;
};

/** `at` is when the plan was read: the moment every source's age is measured from, so the run decides the same way each time it is asked. */
export type TrendPlan = { monthKey: string; at: number; subjects: Subject[] };

export type TrendSource = {
  id: string;
  url: string;
  title: string;
  /** The site it is on: "example.com". Two sources on one site count as one. */
  site: string;
  /** The platform's name when it is a social post, or null for a page on the web. */
  social: string | null;
  publishedAt: number;
  /** Its own date, as the search gave it: "2026-10-30". */
  date: string;
  /** The line the search cited from it, when there was one. */
  cited: string | null;
};

const SOCIAL: Readonly<Record<string, string>> = {
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "x.com": "X",
  "twitter.com": "X",
  "facebook.com": "Facebook",
  "reddit.com": "Reddit",
  "threads.net": "Threads",
  "threads.com": "Threads",
};
const SAME_SITE: Readonly<Record<string, string>> = { "youtu.be": "youtube.com", "fb.com": "facebook.com" };
const TWO_PART_ENDINGS = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br", "co.in", "com.mx", "co.za", "com.sg"]);

/** The site a link is on: its host without subdomains. Null for anything that is not a public web address. */
export function siteOf(raw: string): string | null {
  const url = parsePublicUrl(raw);
  if (!url) return null;
  const labels = url.hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const tail = labels.slice(-2).join(".");
  const site = TWO_PART_ENDINGS.has(tail) && labels.length >= 3 ? labels.slice(-3).join(".") : tail;
  return SAME_SITE[site] ?? site;
}

const day = (time: number) => new Date(time).toISOString().slice(0, 10);
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

type SavedWeb = { sources?: { url?: unknown; title?: unknown; pageAge?: unknown }[]; citations?: { url?: unknown; citedText?: unknown }[] };

/**
 * What the run's searches returned, as sources a post may rest on. A link with no date of its own, a date
 * in the future, or one older than MAX_AGE_DAYS is counted and left out: it cannot support a post.
 */
export function readSources(bodies: string[], now: number): { usable: TrendSource[]; undated: number; stale: number } {
  const usable: TrendSource[] = [];
  const seen = new Set<string>();
  let undated = 0;
  let stale = 0;
  for (const body of bodies) {
    let saved: SavedWeb;
    try {
      saved = JSON.parse(body) as SavedWeb;
    } catch {
      continue;
    }
    const cited = new Map<string, string>();
    for (const row of saved.citations ?? []) {
      const line = clip(row.citedText, 300);
      if (typeof row.url === "string" && line && !cited.has(row.url)) cited.set(row.url, line);
    }
    for (const row of saved.sources ?? []) {
      if (typeof row.url !== "string" || seen.has(row.url)) continue;
      const site = siteOf(row.url);
      if (!site) continue;
      seen.add(row.url);
      const publishedAt = typeof row.pageAge === "string" ? Date.parse(row.pageAge) : Number.NaN;
      if (!Number.isFinite(publishedAt) || publishedAt <= 0 || publishedAt > now + DAY_MS) {
        undated += 1;
        continue;
      }
      if (publishedAt < now - MAX_AGE_DAYS * DAY_MS) {
        stale += 1;
        continue;
      }
      if (usable.length >= MAX_SOURCES_READ) continue;
      usable.push({ id: `w${usable.length + 1}`, url: row.url.slice(0, 500), title: clip(row.title, 160) || site, site, social: SOCIAL[site] ?? null, publishedAt, date: day(publishedAt), cited: cited.get(row.url) ?? null });
    }
  }
  return { usable, undated, stale };
}

export const POSTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subjectId", "headline", "body", "sourceIds"],
        properties: { subjectId: { type: "string" }, headline: { type: "string" }, body: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;

export type SettledPost = { subject: Subject; headline: string; body: string; sources: TrendSource[] };

const HEADLINE_MAX = 120;
const BODY_MAX = 700;

/**
 * What the model wrote, as it may be posted. One post per subject at most. A post is dropped, with the
 * reason kept, when it names no real subject, claims a result, or does not rest on at least two dated
 * sources from different sites of which one is not a social post. Links in the words are removed: the
 * only links on a post are its sources.
 */
export function settlePosts(plan: TrendPlan, sources: TrendSource[], value: unknown): { posts: SettledPost[]; notes: string[] } {
  const posts: SettledPost[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const raw = value && typeof value === "object" && Array.isArray((value as { posts?: unknown }).posts) ? ((value as { posts: unknown[] }).posts) : [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const subject = plan.subjects.find((candidate) => candidate.id === row.subjectId);
    if (!subject || seen.has(subject.id)) continue;
    seen.add(subject.id);
    const strip = (text: string) => text.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
    const headline = strip(clip(row.headline, 400)).slice(0, HEADLINE_MAX);
    const body = strip(clip(row.body, 4000)).slice(0, BODY_MAX);
    if (headline.length < 8 || body.length < 40) {
      notes.push(`${subject.name}: what was written was too short to post.`);
      continue;
    }
    if (claimsResult(headline) || claimsResult(body)) {
      notes.push(`${subject.name}: what was written read as a promise, so it was not posted.`);
      continue;
    }
    const ids = Array.isArray(row.sourceIds) ? [...new Set(row.sourceIds.filter((id): id is string => typeof id === "string"))] : [];
    const cited = ids.map((id) => sources.find((source) => source.id === id)).filter((source): source is TrendSource => Boolean(source));
    // One source per site, press first, so the links shown are the ones the rule counted.
    const bySite = new Map<string, TrendSource>();
    for (const source of [...cited.filter((source) => !source.social), ...cited.filter((source) => source.social)]) if (!bySite.has(source.site)) bySite.set(source.site, source);
    const kept = [...bySite.values()].slice(0, MAX_SOURCES_ON_POST);
    if (kept.length < MIN_SOURCES) {
      notes.push(`${subject.name}: fewer than two dated sources from different sites stood behind it, so it was not posted.`);
      continue;
    }
    if (kept.every((source) => source.social)) {
      notes.push(`${subject.name}: it rested on social posts alone, so it was not posted.`);
      continue;
    }
    posts.push({ subject, headline, body, sources: kept });
  }
  return { posts, notes };
}

/** How a source reads on a post: its title, where it is and its own date. A title that reads as a promise is not repeated. */
export function sourceTitle(source: TrendSource): string {
  const where = source.social ? `${source.social} post, ${source.date}` : `${source.site}, ${source.date}`;
  return source.title && !claimsResult(source.title) ? `${source.title} (${where})` : `A source (${where})`;
}

/** The words every trend post ends with, written in code. */
export function closingWords(post: SettledPost): string {
  const dates = post.sources.map((source) => source.date).sort();
  const span = dates[0] === dates[dates.length - 1] ? `on ${dates[0]}` : `between ${dates[0]} and ${dates[dates.length - 1]}`;
  return `This is what ${post.sources.length} sources reported ${span}. It is not a forecast for ${post.subject.name}, and no task was created from it.`;
}

/** "2026-11": the month a time falls in, in UTC. */
export function monthKey(time: number) {
  return new Date(time).toISOString().slice(0, 7);
}
