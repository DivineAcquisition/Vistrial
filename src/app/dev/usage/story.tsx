"use client";

import { useMemo, useState } from "react";

import { UsageView, type UsageFilters, type UsageItems, type UsageOverview } from "@/components/usage/usage-view";
import { DIMENSIONS, breakdown, daily, matches, periodDays, typicalUse, workItems, type Dimension, type UsageRow } from "../../../../convex/lib/usageReport";
import { StoryTheme } from "../story-theme";

const NOW = Date.UTC(2026, 10, 13, 16);
const DAY = 86_400_000;

/** A small deterministic random, so the screenshots are the same every time. */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    return value / 2_147_483_648;
  };
}

type Sample = {
  organizations: Record<string, string>;
  clients: Record<string, string>;
  people: Record<string, string>;
  agents: Record<string, string>;
  skills: Record<string, string>;
  models: Record<string, string>;
  rows: UsageRow[];
};

const AGENTS = { "growth-architect": "Growth Architect", "campaign-execution": "Campaign Execution", "sales-conversion": "Sales Conversion" };
const SKILLS = {
  "market-intelligence": "Market Intelligence",
  "offer-intelligence": "Offer Intelligence",
  "growth-diagnostics": "Growth Diagnostics",
  "creative-production": "Creative Production",
  "landing-page-teardown": "Landing Page Teardown",
};
const MODELS = { "claude-opus-5-5": "Claude Opus 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-haiku-5-5": "Claude Haiku 5.5", "gemini-3-pro-image": "Gemini 3 Pro Image" };

/** What each kind of work spends, roughly, in credits: a range the sample draws from. */
const WORK: { source: UsageRow["source"]; agent?: string; skill?: string; credits: [number, number]; models: string[]; title: string; weight: number }[] = [
  { source: "run", agent: "growth-architect", skill: "market-intelligence", credits: [180, 420], models: ["claude-opus-5-5", "claude-haiku-5-5", ""], title: "Competitor research", weight: 4 },
  { source: "run", agent: "growth-architect", skill: "offer-intelligence", credits: [90, 220], models: ["claude-opus-5-5"], title: "Offer comparison", weight: 2 },
  { source: "run", agent: "growth-architect", skill: "growth-diagnostics", credits: [60, 160], models: ["claude-sonnet-5-5"], title: "Where growth stalls", weight: 2 },
  { source: "creative", agent: "growth-architect", skill: "creative-production", credits: [12, 30], models: ["gemini-3-pro-image"], title: "Image: Spring launch ad", weight: 3 },
  { source: "run", agent: "growth-architect", skill: "landing-page-teardown", credits: [150, 380], models: ["claude-opus-5-5", ""], title: "Landing page teardown", weight: 1 },
  { source: "intake", agent: "growth-architect", skill: "market-intelligence", credits: [3, 18], models: ["claude-sonnet-5-5"], title: "Chat", weight: 4 },
  { source: "followup", agent: "growth-architect", skill: "market-intelligence", credits: [6, 24], models: ["claude-opus-5-5"], title: "Follow-up: Who are we losing to?", weight: 2 },
  { source: "run", agent: "campaign-execution", skill: "creative-production", credits: [60, 140], models: ["claude-opus-5-5"], title: "Campaign copy", weight: 1 },
  { source: "run", agent: "sales-conversion", credits: [20, 70], models: ["claude-sonnet-5-5"], title: "Follow-up sequence", weight: 1 },
];

function sample(kind: "agency" | "coach"): Sample {
  const random = seeded(kind === "agency" ? 7 : 11);
  const agency = kind === "agency";
  const organizations: Record<string, string> = agency ? { w1: "Northlight Growth", w2: "Northlight Coaching" } : { w1: "Bloom Coaching" };
  const clients: Record<string, string> = agency ? { c1: "Harbor Dental", c2: "Peak Fitness", c3: "Oakline Realty", c4: "Mira Skincare" } : {};
  const people: Record<string, string> = agency ? { nora: "Nora Ellis (you)", ada: "Ada Brooks", milo: "Milo Chen", sam: "Sam Ortiz" } : { jo: "Jo Rivera (you)", kai: "Kai Lund" };
  const work = agency ? WORK : WORK.filter((row) => row.agent === "growth-architect" && row.skill !== "landing-page-teardown");
  const pool = work.flatMap((row) => Array(row.weight).fill(row) as (typeof work)[number][]);
  const rows: UsageRow[] = [];
  const perDay = agency ? 7 : 3;
  for (let back = 89; back >= 0; back -= 1) {
    const weekend = new Date(NOW - back * DAY).getUTCDay() % 6 === 0;
    const count = Math.round(perDay * (weekend ? 0.3 : 1) * (0.5 + random()) * (back < 20 ? 1.3 : 1));
    for (let index = 0; index < count; index += 1) {
      const kindOf = pool[Math.floor(random() * pool.length)];
      const at = NOW - back * DAY - Math.floor(random() * 10) * 3_600_000;
      const workspaceId = agency && random() < 0.3 ? "w2" : "w1";
      const clientKeys = Object.keys(clients);
      const clientId = agency && random() < 0.75 ? clientKeys[Math.floor(random() * clientKeys.length)] : undefined;
      const personKeys = Object.keys(people);
      const startedBy = personKeys[Math.floor(random() * personKeys.length)];
      const total = kindOf.credits[0] + random() * (kindOf.credits[1] - kindOf.credits[0]);
      const ref = `${kind}-${back}-${index}`;
      kindOf.models.forEach((model, slot) => {
        const part = kindOf.models.length === 1 ? total : slot === 0 ? total * 0.78 : total * (0.22 / (kindOf.models.length - 1));
        rows.push({
          workspaceId,
          source: kindOf.source,
          ref,
          day: new Date(at).toISOString().slice(0, 10),
          model,
          priceCents: Math.max(1, Math.round(part)),
          firstAt: at,
          lastAt: at + 240_000,
          startedBy,
          agentSlug: kindOf.agent,
          skillSlug: kindOf.skill,
          clientId,
          title: kindOf.title + (clientId ? ` for ${clients[clientId]}` : ""),
        });
      });
    }
  }
  return { organizations, clients, people, agents: AGENTS, skills: SKILLS, models: MODELS, rows };
}

const NONE_WORDS: Record<Dimension, string> = { skill: "Not part of a skill", agent: "No agent", client: "Your own organization", model: "Tools and page reading", person: "Not recorded", organization: "Unknown" };

function label(data: Sample, dimension: Dimension, key: string) {
  if (key === "none") return NONE_WORDS[dimension];
  const map = { skill: data.skills, agent: data.agents, client: data.clients, model: data.models, person: data.people, organization: data.organizations }[dimension];
  return (map as Record<string, string>)[key] ?? key;
}

type Access = "account" | "organization" | "own" | "summary";
const TYPICAL: Record<UsageRow["source"], string> = { run: "Other runs", followup: "A follow-up answer", intake: "A chat", file: "Reading a file", creative: "An image", page: "Reading pages" };
const SOURCE: Record<UsageRow["source"], string> = { run: "Run", followup: "Follow-up", intake: "Chat", file: "File read", creative: "Image", page: "Page reading" };

function build(state: string, filters: UsageFilters, limit: number): { overview: UsageOverview; items: UsageItems } {
  const coach = state.startsWith("coach");
  const access: Access = state === "admin" ? "organization" : state === "member" || state === "coach-member" ? "own" : state === "viewer" ? "summary" : "account";
  const data = sample(coach ? "coach" : "agency");
  const me = coach ? "jo" : "nora";
  const rows = data.rows.filter((row) => (access === "account" ? true : row.workspaceId === "w1")).filter((row) => (access === "own" ? row.startedBy === (state === "member" ? "milo" : me) : true));
  const empty = state === "empty";
  const usable = empty ? [] : rows;
  const days = periodDays(filters.period, NOW, NOW - 9 * DAY);
  const inPeriod = usable.filter((row) => row.day >= days[0]);
  const wanted = Object.fromEntries(DIMENSIONS.filter((dimension) => filters[dimension]).map((dimension) => [dimension, filters[dimension]!]));
  const filtered = inPeriod.filter((row) => matches(row, wanted));
  const dims = DIMENSIONS.filter((dimension) => (dimension === "organization" ? access === "account" && Object.keys(data.organizations).length > 1 : dimension === "person" ? access !== "own" : true));
  const by = Object.fromEntries(dims.map((dimension) => [dimension, breakdown(filtered, dimension).map((slice) => ({ ...slice, label: label(data, dimension, slice.key) }))]));
  const options = Object.fromEntries(dims.map((dimension) => [dimension, breakdown(inPeriod.filter((row) => matches(row, wanted, dimension)), dimension).map((slice) => ({ key: slice.key, label: label(data, dimension, slice.key) }))]));
  const stacked = daily(filtered, days);
  const total = filtered.reduce((sum, row) => sum + row.priceCents, 0);
  const balanceLeft = state === "low" ? 160 : coach ? 9_240 : 11_870;
  const used = coach ? 5_760 : 13_130;
  const overview = {
    access,
    balance: {
      on: true,
      planName: "Growth",
      balance: balanceLeft,
      includedThisMonth: coach ? 15_000 : 20_000,
      usedThisMonth: access === "account" || access === "organization" ? used : null,
      packs: coach || access === "summary" ? null : 5_000,
      resetAt: NOW + 21 * DAY,
      forecast: access === "account" || access === "organization" ? (coach ? { kind: "pastReset" as const } : { kind: "until" as const, at: NOW + 17 * DAY }) : null,
      lowAt: 200,
    },
    limits: {
      perSkill: [
        { skillSlug: "market-intelligence", agentSlug: "growth-architect", label: "Market Intelligence", perRun: 900, perDay: 7_500 },
        { skillSlug: "offer-intelligence", agentSlug: "growth-architect", label: "Offer Intelligence", perRun: 450, perDay: 3_000 },
        { skillSlug: "growth-diagnostics", agentSlug: "growth-architect", label: "Growth Diagnostics", perRun: 300, perDay: 3_000 },
        { skillSlug: "creative-production", agentSlug: "growth-architect", label: "Creative Production", perRun: 450, perDay: 4_500 },
        { skillSlug: "landing-page-teardown", agentSlug: "growth-architect", label: "Landing Page Teardown", perRun: 900, perDay: 4_500 },
      ],
      spendApproval: coach ? null : 500,
      autoRefill: { threshold: 200, amount: 1000, maxPerMonth: 4 },
      chatCap: 75,
    },
    ...(access === "summary"
      ? { period: null, totals: null, daily: null, by: null, options: null, typical: null, truncated: false }
      : {
          period: { period: filters.period, from: days[0], to: days[days.length - 1], days: days.length },
          totals: { credits: total, items: new Set(filtered.map((row) => `${row.workspaceId}:${row.ref}`)).size, perDay: total / days.length },
          daily: { bars: stacked.bars, keys: stacked.keys.map((key) => ({ key, label: label(data, "agent", key) })) },
          by,
          options,
          typical: typicalUse(usable).map((row) => ({ ...row, label: row.key.startsWith("source:") ? TYPICAL[row.source] : `${label(data, "skill", row.key)} run`, enough: row.count >= 3 })),
          truncated: false,
        }),
  } as unknown as UsageOverview;
  const work = workItems(filtered);
  const items = {
    total: work.length,
    truncated: false,
    items: work.slice(0, limit).map((item) => ({
      key: `${item.workspaceId}:${item.ref}`,
      kind: SOURCE[item.source],
      source: item.source,
      title: item.title ?? SOURCE[item.source],
      at: item.lastAt,
      startedAt: item.firstAt,
      person: item.startedBy ? label(data, "person", item.startedBy) : "Not recorded",
      agentSlug: item.agentSlug ?? null,
      agent: item.agentSlug ? label(data, "agent", item.agentSlug) : null,
      skill: item.skillSlug ? label(data, "skill", item.skillSlug) : null,
      client: item.clientId ? label(data, "client", item.clientId) : null,
      organization: access === "account" && !coach ? label(data, "organization", item.workspaceId) : null,
      models: item.models.map((model) => label(data, "model", model)),
      credits: item.credits,
      href: item.workspaceId === "w1" ? "#" : null,
    })),
  } as UsageItems;
  return { overview, items };
}

/** ?state=agency|admin|member|coach|coach-member|viewer|low|empty, ?theme=light|dark. Sample data only. */
export function UsageStory({ state, theme }: { state: string; theme: string }) {
  const [filters, setFilters] = useState<UsageFilters>({ period: "30d" });
  const [limit, setLimit] = useState(8);
  const { overview, items } = useMemo(() => build(state, filters, limit), [state, filters, limit]);
  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8">
      <StoryTheme theme={theme} />
      <UsageView data={overview} items={items} filters={filters} onFilters={setFilters} onMore={() => setLimit((current) => current + 8)} />
    </div>
  );
}
