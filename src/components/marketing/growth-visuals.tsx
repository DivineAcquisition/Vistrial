"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  Clapperboard,
  FileText,
  Globe,
  Megaphone,
  Music2,
  Play,
  Search,
  Sparkles,
} from "lucide-react";

import { BeamFrame, GlowPanel, SpotlightCard } from "@/components/marketing/saas-frame";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { AGENTS_SECTION, EVIDENCE, GROWTH_ARCHITECT, HERO, HOW, SAFETY, SOURCES } from "@/lib/marketing/content";
import { marketingInset, marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";

/** Steps forward on a timer, and holds the last frame when motion is reduced. */
function useCycle(length: number, interval = 2600) {
  const [index, setIndex] = useState<number | "still">("still");
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current === "still" ? 0 : (current + 1) % length));
    }, interval);
    const onChange = () => {
      if (media.matches) {
        window.clearInterval(timer);
        setIndex("still");
      }
    };
    media.addEventListener("change", onChange);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("change", onChange);
    };
  }, [interval, length]);
  return index === "still" ? length - 1 : index;
}

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

const SOURCE_ICON = {
  web: Globe,
  youtube: Clapperboard,
  meta: Megaphone,
  tiktok: Music2,
  instagram: Camera,
  results: BarChart3,
} as const;

/* ---------------------------------------------------------------------------
 * Hero: the Research Studio with its visual board
 * ------------------------------------------------------------------------- */

const STUDIO_STEPS = ["Planning the research", "Collecting from sources", "Sorting what it found", "Writing the report"];

const STUDIO_SOURCES = [
  { key: "web" as const, label: "Web", state: "24 pages", tone: "good" as const },
  { key: "youtube" as const, label: "YouTube", state: "9 videos", tone: "good" as const },
  { key: "meta" as const, label: "Meta Ad Library", state: "Partial", tone: "warning" as const },
  { key: "tiktok" as const, label: "TikTok", state: "6 from links", tone: "good" as const },
];

const STUDIO_CARDS = [
  {
    platform: "Meta ad",
    advertiser: "BrightNest Cleaning",
    hook: "“Your first deep clean, done in one visit.”",
    offer: "First clean 20% off",
    running: "Running 94 days",
    tint: "from-brand-500/35 via-brand-300/15 to-transparent",
  },
  {
    platform: "YouTube Short",
    advertiser: "Austin Home Crew",
    hook: "“What a move-out clean actually covers.”",
    offer: "Free walkthrough",
    running: "41k views",
    tint: "from-info/30 via-brand-200/15 to-transparent",
  },
  {
    platform: "TikTok",
    advertiser: "Sparkle & Co",
    hook: "“Before and after: 1998 kitchen.”",
    offer: "Book online",
    running: "3 variations",
    tint: "from-warning/30 via-brand-200/10 to-transparent",
  },
];

export function ResearchStudioHero() {
  const step = useCycle(STUDIO_STEPS.length, 2400);
  const highlight = step % STUDIO_CARDS.length;
  const progress = ((step + 1) / STUDIO_STEPS.length) * 100;

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
          <p className={eyebrow}>Growth Architect · Research Studio</p>
          <p className="mt-1 font-heading text-xl tracking-tight text-strong sm:text-2xl">Deep cleaning, Austin TX</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <span className="live-pulse size-1.5 rounded-full bg-success" aria-hidden />
          Live
        </span>
      </div>

      <div className={cn(marketingInset, "p-3")}>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-strong">
            <Search className="size-3.5 text-brand-400" aria-hidden />
            <span className="live-shimmer-text">{STUDIO_STEPS[step]}</span>
          </span>
          <span className="text-muted-foreground tabular-nums">Step {step + 1} of 4</span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-overlay/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-700 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {STUDIO_SOURCES.map((source) => {
            const Icon = SOURCE_ICON[source.key];
            return (
              <li key={source.key} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-strong">{source.label}</span>
                  <span className={cn("block text-[10px]", source.tone === "warning" ? "text-warning" : "text-success")}>
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
                  <Play className="size-3.5 translate-x-px fill-strong text-strong" />
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
          Most long-running local ads lead with a first-visit discount, not with price.
        </p>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <BasisBadge basis="observed" />
          <span className="text-[10px] text-muted-foreground">11 sources</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Strip under the hero: where research comes from
 * ------------------------------------------------------------------------- */

export function SourceStrip() {
  return (
    <div className="border-y border-border bg-card">
      <div className={cn(marketingShell, marketingPageGutter, "flex flex-col gap-4 py-4 lg:flex-row lg:items-center")}>
        <p className="max-w-xs shrink-0 text-sm leading-relaxed text-muted-foreground">{SOURCES.label}</p>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {SOURCES.items.map((item) => {
            const Icon = SOURCE_ICON[item.key];
            return (
              <li key={item.key}>
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-strong">
                  <Icon className="size-4 text-brand-400" aria-hidden />
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Problem: scattered research
 * ------------------------------------------------------------------------- */

export function ScatteredScene() {
  const tabs = ["competitor-site.com", "Ad screenshot (3).png", "Strategy v4 FINAL", "Notes from call"];
  return (
    <div className={cn(marketingInset, "relative overflow-hidden p-4")} aria-hidden>
      <div className="flex gap-1.5 overflow-hidden">
        {tabs.map((tab, index) => (
          <span
            key={tab}
            className={cn(
              "shrink-0 truncate rounded-t-md border border-b-0 border-border px-2.5 py-1.5 text-[11px]",
              index === 2 ? "bg-card text-strong" : "bg-muted text-muted-foreground",
            )}
            style={{ maxWidth: "10rem" }}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="rounded-b-md rounded-tr-md border border-border bg-card p-3">
        <p className="text-xs text-strong">“Competitors seem to run discounts? Maybe test video?”</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline" size="sm">No source</Badge>
          <Badge variant="outline" size="sm">Unclear owner</Badge>
          <Badge variant="outline" size="sm">Last edited 6 weeks ago</Badge>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * How it works: the five-step doctrine
 * ------------------------------------------------------------------------- */

function DoctrineScene({ id }: { id: string }) {
  if (id === "observe") {
    return (
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {[Globe, Clapperboard, Megaphone].map((Icon, index) => (
          <span key={index} className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted">
            <Icon className="size-4 text-brand-400" />
          </span>
        ))}
      </div>
    );
  }
  if (id === "distinguish") {
    return (
      <div className="flex flex-wrap gap-1" aria-hidden>
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

export function DoctrineFlow() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {HOW.steps.map((step, index) => (
        <li key={step.id} className="relative">
          <SpotlightCard glow={index === 0} beamDelay={index * 1.8} className="flex flex-col gap-4">
            <div className="flex min-h-12 items-center">
              <div className="w-full">
                <DoctrineScene id={step.id} />
              </div>
            </div>
            <div>
              <Badge variant="outline" size="sm" className="border-border bg-muted">
                {String(index + 1).padStart(2, "0")}
              </Badge>
              <h3 className="mt-3 font-heading text-xl text-strong">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </SpotlightCard>
          {index < HOW.steps.length - 1 ? (
            <ArrowRight
              className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-brand-400 lg:block"
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------------------
 * Growth Architect: six skills, in the order they ship
 * ------------------------------------------------------------------------- */

export function SkillMap() {
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground" aria-label="How the skills build on each other">
        {GROWTH_ARCHITECT.skills.map((skill, index) => (
          <li key={skill.id} className="flex items-center gap-2">
            <span className={cn(index === 0 && "font-medium text-strong")}>{skill.name}</span>
            {index < GROWTH_ARCHITECT.skills.length - 1 ? <ArrowRight className="size-3 text-brand-300" aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GROWTH_ARCHITECT.skills.map((skill, index) => {
          const first = skill.status === "first";
          return (
            <li key={skill.id}>
              <SpotlightCard glow={first} className={cn("flex flex-col gap-3", !first && "opacity-90")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-sm text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <Badge variant={first ? "success" : "outline"} size="sm">
                    {first ? <CheckCircle2 aria-hidden /> : null}
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
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Evidence: a report where every claim carries its basis
 * ------------------------------------------------------------------------- */

const REPORT_CLAIMS: Array<{ text: string; basis: Basis; sources: string[] }> = [
  { text: "8 of 12 competitors advertise a first-visit discount.", basis: "observed", sources: ["Meta Ad Library", "4 sites"] },
  { text: "Discounts are the default hook in this market, so a guarantee would stand out.", basis: "inferred", sources: ["12 ads"] },
  { text: "A “same-week booking” angle may convert busy professionals.", basis: "hypothesis", sources: ["Test plan"] },
  { text: "Your Google leads book at twice the rate of Meta leads.", basis: "firstParty", sources: ["Your CSV"] },
  { text: "Which competitor ads are profitable.", basis: "insufficient", sources: [] },
];

export function EvidenceReport() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <GlowPanel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className={eyebrow}>Market report · {HERO.exampleLabel}</p>
            <p className="mt-0.5 text-sm font-medium text-strong">Advertising landscape</p>
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
                {claim.sources.map((source) => (
                  <span key={source} className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {source}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
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
                    <p className="font-heading text-lg text-strong">{agent.name}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{agent.job}</p>
                  </SpotlightCard>
                </li>
              ) : (
                <li key={agent.number} className={cn(marketingInset, "flex flex-col gap-1.5 border-dashed px-4 py-3")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm text-muted-foreground tabular-nums">{agent.number}</span>
                    <Badge variant="outline" size="sm">{AGENTS_SECTION.plannedLabel}</Badge>
                  </div>
                  <p className="font-medium text-strong">{agent.name}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{agent.job}</p>
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
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-strong">Market report · Deep cleaning, Austin</p>
            <p className="text-xs text-muted-foreground">Version 2 · 14 claims · 31 sources · 84¢ to research</p>
          </div>
          <Badge variant="warning" size="sm">Waiting</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <BasisBadge basis="observed" />
          <BasisBadge basis="inferred" />
          <BasisBadge basis="hypothesis" />
        </div>
        <p className="text-sm text-muted-foreground">Waiting for a person to approve. Nothing has been published.</p>
      </div>
    </BeamFrame>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className={cn(eyebrow, "mb-3")}>{children}</p>;
}
