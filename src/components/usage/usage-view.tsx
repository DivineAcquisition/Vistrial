"use client";

import { ArrowRight, ArrowSquareOut, CalendarBlank, Coins, Gauge, Info, Lightning, ShieldCheck, Sparkle, TrendUp, Wallet } from "@phosphor-icons/react/dist/ssr";
import type { FunctionReturnType } from "convex/server";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/tabs";
import { creditCount, creditWords, dollarWords } from "@/lib/credits";
import { cn } from "@/lib/utils";
import type { api } from "../../../convex/_generated/api";

export type UsageOverview = FunctionReturnType<typeof api.usage.overview>;
export type UsageItems = FunctionReturnType<typeof api.usage.items>;
export type Period = "7d" | "30d" | "month" | "90d";
export type Dimension = "skill" | "agent" | "client" | "model" | "person" | "organization";
export type UsageFilters = { period: Period } & Partial<Record<Dimension, string>>;

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "90d", label: "90 days" },
];

const DIMENSION_WORDS: Record<Dimension, { tab: string; filter: string; all: string }> = {
  skill: { tab: "Skill", filter: "Skill", all: "Every skill" },
  agent: { tab: "Agent", filter: "Agent", all: "Every agent" },
  client: { tab: "Client", filter: "Client", all: "Every client" },
  model: { tab: "Model", filter: "Model", all: "Every model" },
  person: { tab: "Person", filter: "Started by", all: "Everyone" },
  organization: { tab: "Organization", filter: "Organization", all: "Every organization" },
};
const DIMENSION_ORDER: Dimension[] = ["skill", "agent", "client", "model", "person", "organization"];

/** Each agent keeps one colour, whatever is filtered (globals.css `.usage-viz`). */
const AGENT_SLOT: Record<string, number> = {
  "growth-architect": 1,
  "campaign-execution": 2,
  "sales-conversion": 3,
  activation: 4,
  retention: 5,
  expansion: 6,
  "operations-intelligence": 7,
};
export function agentColor(key: string) {
  if (key === "none") return "var(--series-none)";
  return `var(--series-${AGENT_SLOT[key] ?? 8})`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayWords(day: string) {
  const [, month, date] = day.split("-").map(Number);
  return `${MONTHS[month - 1]} ${date}`;
}
function dateWords(at: number) {
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
function whenWords(at: number) {
  const date = new Date(at);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** A round top for the axis: 1, 2 or 5 times a power of ten, at or above the tallest bar. */
export function niceMax(value: number) {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

// ------------------------------------------------------------------------------------------- the page

export function UsageView({
  data,
  items,
  filters,
  onFilters,
  onMore,
}: {
  data: UsageOverview;
  items: UsageItems | undefined;
  filters: UsageFilters;
  onFilters: (next: UsageFilters) => void;
  onMore?: () => void;
}) {
  const description =
    data.access === "summary"
      ? "Your balance, and how credits are used. The breakdown of what was spent is for people who start work."
      : data.access === "own"
        ? "Where your credits went: every run, chat and image you started, what it used and which model ran it."
        : "Where every credit went: by day, skill, agent, client, model and person, down to each run, chat and image.";
  return (
    <MotionConfig reducedMotion="user">
      <div className="usage-viz mx-auto grid w-full max-w-6xl min-w-0 gap-6">
        <PageHeader eyebrow="Account" title="Usage" description={description} />
        <BalancePanel data={data} />
        {data.access !== "summary" && data.by && data.daily && data.totals && data.options ? (
          <>
            <FilterBar data={data} filters={filters} onFilters={onFilters} />
            {data.truncated ? (
              <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
                This period holds more work than one page can add up, so the numbers below are partial. Choose a shorter period or a filter.
              </p>
            ) : null}
            <OverTime data={data} />
            <Breakdowns data={data} filters={filters} onFilters={onFilters} />
            <WorkList items={items} onMore={onMore} />
          </>
        ) : null}
        <HowCreditsWork data={data} />
      </div>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------------------- balance

function BalancePanel({ data }: { data: UsageOverview }) {
  const { balance } = data;
  const left = balance.balance ?? 0;
  const pool = balance.includedThisMonth + (balance.packs ?? 0);
  const share = pool > 0 ? Math.max(0, Math.min(1, left / pool)) : left > 0 ? 1 : 0;
  const low = balance.on && balance.balance !== null && left <= balance.lowAt;
  const forecast = balance.forecast;
  const forecastWords =
    forecast === null
      ? null
      : forecast.kind === "until"
        ? `At this pace the balance lasts until ${dateWords(forecast.at)}.`
        : forecast.kind === "pastReset"
          ? "At this pace the balance lasts past the next reset."
          : "Not enough use in the last two weeks to measure a pace.";
  return (
    <section aria-labelledby="usage-balance" className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/12 to-transparent" />
      <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr]">
        <BalanceRing share={share} left={left} on={balance.on && balance.balance !== null} low={low} />
        <div className="grid min-w-0 gap-4">
          <h2 id="usage-balance" className="font-heading text-lg text-card-foreground">
            {balance.planName} plan
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Stat
              label="Included this month"
              value={balance.includedThisMonth > 0 ? creditWords(balance.includedThisMonth) : "No plan yet"}
              hint={
                balance.includedParts && balance.includedParts.extraOrganizations > 0
                  ? `${creditCount(balance.includedParts.plan)} with the plan, ${creditCount(balance.includedParts.extraOrganizations * balance.includedParts.perOrganization)} for ${balance.includedParts.extraOrganizations === 1 ? "1 more organization" : `${balance.includedParts.extraOrganizations} more organizations`}`
                  : undefined
              }
            />
            <Stat label="Used this month" value={balance.usedThisMonth === null ? "Shown to Owners and Admins" : creditWords(balance.usedThisMonth)} muted={balance.usedThisMonth === null} />
            <Stat label="Left" value={balance.balance === null ? "Not set up" : creditWords(left)} tone={low ? "warning" : undefined} />
            <Stat label="Packs bought" value={balance.packs === null ? "Not reported yet" : creditWords(balance.packs)} muted={balance.packs === null} />
            <Stat label="Resets" value={balance.resetAt ? dateWords(balance.resetAt) : "When the plan starts"} />
          </dl>
          {forecastWords ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <TrendUp aria-hidden weight="duotone" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{forecastWords}</span>
            </p>
          ) : null}
          {low ? (
            <p className="flex items-start gap-2 text-sm text-foreground">
              <Info aria-hidden weight="duotone" className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                Credits are running low.{" "}
                <Link href="/app/billing" className="text-primary underline-offset-2 hover:underline">
                  Add credits in Billing
                </Link>
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone, muted, hint }: { label: string; value: string; tone?: "warning"; muted?: boolean; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium break-words tabular-nums", tone === "warning" ? "text-warning" : muted ? "text-muted-foreground" : "text-card-foreground")}>{value}</dd>
      {hint ? <dd className="text-[11px] break-words text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

const RING = 54;
const CIRCUMFERENCE = 2 * Math.PI * RING;

function BalanceRing({ share, left, on, low }: { share: number; left: number; on: boolean; low: boolean }) {
  const reduced = useReducedMotion();
  const gradient = useId();
  return (
    <div className="relative mx-auto size-40 shrink-0 sm:size-44" role="img" aria-label={on ? `${creditWords(left)} left, ${Math.round(share * 100)}% of this month's credits` : "No balance yet"}>
      <motion.div
        aria-hidden
        className="absolute inset-3 rounded-full bg-primary/25 blur-2xl"
        initial={{ opacity: reduced ? 0.7 : 0 }}
        animate={reduced ? { opacity: 0.7 } : { opacity: [0.45, 0.8, 0.45] }}
        transition={reduced ? { duration: 0 } : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 128 128" className="relative size-full -rotate-90">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-primary)" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={RING} fill="none" stroke="var(--color-muted)" strokeWidth="10" />
        <motion.circle
          cx="64"
          cy="64"
          r={RING}
          fill="none"
          stroke={low ? "var(--color-warning)" : `url(#${gradient})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: reduced ? CIRCUMFERENCE * (1 - share) : CIRCUMFERENCE }}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - share) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 8px color-mix(in oklab, var(--color-primary) 60%, transparent))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <Wallet aria-hidden weight="duotone" className="mx-auto mb-1 size-4 text-primary" />
        <span className="font-heading text-2xl text-card-foreground tabular-nums sm:text-3xl">{on ? <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="inline-block">{creditCount(left)}</motion.span> : "–"}</span>
        <span className="text-xs text-muted-foreground">credits left</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------- filters

function FilterBar({ data, filters, onFilters }: { data: UsageOverview; filters: UsageFilters; onFilters: (next: UsageFilters) => void }) {
  const options = data.options ?? {};
  const dims = DIMENSION_ORDER.filter((dimension) => (options[dimension]?.length ?? 0) > 0 || filters[dimension]);
  const any = dims.some((dimension) => filters[dimension]);
  return (
    <div className="grid gap-3">
      <div className="w-full min-w-0 overflow-x-auto sm:w-auto sm:max-w-full">
        <SegmentedControl label="Period" options={PERIOD_OPTIONS} value={filters.period} onChange={(period) => onFilters({ ...filters, period })} />
      </div>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {dims.map((dimension) => (
          <label key={dimension} className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            {DIMENSION_WORDS[dimension].filter}
            <select
              value={filters[dimension] ?? ""}
              onChange={(event) => onFilters({ ...filters, [dimension]: event.target.value || undefined })}
              className="h-9 w-full min-w-0 truncate rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{DIMENSION_WORDS[dimension].all}</option>
              {(options[dimension] ?? []).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {any ? (
        <button
          type="button"
          onClick={() => onFilters({ period: filters.period })}
          className="justify-self-start text-sm text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ over time

function OverTime({ data }: { data: UsageOverview }) {
  const daily = data.daily!;
  const totals = data.totals!;
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...daily.bars.map((bar) => bar.total)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const labels = new Map(daily.keys.map((key) => [key.key, key.label]));
  const shown = active === null ? null : daily.bars[active];
  const labelEvery = daily.bars.length > 31 ? 14 : daily.bars.length > 10 ? 5 : 1;
  const wide = daily.bars.length > 31;
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            <CalendarBlank aria-hidden weight="duotone" className="size-4 text-primary" /> Credits per day
          </h2>
          <p className="text-sm text-muted-foreground">
            {creditWords(totals.credits)} over {data.period?.days} days, across {totals.items === 1 ? "1 piece of work" : `${totals.items.toLocaleString("en-US")} pieces of work`}. About {creditWords(Math.round(totals.perDay))} a day.
          </p>
        </div>
        <div aria-live="polite" className="min-h-10 text-right text-xs text-muted-foreground">
          {shown ? (
            <>
              <span className="block font-medium text-card-foreground">
                {dayWords(shown.day)}: {creditWords(shown.total)}
              </span>
              {shown.parts.map((part) => (
                <span key={part.key} className="block">
                  {labels.get(part.key) ?? part.key}: {creditCount(part.credits)}
                </span>
              ))}
            </>
          ) : (
            <span>Point at a day for its detail.</span>
          )}
        </div>
      </div>

      {daily.keys.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Agents">
          {daily.keys.map((key) => (
            <li key={key.key} className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 py-0.5 pr-2.5 pl-0.5">
              {key.key === "none" ? (
                <span aria-hidden className="grid size-5 place-content-center rounded-full bg-muted">
                  <Coins weight="duotone" className="size-3" />
                </span>
              ) : (
                <AgentAvatar slug={key.key} name={key.label} size="xs" className="size-5" />
              )}
              <span aria-hidden className="size-2 rounded-full" style={{ background: agentColor(key.key), boxShadow: `0 0 6px ${agentColor(key.key)}` }} />
              <span className="text-card-foreground">{key.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid min-w-0 grid-cols-[auto_1fr] gap-2">
        <div className="relative flex h-48 flex-col justify-between pb-5 text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {creditCount(tick)}
            </span>
          ))}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <div className={cn("relative h-48", wide && "min-w-[540px]")} onMouseLeave={() => setActive(null)}>
            <div aria-hidden className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
              {ticks.map((tick) => (
                <span key={tick} className={cn("h-px w-full", tick === 0 ? "bg-border" : "bg-border/50")} />
              ))}
            </div>
            <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px]">
              {daily.bars.map((bar, index) => (
                <button
                  key={bar.day}
                  type="button"
                  aria-label={`${dayWords(bar.day)}: ${creditWords(bar.total)}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("absolute inset-0 rounded-sm transition-colors", active === index ? "bg-primary/8" : "bg-transparent")} />
                  <motion.span
                    className="relative flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                    initial={{ height: 0 }}
                    animate={{ height: `${(bar.total / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: Math.min(index * 0.012, 0.5), ease: [0.22, 1, 0.36, 1] }}
                  >
                    {bar.parts.map((part) => (
                      <span
                        key={part.key}
                        className="w-full shrink-0"
                        style={{
                          height: `${(part.credits / bar.total) * 100}%`,
                          background: agentColor(part.key),
                          boxShadow: active === index ? `0 0 12px 0 ${agentColor(part.key)}` : undefined,
                        }}
                      />
                    ))}
                  </motion.span>
                </button>
              ))}
            </div>
            <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-4 gap-[2px] text-[10px] text-muted-foreground">
              {daily.bars.map((bar, index) => (
                <span key={bar.day} className="relative min-w-0 flex-1">
                  {index % labelEvery === 0 ? <span className="absolute left-0 whitespace-nowrap">{dayWords(bar.day)}</span> : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Credits used each day (UTC), split by agent. The axis starts at zero.</p>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-primary">Show as a table</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Credits used each day</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">Day</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {daily.bars.map((bar) => (
                <tr key={bar.day} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-normal text-card-foreground">{dayWords(bar.day)}</th>
                  <td className="py-1 pr-3 text-right tabular-nums">{creditCount(bar.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------- breakdowns

function Breakdowns({ data, filters, onFilters }: { data: UsageOverview; filters: UsageFilters; onFilters: (next: UsageFilters) => void }) {
  const by = data.by ?? {};
  const dims = DIMENSION_ORDER.filter((dimension) => by[dimension] !== undefined);
  const [dimension, setDimension] = useState<Dimension>(dims[0] ?? "skill");
  const current = dims.includes(dimension) ? dimension : (dims[0] ?? "skill");
  const slices = by[current] ?? [];
  const top = slices[0]?.credits ?? 0;
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
          <Gauge aria-hidden weight="duotone" className="size-4 text-primary" /> Where the credits went
        </h2>
        <div className="w-full min-w-0 overflow-x-auto sm:w-auto sm:max-w-full">
          <SegmentedControl label="Break down by" options={dims.map((value) => ({ value, label: DIMENSION_WORDS[value].tab }))} value={current} onChange={setDimension} />
        </div>
      </div>
      {slices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing used credits in this period{Object.keys(filters).length > 1 ? " with these filters" : ""}.</p>
      ) : (
        <ul className="grid gap-1">
          {slices.map((slice, index) => (
            <motion.li key={slice.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.4) }}>
              <button
                type="button"
                onClick={() => onFilters({ ...filters, [current]: slice.key })}
                className="group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${slice.label}: ${creditWords(slice.credits)}, ${Math.round(slice.share * 100)}%. Show only this.`}
              >
                <SliceMark dimension={current} sliceKey={slice.key} label={slice.label} />
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-card-foreground" title={slice.label}>
                      {slice.label}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                      {slice.items === 1 ? "1 piece of work" : `${slice.items} pieces of work`}
                    </span>
                  </span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{
                        background: current === "agent" ? agentColor(slice.key) : "var(--color-primary)",
                        boxShadow: `0 0 10px 0 color-mix(in oklab, ${current === "agent" ? agentColor(slice.key) : "var(--color-primary)"} 55%, transparent)`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${top > 0 ? Math.max(2, (slice.credits / top) * 100) : 0}%` }}
                      transition={{ duration: 0.7, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                </span>
                <span className="grid justify-items-end text-right">
                  <span className="text-sm font-medium text-card-foreground tabular-nums">{creditCount(slice.credits)}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(slice.share * 100)}%</span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">In credits. Choose a line to see only its work below.</p>
    </Panel>
  );
}

function SliceMark({ dimension, sliceKey, label }: { dimension: Dimension; sliceKey: string; label: string }) {
  if (dimension === "agent" && sliceKey !== "none") return <AgentAvatar slug={sliceKey} name={label} size="sm" />;
  const initials = label
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-content-center rounded-full bg-primary/10 text-[11px] font-medium text-primary ring-1 ring-primary/20">
      {dimension === "model" ? <Sparkle weight="duotone" className="size-4" /> : initials || <Coins weight="duotone" className="size-4" />}
    </span>
  );
}

// ------------------------------------------------------------------------------------------ the work

function WorkList({ items, onMore }: { items: UsageItems | undefined; onMore?: () => void }) {
  return (
    <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
      <h2 className="flex items-center gap-2 font-heading text-base text-card-foreground">
        <Lightning aria-hidden weight="duotone" className="size-4 text-primary" /> The work behind the numbers
      </h2>
      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading the work.</p>
      ) : items.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No work used credits in this period.</p>
      ) : (
        <>
          <ul className="grid divide-y divide-border">
            {items.items.map((item) => (
              <li key={item.key} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3">
                {item.agentSlug ? <AgentAvatar slug={item.agentSlug} name={item.agent} size="sm" /> : <SliceMark dimension="skill" sliceKey="none" label={item.kind} />}
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="rounded-md border border-border px-1.5 text-[10px] leading-4 tracking-wide text-muted-foreground uppercase">{item.kind}</span>
                    {item.href ? (
                      <Link href={item.href} className="min-w-0 truncate text-sm text-card-foreground underline-offset-2 hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate text-sm text-card-foreground">{item.title}</span>
                    )}
                  </span>
                  <span className="text-xs break-words text-muted-foreground">
                    {whenWords(item.at)} · {item.person}
                    {item.skill ? ` · ${item.skill}` : ""}
                    {item.client ? ` · ${item.client}` : ""}
                    {item.organization ? ` · ${item.organization}` : ""}
                  </span>
                  {item.models.length ? <span className="text-xs text-muted-foreground">Ran on {item.models.join(", ")}</span> : null}
                </div>
                <span className="grid justify-items-end gap-1 text-right">
                  <span className="text-sm font-medium text-card-foreground tabular-nums">{creditWords(item.credits)}</span>
                  {item.href ? (
                    <Link href={item.href} aria-label={`Open ${item.title}`} className="text-primary">
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {items.items.length} of {items.total.toLocaleString("en-US")}
            </span>
            {items.items.length < items.total && onMore ? (
              <button type="button" onClick={onMore} className="text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Show more
              </button>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------ how it works

function HowCreditsWork({ data }: { data: UsageOverview }) {
  const typical = data.typical ?? [];
  const { limits } = data;
  return (
    <section aria-labelledby="usage-how" className="grid gap-4">
      <h2 id="usage-how" className="flex items-center gap-2 font-heading text-lg text-foreground">
        <ShieldCheck aria-hidden weight="duotone" className="size-5 text-primary" /> How credits are used
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Explainer title="What a credit is" icon={<Coins aria-hidden weight="duotone" className="size-4 text-primary" />}>
          <p>
            One credit is one cent of balance. The plan adds its credits every month, and packs add more that do not expire. Every organization in the account spends from the same balance.
          </p>
          <p>
            Each piece of AI work is charged in whole credits for what it really used: the reading, searching and writing it did. Work that uses little costs little. Nothing is charged before work runs.
          </p>
        </Explainer>
        <Explainer title="What work typically uses" icon={<Gauge aria-hidden weight="duotone" className="size-4 text-primary" />}>
          {typical.length === 0 ? (
            <p>Once work has run here, this shows what each kind usually uses, from your own last 90 days.</p>
          ) : (
            <>
              <ul className="grid gap-2">
                {typical.slice(0, 8).map((row) => (
                  <li key={row.key} className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-card-foreground" title={row.label}>
                      {row.label}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {row.enough ? (row.low === row.high ? creditWords(row.median) : `${creditCount(row.low)}–${creditWords(row.high)}`) : "Not enough yet"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs">The middle half of your own pieces of work over the last 90 days, once at least three have run.</p>
            </>
          )}
        </Explainer>
        <Explainer title="Limits that apply" icon={<ShieldCheck aria-hidden weight="duotone" className="size-4 text-primary" />}>
          <ul className="grid gap-2">
            <li>Work never starts with an empty balance, and stops at the budget the person starting it confirmed.</li>
            {limits.spendApproval !== null ? <li>Work that may use more than {creditWords(limits.spendApproval)} waits for an Owner or Admin to approve it.</li> : null}
            <li>A chat stops at {creditWords(limits.chatCap)} before research is proposed.</li>
            <li>
              Auto-refill, when on, adds {creditWords(limits.autoRefill.amount)} ({dollarWords(limits.autoRefill.amount)}) when the balance drops under {creditWords(limits.autoRefill.threshold)}, at most {limits.autoRefill.maxPerMonth} times a month.
            </li>
          </ul>
          {limits.perSkill.length ? (
            <details>
              <summary className="cursor-pointer text-xs text-primary">Per skill: most per run and per day</summary>
              <ul className="mt-2 grid gap-1.5">
                {limits.perSkill.map((row) => (
                  <li key={row.skillSlug} className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-card-foreground">{row.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {creditCount(row.perRun)} / {creditCount(row.perDay)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Owners change these in{" "}
                <Link href="/app/settings?section=agents" className="text-primary underline-offset-2 hover:underline">
                  Settings
                </Link>
                .
              </p>
            </details>
          ) : null}
        </Explainer>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Plan, packs and auto-refill are in
        <Link href="/app/billing" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
          Billing <ArrowSquareOut aria-hidden className="size-3.5" />
        </Link>
      </p>
    </section>
  );
}

function Explainer({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative grid content-start gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-primary/10 to-transparent" />
      <h3 className="relative flex items-center gap-2 font-medium text-card-foreground">
        {icon} {title}
      </h3>
      <div className="relative grid gap-3">{children}</div>
    </div>
  );
}

/** Filters the server reads: the page's names for them mapped to the query's argument names. */
export function queryArgs(filters: UsageFilters) {
  return {
    period: filters.period,
    ...(filters.organization ? { organizationId: filters.organization } : {}),
    ...(filters.client ? { clientId: filters.client } : {}),
    ...(filters.agent ? { agentSlug: filters.agent } : {}),
    ...(filters.skill ? { skillSlug: filters.skill } : {}),
    ...(filters.person ? { person: filters.person } : {}),
    ...(filters.model ? { model: filters.model } : {}),
  };
}

