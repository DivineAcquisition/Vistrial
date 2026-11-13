"use client";

import {
  BookOpen,
  Calculator,
  CircleSlash,
  ClipboardList,
  Download,
  ExternalLink,
  FileSearch,
  Link2,
  Loader,
  MessageCircleQuestion,
  PenLine,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "@/components/icons";
import { AnimatePresence, MotionConfig, motion, useSpring } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { Panel } from "@/components/ui/panel";
import {
  activityFeed,
  activityTotals,
  clock,
  nowWords,
  type ActivityIcon,
  type ActivitySource,
  type ActivityStep,
  type ActivityTone,
} from "@/lib/research/activity";
import { PLATFORM_LABEL, STAGES } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { SourceIcon } from "@/components/research/source-icon";

const ICONS: Record<ActivityIcon, LucideIcon> = {
  memory: BookOpen,
  question: MessageCircleQuestion,
  brief: ClipboardList,
  search: Search,
  collect: Download,
  read: FileSearch,
  count: Calculator,
  target: Target,
  write: PenLine,
  check: ShieldCheck,
  revise: RefreshCw,
  save: Save,
  skip: CircleSlash,
  failed: TriangleAlert,
  links: Link2,
  work: Sparkles,
};

const TONE_RING: Record<ActivityTone, string> = {
  good: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  critical: "bg-destructive/10 text-destructive ring-destructive/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  brand: "bg-primary/10 text-primary ring-primary/25",
};

const STAGE_ICONS: LucideIcon[] = [Search, FileSearch, Target, PenLine, ShieldCheck];

/** Ticks once a second while `on`, so the elapsed clock moves without a server round trip. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/** The five stages as a rail: done, working (moving), and to come. */
function StageRail({ steps, open }: { steps: ActivityStep[]; open: boolean }) {
  const lastPhase = steps.at(-1)?.phase ?? null;
  const current = lastPhase ? STAGES.findIndex((stage) => (stage.phases as readonly string[]).includes(lastPhase)) : open ? 0 : -1;
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Stages">
      {STAGES.map((stage, index) => {
        const done = index < current || (!open && index <= current);
        const working = open && index === current;
        const Icon = STAGE_ICONS[index];
        return (
          <li key={stage.id} className="grid min-w-0 gap-1.5">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
              {done ? <div className="absolute inset-0 bg-success" /> : null}
              {working ? (
                <motion.div
                  className="absolute inset-y-0 w-1/2 rounded-full bg-primary"
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
            </div>
            <div className={cn("flex min-w-0 items-center gap-1 text-[11px] sm:text-xs", done ? "text-card-foreground" : working ? "font-medium text-primary" : "text-muted-foreground")}>
              <Icon aria-hidden className="hidden size-3.5 shrink-0 sm:block" />
              <span className="truncate">{stage.label}</span>
              <span className="sr-only">{done ? "done" : working ? "working" : "to come"}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Shows the real number from the first render and springs to each new value as the run moves. */
function LiveNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const spring = useSpring(value, { damping: 40, stiffness: 140 });
  const format = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(latest);
      }),
    // format depends only on decimals
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spring, decimals],
  );
  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}

function Counter({ label, value, prefix, decimals = 0 }: { label: string; value: number; prefix?: string; decimals?: number }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-xl border border-border bg-background/60 px-3 py-2">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-lg text-card-foreground">
        {prefix}
        <LiveNumber value={value} decimals={decimals} />
      </span>
    </div>
  );
}

/** A small tile for one source: platform, title and who published it. Opens the original. */
export function SourceTile({ source }: { source: ActivitySource & { url?: string } }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <SourceIcon platform={source.platform} size={14} />
        {PLATFORM_LABEL[source.platform] ?? source.platform}
        {source.url ? <ExternalLink aria-hidden className="ml-auto size-3 shrink-0 opacity-60" /> : null}
      </span>
      <span className="line-clamp-2 text-sm break-words text-card-foreground">{source.title}</span>
      {source.publisher ? <span className="truncate text-xs text-muted-foreground">{source.publisher}</span> : null}
    </>
  );
  const className = "grid min-w-0 content-start gap-1 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-primary/40";
  return source.url ? (
    <a className={className} href={source.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * The run as it happens: what it is doing now, the stage rail, running totals, and a feed of each
 * step with the sources it kept. After the run it stays as the record of how the research went.
 */
export function LiveActivity({
  steps,
  sources,
  status,
  startedAt,
  finishedAt,
}: {
  steps: ActivityStep[];
  sources: (ActivitySource & { url?: string })[];
  status: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}) {
  const working = status === "running" || status === "queued";
  const open = working || status === "waiting";
  const now = useNow(working);
  const feed = useMemo(() => activityFeed(steps, sources), [steps, sources]);
  const totals = activityTotals(steps);
  const doing = nowWords(steps, status);
  const elapsed = startedAt ? (finishedAt ?? now) - startedAt : 0;

  if (!status) {
    return (
      <Panel className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">The live work shows here once the assignment starts.</p>
      </Panel>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Panel className="relative grid gap-4 overflow-hidden p-4 sm:p-5" aria-live="polite">
        {working ? <BorderBeam duration={8} size={140} borderWidth={1} colorFrom="#9A88FC" colorTo="#6650D8" /> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className={cn("relative flex size-2.5 shrink-0", !open && "hidden")}>
              <span className={cn("absolute inline-flex size-full rounded-full opacity-60", working ? "animate-ping bg-primary" : "bg-warning")} />
              <span className={cn("relative inline-flex size-2.5 rounded-full", working ? "bg-primary" : "bg-warning")} />
            </span>
            <h2 className="font-heading text-base text-card-foreground">{open ? "Working now" : "How the research went"}</h2>
            {doing ? (
              working ? (
                <AnimatedShinyText className="mx-0 truncate text-sm">{doing}</AnimatedShinyText>
              ) : (
                <span className="truncate text-sm text-muted-foreground">{doing}</span>
              )
            ) : null}
          </div>
          {startedAt ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {working ? "Elapsed" : "Took"} {clock(elapsed)}
            </span>
          ) : null}
        </div>

        <StageRail steps={steps} open={open} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Counter label="Searches" value={totals.searches} />
          <Counter label="Pages read" value={totals.pages} />
          <Counter label="Sources kept" value={sources.length} />
          <Counter label="Steps" value={steps.length} />
        </div>

        <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border" aria-label="What it did">
          <AnimatePresence initial={false}>
            {feed.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <motion.li
                  key={item.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="relative flex min-w-0 gap-3"
                >
                  <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-1", TONE_RING[item.tone])}>
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1 pt-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium break-words text-card-foreground">{item.title}</p>
                      {item.at && startedAt ? <span className="text-xs text-muted-foreground tabular-nums">+{clock(item.at - startedAt)}</span> : null}
                    </div>
                    {item.detail ? <p className="text-sm break-words text-muted-foreground">{item.detail}</p> : null}
                    {item.sources && item.sources.length > 0 ? (
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {item.sources.map((source, index) => (
                          <motion.div
                            key={source.id}
                            className="grid"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.06 }}
                          >
                            <SourceTile source={source} />
                          </motion.div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
            {working ? (
              <motion.li key="now" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex min-w-0 gap-3">
                <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/25">
                  <Loader aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                </span>
                <p className="pt-1.5 text-sm text-primary">{doing}…</p>
              </motion.li>
            ) : null}
          </AnimatePresence>
        </ol>
      </Panel>
    </MotionConfig>
  );
}
