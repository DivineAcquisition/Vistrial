"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Clapperboard,
  Clock,
  Clock3,
  Copy,
  FileText,
  Globe,
  Loader2,
  MessageSquareWarning,
  Play,
  Search,
  Sparkles,
  Split,
  TriangleAlert,
  UserX,
  Wallet,
} from "@/components/icons";

import { HoldToApprove, useCycle, useInViewSequence } from "@/components/marketing/agentic-visuals";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import { BeamFrame, GlowPanel, SpotlightCard } from "@/components/marketing/saas-frame";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { AGENT_FLOW, AGENTS_SECTION, DOCTRINE_RUN, EVIDENCE, GROWTH_ARCHITECT, HERO, HOW, PROBLEM, SAFETY } from "@/lib/marketing/content";
import { marketingInset } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";

type Basis = (typeof EVIDENCE.kinds)[number]["id"];

const BASIS_VARIANT: Record<Basis, NonNullable<BadgeProps["variant"]>> = {
  observed: "success",
  inferred: "info",
  hypothesis: "warning",
  firstParty: "default",
  insufficient: "outline",
};

const BASIS_LABEL = Object.fromEntries(EVIDENCE.kinds.map((kind) => [kind.id, kind.label])) as Record<Basis, string>;

export function BasisBadge({ basis, size = "sm" }: { basis: Basis; size?: BadgeProps["size"] }) {
  return (
    <Badge variant={BASIS_VARIANT[basis]} size={size} className="normal-case">
      {BASIS_LABEL[basis]}
    </Badge>
  );
}

/** Real platform mark where one exists; a plain icon for the open web and the customer's own results. */
const SOURCE_LOGO: Record<string, string | null> = { web: null, youtube: "youtube", meta: "meta", metaAds: "meta", tiktok: "tiktok", instagram: "instagram", pages: null, results: null };

function SourceMark({ sourceKey, size = 14 }: { sourceKey: string; size?: number }) {
  const logo = SOURCE_LOGO[sourceKey];
  if (logo) return <PlatformLogo id={logo} size={size} decorative />;
  const Icon = sourceKey === "web" ? Globe : sourceKey === "pages" ? FileText : BarChart3;
  return <Icon className="shrink-0 text-muted-foreground" style={{ width: size, height: size }} aria-hidden />;
}

/* ---------------------------------------------------------------------------
 * Hero: the Research Studio with its visual board
 * ------------------------------------------------------------------------- */

const STUDIO_STEPS = ["Planning the research", "Collecting from sources", "Sorting what it found", "Writing the report", "Waiting for your approval"];

const STUDIO_SOURCES = [
  { key: "web" as const, label: "Web", state: "24 pages", tone: "good" as const },
  { key: "youtube" as const, label: "YouTube", state: "9 videos", tone: "good" as const },
  { key: "pages" as const, label: "Landing pages", state: "3 of 4 read", tone: "warning" as const },
  { key: "tiktok" as const, label: "TikTok", state: "6 from links", tone: "good" as const },
];

/** Sample data: an agency researching the agencies it competes with. No real business is shown. */
const STUDIO_CARDS = [
  {
    platform: "Offer page",
    advertiser: "LeadForge Media",
    hook: "“Free ad account audit, then a 90-day pilot.”",
    offer: "$1,950/mo pilot",
    running: "Guarantee stated",
    tint: "from-brand-500/35 via-brand-300/15 to-transparent",
  },
  {
    platform: "YouTube",
    advertiser: "Summit Scale",
    hook: "“Why we only charge per booked appointment.”",
    offer: "From $85 a booked call",
    running: "41k views",
    tint: "from-info/30 via-brand-200/15 to-transparent",
  },
  {
    platform: "Landing page",
    advertiser: "HomePro Marketing",
    hook: "“One agency per trade, per territory.”",
    offer: "Price not stated",
    running: "11 sections read",
    tint: "from-warning/30 via-brand-200/10 to-transparent",
  },
];

export function ResearchStudioHero() {
  const step = useCycle(STUDIO_STEPS.length, 2400);
  const highlight = step % STUDIO_CARDS.length;
  const progress = ((step + 1) / STUDIO_STEPS.length) * 100;
  const waiting = step === STUDIO_STEPS.length - 1;

  return (
    <div className="space-y-4 text-left" aria-label={HERO.exampleLabel}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/20" />
          <span className="size-2 rounded-full bg-foreground/20" />
          <span className="size-2 rounded-full bg-brand-400" />
        </div>
        <Badge variant="outline" size="sm">
          {HERO.exampleLabel}
        </Badge>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={eyebrow}>Strategist · Research Studio</p>
          <p className="mt-1 font-heading text-xl tracking-tight text-strong sm:text-2xl">Home-service lead generation</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <span className="live-pulse size-1.5 rounded-full bg-success" aria-hidden />
          Live
        </span>
      </div>

      <div className={cn(marketingInset, "p-3")}>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-strong">
            {waiting ? <Clock className="size-3.5 text-warning" aria-hidden /> : <Search className="size-3.5 text-brand-400" aria-hidden />}
            <span className={waiting ? "text-warning" : "live-shimmer-text"}>{STUDIO_STEPS[step]}</span>
          </span>
          <span className="text-muted-foreground tabular-nums">
            Step {step + 1} of {STUDIO_STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-overlay/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-700 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {STUDIO_SOURCES.map((source) => {
            return (
              <li key={source.key} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
                <SourceMark sourceKey={source.key} />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-strong">{source.label}</span>
                  <span className={cn("block text-[10px]", source.tone === "warning" ? "text-flag-warning" : "text-flag-good")}>
                    {source.state}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {STUDIO_CARDS.map((card, index) => (
          <li
            key={card.advertiser}
            className={cn(
              "overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow] duration-500 motion-reduce:transition-none",
              index === highlight
                ? "border-brand-400/60 shadow-[0_0_0_3px_rgba(154,136,252,0.16)]"
                : "border-border",
            )}
          >
            <div className={cn("relative aspect-square bg-gradient-to-br sm:aspect-[16/10]", card.tint)}>
              <span className="absolute left-1.5 top-1.5 rounded-full bg-card/85 px-1.5 py-0.5 text-[9px] font-medium text-strong sm:left-2 sm:top-2 sm:text-[10px]">
                {card.platform}
              </span>
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="flex size-7 items-center justify-center rounded-full bg-card/90 shadow-sm sm:size-8">
                  {card.platform === "YouTube" ? (
                    <Play className="size-3.5 translate-x-px fill-strong text-strong" />
                  ) : (
                    <FileText className="size-3.5 text-strong" />
                  )}
                </span>
              </span>
              <span className="absolute bottom-1.5 left-1.5 hidden rounded-full bg-card/85 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:bottom-2 sm:left-2 sm:inline">
                {card.running}
              </span>
            </div>
            <div className="space-y-1 p-2 sm:p-2.5">
              <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">{card.advertiser}</p>
              <p className="line-clamp-3 text-[11px] leading-snug text-strong sm:text-xs">{card.hook}</p>
              <p className="hidden text-[10px] text-muted-foreground sm:block">Offer: {card.offer}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className={cn(marketingInset, "flex items-start justify-between gap-3 p-3")}>
        <p className="text-xs leading-relaxed text-strong">
          Two of three competing agencies state a guarantee on their offer page.
        </p>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <BasisBadge basis="observed" />
          <span className="text-[10px] text-muted-foreground">3 sources</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Problem: scattered research
 * ------------------------------------------------------------------------- */

const FLAG_ICON = [TriangleAlert, UserX, Clock3] as const;

/**
 * The "before" picture: research spread across browser tabs, with nothing to
 * back it. Tabs shrink and truncate, and only two show on phones, so the scene
 * never forces its column wider than the screen.
 */
export function ScatteredScene() {
  const { tabs, activeTab, note, flags, stamp } = PROBLEM.scene;
  return (
    <div className={cn(marketingInset, "relative min-w-0 overflow-hidden p-3 sm:p-4")} aria-hidden>
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
      </div>
      <div className="flex min-w-0 gap-1">
        {tabs.map((tab, index) => (
          <span
            key={tab}
            className={cn(
              "min-w-0 max-w-[10rem] flex-1 truncate rounded-t-md border border-b-0 border-border px-2.5 py-1.5 text-[11px]",
              index === activeTab ? "bg-card text-strong" : "bg-muted text-muted-foreground",
              (index === 0 || index === tabs.length - 1) && "hidden sm:block",
            )}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="relative rounded-b-md rounded-tr-md border border-border bg-card p-3 sm:p-4">
        <span className="absolute top-3 right-3 rotate-6 rounded-md border border-flag-warning/40 bg-card px-2 py-0.5 font-heading text-[11px] font-semibold tracking-wide text-flag-warning uppercase shadow-sm">
          {stamp}
        </span>
        <p className="pr-16 text-sm leading-relaxed text-strong">{note}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {flags.map((flag, index) => {
            const Icon = FLAG_ICON[index % FLAG_ICON.length];
            return (
              <li key={flag} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Icon className="size-3 text-flag-warning" />
                {flag}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const PAIN_ICON = [Copy, Split, MessageSquareWarning, Wallet] as const;

/** The four pains, each with its own mark, so the list scans at a glance. */
export function PainList() {
  return (
    <ul className="grid min-w-0 gap-3">
      {PROBLEM.pains.map((pain, index) => {
        const Icon = PAIN_ICON[index % PAIN_ICON.length];
        return (
          <li key={pain}>
            <SpotlightCard className="p-4">
              <div className="flex items-center gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted" aria-hidden>
                  <Icon className="size-4 text-brand-400" />
                </span>
                <p className="min-w-0 text-sm leading-relaxed text-strong">
                  <span className="mr-1.5 font-heading text-xs text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  {pain}
                </p>
              </div>
            </SpotlightCard>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * How it works: the five-step doctrine
 * ------------------------------------------------------------------------- */

export function DoctrineScene({ id }: { id: string }) {
  if (id === "observe") {
    return (
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {["web", "youtube", "tiktok"].map((key) => (
          <span key={key} className="flex h-12 items-center justify-center rounded-md border border-border bg-muted">
            <SourceMark sourceKey={key} size={16} />
          </span>
        ))}
      </div>
    );
  }
  if (id === "distinguish") {
    return (
      <div className="inline-grid grid-cols-[auto_auto] justify-start gap-1" aria-hidden>
        <BasisBadge basis="observed" />
        <BasisBadge basis="inferred" />
        <BasisBadge basis="hypothesis" />
        <BasisBadge basis="firstParty" />
      </div>
    );
  }
  if (id === "prioritize") {
    return (
      <div className="space-y-1.5" aria-hidden>
        {[92, 64, 38].map((width, index) => (
          <div key={width} className="flex items-center gap-2">
            <span className="w-3 text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
            <span className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${width}%`, opacity: 1 - index * 0.25 }} />
          </div>
        ))}
      </div>
    );
  }
  if (id === "create") {
    return (
      <div className="flex gap-1.5" aria-hidden>
        {[FileText, Clapperboard, Sparkles].map((Icon, index) => (
          <span key={index} className="flex h-12 flex-1 flex-col justify-between rounded-md border border-border bg-muted p-1.5">
            <Icon className="size-3.5 text-brand-400" />
            <span className="h-1 w-3/4 rounded-full bg-overlay/15" />
          </span>
        ))}
      </div>
    );
  }
  return (
    <svg viewBox="0 0 120 40" className="h-12 w-full" aria-hidden>
      <polyline points="0,34 20,30 40,31 60,22 80,18 100,9 120,6" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="120" cy="6" r="3" fill="var(--brand)" />
    </svg>
  );
}

export type RunState = "queued" | "running" | "done" | "waiting";

export function RunStateChip({ state }: { state: RunState }) {
  const label = DOCTRINE_RUN.labels[state];
  if (state === "done") {
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2 aria-hidden />
        {label}
      </Badge>
    );
  }
  if (state === "running") {
    return (
      <Badge variant="info" size="sm">
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        {label}
      </Badge>
    );
  }
  if (state === "waiting") {
    return (
      <Badge variant="warning" size="sm">
        <Clock aria-hidden />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" size="sm">
      <Circle aria-hidden />
      {label}
    </Badge>
  );
}

/** The five steps, played as a run when the section scrolls into view. The last step waits on the customer's results. */
export function DoctrineFlow() {
  const listRef = useRef<HTMLOListElement>(null);
  const steps = HOW.steps.length;
  // 0..steps-1 completed so far; the final step never "completes" on its own.
  const progress = useInViewSequence(listRef, steps - 1, 1100);

  const stateFor = (index: number): RunState => {
    if (index === steps - 1) return progress >= steps - 1 ? "waiting" : "queued";
    if (index < progress) return "done";
    if (index === progress) return "running";
    return "queued";
  };

  return (
    <ol ref={listRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {HOW.steps.map((step, index) => {
        const state = stateFor(index);
        const note = DOCTRINE_RUN.notes[step.id as keyof typeof DOCTRINE_RUN.notes];
        return (
          <li key={step.id} className="relative">
            <SpotlightCard
              glow={state === "running"}
              beamDelay={index * 1.8}
              className={cn("flex flex-col gap-4 transition-opacity duration-500 motion-reduce:transition-none", state === "queued" && "opacity-70")}
            >
              <div className="flex h-14 items-center overflow-hidden">
                <div className="w-full">
                  <DoctrineScene id={step.id} />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <Badge variant="outline" size="sm" className="border-border bg-muted">
                    {String(index + 1).padStart(2, "0")}
                  </Badge>
                  <RunStateChip state={state} />
                </div>
                <h3 className="mt-3 font-heading text-xl text-strong">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                {note ? (
                  <p
                    className={cn(
                      "mt-3 border-t border-border pt-3 text-xs leading-relaxed transition-colors duration-500 motion-reduce:transition-none",
                      state === "done" ? "text-strong" : "text-muted-foreground",
                    )}
                  >
                    {note}
                  </p>
                ) : null}
              </div>
            </SpotlightCard>
            {index < HOW.steps.length - 1 ? (
              <ArrowRight
                className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-brand-400 lg:block"
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------------------
 * Strategist: its skills, available ones first
 * ------------------------------------------------------------------------- */

export function SkillMap() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {GROWTH_ARCHITECT.skills.map((skill, index) => {
        const available = skill.status === "available";
        return (
          <li key={skill.id}>
            <SpotlightCard glow={available} className={cn("flex h-full flex-col gap-3", !available && "border-dashed")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading text-sm text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <Badge variant={available ? "success" : "outline"} size="sm">
                  {available ? <CheckCircle2 aria-hidden /> : null}
                  {GROWTH_ARCHITECT.statusLabel[skill.status]}
                </Badge>
              </div>
              <h3 className="font-heading text-xl text-strong">{skill.name}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{skill.handsBack}</p>
            </SpotlightCard>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Evidence: a report where every claim carries its basis
 * ------------------------------------------------------------------------- */

type Citation = { label: string; source: string; seen: string; detail: string };

const REPORT_CLAIMS: Array<{ text: string; basis: Basis; sources: Citation[] }> = [
  {
    text: "2 of 3 competing agencies state a guarantee on their offer page.",
    basis: "observed",
    sources: [
      { label: "3 offer pages", source: "web", seen: "Checked Nov 9", detail: "LeadForge Media and HomePro Marketing state a guarantee. Summit Scale does not." },
      { label: "1 video", source: "youtube", seen: "Seen Nov 9", detail: "LeadForge Media repeats the guarantee in the first 20 seconds." },
    ],
  },
  {
    text: "A stated guarantee is normal in this market, so an offer without one stands out.",
    basis: "inferred",
    sources: [{ label: "3 offer pages", source: "web", seen: "Checked Nov 9", detail: "Read from the three offer pages above." }],
  },
  {
    text: "Stating a results guarantee up front may lift booked calls.",
    basis: "hypothesis",
    sources: [{ label: "Test plan", source: "results", seen: "Not tested yet", detail: "An idea to test. It is not presented as a fact until your results show it." }],
  },
  {
    text: "Your Meta ads brought 58 conversions last month, up from 40.",
    basis: "firstParty",
    sources: [{ label: "Your Meta ad account", source: "meta", seen: "Synced Nov 9", detail: "Read from your own ad account through a read-only connection." }],
  },
  { text: "Which competitor ads are profitable.", basis: "insufficient", sources: [] },
];

function CitationChip({ citation }: { citation: Citation }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-brand-400/50 hover:text-strong focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <SourceMark sourceKey={citation.source} size={10} />
        {citation.label}
      </PopoverTrigger>
      <PopoverPopup side="top" className="w-64">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5">
            <SourceMark sourceKey={citation.source} size={16} />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-strong">{citation.label}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{citation.detail}</p>
            <p className="text-[10px] text-muted-foreground">
              {citation.seen} · {HERO.exampleLabel}
            </p>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function EvidenceReport() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <GlowPanel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className={eyebrow}>Market report · {HERO.exampleLabel}</p>
            <p className="mt-0.5 text-sm font-medium text-strong">Home-service lead generation</p>
          </div>
          <Badge variant="warning" size="sm">Waiting for approval</Badge>
        </div>
        <ul className="divide-y divide-border">
          {REPORT_CLAIMS.map((claim) => (
            <li key={claim.text} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
              <p className={cn("text-sm leading-relaxed", claim.basis === "insufficient" ? "text-muted-foreground italic" : "text-strong")}>
                {claim.text}
              </p>
              <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <BasisBadge basis={claim.basis} />
                {claim.sources.map((citation) => (
                  <CitationChip key={citation.label} citation={citation} />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 border-t border-border bg-muted px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-flag-warning" aria-hidden />
          <span>
            <span className="font-medium text-strong">{EVIDENCE.notRead.label}</span> {EVIDENCE.notRead.body}
          </span>
        </p>
      </GlowPanel>
      <ul className="grid gap-2">
        {EVIDENCE.kinds.map((kind) => (
          <li key={kind.id} className={cn(marketingInset, "flex items-start gap-3 px-4 py-3")}>
            <BasisBadge basis={kind.id} size="default" />
            <span className="text-sm leading-relaxed text-muted-foreground">{kind.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The workforce: seven agents by department
 * ------------------------------------------------------------------------- */

/** What the live agent is doing right now, in sample terms. */
function AgentStatusLine() {
  const status = useCycle(AGENT_FLOW.statuses.length, 2600);
  return (
    <p className="mt-1 flex items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
      <span className="live-pulse size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
      <span className="live-shimmer-text truncate">{AGENT_FLOW.statuses[status]}</span>
    </p>
  );
}

export function WorkforceMap() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {AGENTS_SECTION.departments.map((department) => (
        <section key={department.id} aria-labelledby={`dept-${department.id}`} className="flex flex-col gap-3">
          <h3 id={`dept-${department.id}`} className={eyebrow}>
            {department.name}
          </h3>
          <ul className="grid gap-3">
            {department.agents.map((agent) =>
              agent.live ? (
                <li key={agent.number}>
                  <SpotlightCard glow className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading text-sm text-brand-300 tabular-nums">{agent.number}</span>
                      <Badge variant="success" size="sm">
                        <span className="live-pulse size-1.5 rounded-full bg-success" aria-hidden />
                        {AGENTS_SECTION.liveLabel}
                      </Badge>
                    </div>
                    <p className="flex items-center gap-2.5 font-heading text-lg text-strong">
                      <AgentAvatar name={agent.name} size="md" />
                      {agent.name}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{agent.job}</p>
                    <AgentStatusLine />
                  </SpotlightCard>
                </li>
              ) : (
                <li key={agent.number} className={cn(marketingInset, "flex flex-col gap-1.5 border-dashed px-4 py-3")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm text-muted-foreground tabular-nums">{agent.number}</span>
                    <Badge variant="outline" size="sm">{AGENTS_SECTION.plannedLabel}</Badge>
                  </div>
                  <p className="flex items-center gap-2 font-medium text-strong">
                    <AgentAvatar name={agent.name} size="xs" className="opacity-70 grayscale" />
                    {agent.name}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{agent.job}</p>
                  {"page" in agent && agent.page ? (
                    <Link href={agent.page} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200">
                      How {agent.name} will work
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Safety: the approval path and an asset waiting on it
 * ------------------------------------------------------------------------- */

export function SafetySteps() {
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="What happens to every asset">
      {SAFETY.steps.map((step, index) => (
        <li
          key={step}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
            index === SAFETY.steps.length - 1
              ? "border-brand-400/40 bg-brand-500/10 text-strong"
              : "border-border bg-card text-strong",
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

export function AssetApprovalExample() {
  return (
    <BeamFrame className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className={eyebrow}>{HERO.exampleLabel}</p>
        <span className="size-2 rounded-full bg-brand-400" aria-hidden />
      </div>
      <div className="p-4">
        <HoldToApprove>
          {(approved) => (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-strong">Market report · Home-service lead generation</p>
                  <p className="text-xs text-muted-foreground">Version 2 · 14 claims · 31 sources · 84¢ to research</p>
                </div>
                <Badge variant={approved ? "success" : "warning"} size="sm">
                  {approved ? "Approved" : "Waiting"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <BasisBadge basis="observed" />
                <BasisBadge basis="inferred" />
                <BasisBadge basis="hypothesis" />
              </div>
              {approved ? null : (
                <p className="text-sm text-muted-foreground">Waiting for a person to approve. Nothing has been published.</p>
              )}
            </>
          )}
        </HoldToApprove>
      </div>
    </BeamFrame>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className={cn(eyebrow, "mb-3")}>{children}</p>;
}
