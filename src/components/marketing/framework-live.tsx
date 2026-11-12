"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { ArrowRight, Check, CheckCircle2, Clock, Loader2, RefreshCw } from "@/components/icons";
import { useCycle, useInViewSequence } from "@/components/marketing/agentic-visuals";
import { BorderBeam } from "@/components/ui/border-beam";
import { AGENT_FLOW } from "@/lib/marketing/content";
import { LIVE, LOOP, PICTURE_NOTE, PROCESS, ROLES, type Picture } from "@/lib/marketing/landing";
import { cn } from "@/lib/utils";

/**
 * The parts of the framework page that move. The page is about agents doing work, so the loop runs,
 * the process ticks through, the agents' list fills in, and the app's screens are shown the way the
 * app is used: one after another. Every animation holds its last frame when motion is reduced.
 */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";

/** A step counter that never runs when the visitor asks for reduced motion. `null` means still. */
function useTicker(length: number, interval: number, paused = false) {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || document.documentElement.getAttribute("data-calm") === "true") return;
    // The first tick comes at once, so the page is seen to be running; the rest keep the interval.
    const first = window.setTimeout(() => setIndex((current) => current ?? 0), 0);
    if (paused) return () => window.clearTimeout(first);
    const timer = window.setInterval(() => setIndex((current) => ((current ?? 0) + 1) % length), interval);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [interval, length, paused]);
  return index;
}

/** The light that travels a frame's edge. Hidden when motion is reduced. */
function Beam({ delay = 0 }: { delay?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden>
      <BorderBeam delay={delay} duration={8} size={110} borderWidth={1} colorFrom="#9A88FC" colorTo="#C3B6FE" />
    </div>
  );
}

/** What the live agent is doing, in sample terms. The same line the current page shows. */
export function AgentStatus({ className }: { className?: string }) {
  const status = useCycle(AGENT_FLOW.statuses.length, 2600);
  return (
    <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className="live-pulse size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
      <span className="shrink-0 font-medium text-strong">{LIVE.agent}</span>
      <span className="live-shimmer-text truncate">{AGENT_FLOW.statuses[status]}</span>
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * The loop, running: each step lights up in turn, then it goes round again.
 * ------------------------------------------------------------------------- */

export function LiveLoop() {
  const active = useTicker(LOOP.steps.length, 1900);
  return (
    <figure className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[0_0_72px_-36px_rgba(var(--brand-rgb),0.9)] sm:p-6">
      <Beam />
      <figcaption className={cn(eyebrow, "relative")}>{LOOP.title}</figcaption>
      <ol className="relative mt-5 grid gap-2 lg:grid-cols-5 lg:gap-0">
        {LOOP.steps.map((step, index) => {
          const yours = step.by === "you";
          const on = active === index;
          const passed = active !== null && index < active;
          return (
            <li key={step.id} className="relative flex gap-3 lg:flex-col lg:gap-0 lg:pr-4">
              {/* The line to the next step: down the side on a phone, along the top on a desktop. It fills as the loop passes. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-9 bottom-[-0.5rem] left-[17px] w-px transition-colors duration-700 motion-reduce:transition-none lg:top-[17px] lg:right-0 lg:bottom-auto lg:left-9 lg:h-px lg:w-auto",
                  passed ? "bg-brand-500" : "bg-border",
                  index === LOOP.steps.length - 1 && "hidden",
                )}
              />
              <span
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border font-heading text-sm tabular-nums transition-all duration-500 motion-reduce:transition-none",
                  yours ? "border-brand-500 bg-brand-500 text-primary-foreground" : "border-brand-500/40 bg-card text-brand-300",
                  on && "scale-110 shadow-[0_0_0_6px_rgba(var(--brand-rgb),0.18)]",
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 pb-4 lg:mt-3 lg:pb-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-heading text-base tracking-tight", on ? "live-shimmer-text" : "text-strong")}>{step.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase", yours ? "bg-brand-500/15 text-brand-300" : "bg-muted text-muted-foreground")}>
                    {LOOP.who[step.by]}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="relative mt-5 flex items-center gap-2 border-t border-dashed border-border pt-4 text-sm text-strong">
        <RefreshCw className={cn("size-4 shrink-0 text-brand-300", active !== null && "animate-spin [animation-duration:6s] motion-reduce:animate-none")} aria-hidden />
        {LOOP.again}
      </p>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * The app, shown the way it is used: one real screen after another.
 * ------------------------------------------------------------------------- */

const TOUR_MS = 5200;

export function AppTour({ pictures }: { pictures: Picture[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const auto = useTicker(pictures.length, TOUR_MS, picked !== null || held);
  const index = picked ?? auto ?? 0;
  const picture = pictures[index];
  if (!picture?.file) return null;
  const running = picked === null && auto !== null && !held;
  // A short screen sits in the middle of the stage. The stage keeps one height, so nothing below it jumps.
  const short = picture.height / picture.width < 0.5;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_0_80px_-32px_rgba(var(--brand-rgb),0.9)]"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <Beam delay={1.2} />
      <div className="relative flex items-center gap-3 border-b border-border bg-muted px-3 py-2.5 sm:px-4">
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-brand-400" />
        </div>
        <p className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="live-pulse size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="shrink-0 font-medium text-strong">{LIVE.agent}</span>
          <span key={picture.id} className="live-enter truncate">
            {picture.doing}
          </span>
        </p>
      </div>

      {/* The screens. Each is a button; the one in view fills as its turn runs. */}
      <ul className="relative grid grid-cols-2 gap-1.5 border-b border-border p-2 sm:grid-cols-4" aria-label={LIVE.tourLabel}>
        {pictures.map((item, position) => {
          const on = position === index;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setPicked(position)}
                aria-pressed={on}
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
                  on ? "border-brand-500/50 bg-brand-500/10 text-strong" : "border-transparent text-muted-foreground hover:bg-muted hover:text-strong",
                )}
              >
                {item.tab ?? item.title}
                {on && running ? <span key={`${item.id}-${auto}`} aria-hidden className="tour-fill absolute inset-x-0 bottom-0 h-0.5 bg-brand-500" style={{ animationDuration: `${TOUR_MS}ms` }} /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <figure className="relative">
        <div key={picture.id} className={cn("live-enter relative flex h-[24rem] overflow-hidden sm:h-[34rem]", short ? "items-center" : "items-start")}>
          {/* On a phone the picture is shown larger and cut at the right edge, so its words stay readable. */}
          <Image
            src={`/marketing/product/${picture.file}.png`}
            alt={picture.alt}
            width={picture.width}
            height={picture.height}
            sizes="(min-width: 1152px) 1152px, 100vw"
            // Pictures are captured at twice their size, so half the file's width is the sharpest a screen can be shown.
            style={{ maxWidth: picture.width / 2 }}
            className={cn("h-auto shrink-0 sm:mx-auto sm:w-full sm:shrink", picture.phone === "fit" ? "w-full" : "w-[200%]")}
          />
          {short ? null : <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />}
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-4 py-3">
          <span className="text-sm font-medium text-strong">{picture.title}</span>
          <span className="text-xs text-muted-foreground">{PICTURE_NOTE}</span>
        </figcaption>
      </figure>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Process: the steps tick through as a run does. The reader's time sits apart.
 * ------------------------------------------------------------------------- */

export function LiveProcess() {
  const ref = useRef<HTMLOListElement>(null);
  const reached = useInViewSequence(ref, PROCESS.steps.length, 1000);
  return (
    <ol ref={ref} className="relative">
      <span aria-hidden className="absolute top-5 bottom-5 left-5 w-px bg-border" />
      <span
        aria-hidden
        className="absolute top-5 left-5 w-px bg-brand-500 transition-[height] duration-700 motion-reduce:transition-none"
        style={{ height: `calc(${Math.min(100, (reached / PROCESS.steps.length) * 100)}% - 2.5rem)` }}
      />
      {PROCESS.steps.map((step, index) => {
        const done = index < reached;
        const running = index === reached;
        return (
          <li key={step.title} className="relative grid gap-x-6 gap-y-3 pb-6 pl-16 last:pb-0 sm:grid-cols-[1fr_13rem] sm:items-center">
            <span
              className={cn(
                "absolute top-0 left-0 z-10 flex size-10 items-center justify-center rounded-full border font-heading text-base tabular-nums transition-colors duration-500 motion-reduce:transition-none",
                done ? "border-brand-500 bg-brand-500 text-primary-foreground" : running ? "border-brand-500 bg-card text-brand-300 shadow-[0_0_0_6px_rgba(var(--brand-rgb),0.16)]" : "border-border bg-card text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? <Check className="size-4" /> : running ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : index + 1}
            </span>
            <div className={cn("transition-opacity duration-500 motion-reduce:transition-none", !done && !running && "opacity-60")}>
              <h3 className="font-heading text-lg tracking-tight text-strong sm:text-xl">
                <span className="sr-only">{index + 1}. </span>
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.body}</p>
            </div>
            <p className="flex items-center gap-2.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3.5 py-2.5">
              <Clock className="size-4 shrink-0 text-brand-300" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-[0.14em] text-brand-300 uppercase">{PROCESS.timeLabel}</span>
                <span className="block text-sm font-medium text-strong">{step.time}</span>
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------------------
 * Roles: your short list stays still. The agents' long list gets done.
 * ------------------------------------------------------------------------- */

export function LiveRoles() {
  const ref = useRef<HTMLDivElement>(null);
  const done = useInViewSequence(ref, ROLES.ours.items.length, 260);
  return (
    <div ref={ref} className="grid items-start gap-4 lg:grid-cols-[0.55fr_1.45fr]">
      <div className="rounded-xl border border-border bg-muted p-5 sm:p-6">
        <h3 className="flex items-baseline justify-between gap-3">
          <span className="font-heading text-xl tracking-tight text-strong">{ROLES.yours.title}</span>
          <span className="font-heading text-sm text-muted-foreground tabular-nums" aria-hidden>
            {ROLES.yours.items.length}
          </span>
        </h3>
        <ul className="mt-4 grid gap-2.5">
          {ROLES.yours.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-strong">
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-brand-500/35 bg-card p-5 shadow-[0_0_72px_-32px_rgba(var(--brand-rgb),0.9)] sm:p-6">
        <Beam delay={2.4} />
        <h3 className="relative flex items-baseline justify-between gap-3">
          <span className="font-heading text-xl tracking-tight text-strong">{ROLES.ours.title}</span>
          <span className="font-heading text-sm text-brand-300 tabular-nums" aria-hidden>
            {Math.min(done, ROLES.ours.items.length)} / {ROLES.ours.items.length}
          </span>
        </h3>
        <AgentStatus className="relative mt-2" />
        <ul className="relative mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {ROLES.ours.items.map((item, index) => {
            const ticked = index < done;
            return (
              <li key={item} className={cn("flex gap-2.5 text-sm leading-relaxed transition-colors duration-500 motion-reduce:transition-none", ticked ? "text-strong" : "text-muted-foreground")}>
                {ticked ? (
                  <CheckCircle2 className="live-enter mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                ) : (
                  <span className="mt-0.5 size-4 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
                )}
                {item}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
