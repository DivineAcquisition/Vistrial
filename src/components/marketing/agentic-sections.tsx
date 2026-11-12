"use client";

import { useId, useRef, useState } from "react";

import { ArrowRight, CheckCircle2, Clock, Target } from "@/components/icons";
import { useInViewSequence } from "@/components/marketing/agentic-visuals";
import { DoctrineScene, RunStateChip, type RunState } from "@/components/marketing/growth-visuals";
import { Badge } from "@/components/ui/badge";
import { DOCTRINE_RUN, GROWTH_ARCHITECT, HERO, HOW, LOOP_DEMO } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * Three places where the page shows the work instead of describing it: the run as a timeline a
 * visitor can drag through, the loop a change goes through, and the plan each skill runs. Each plays
 * once when it scrolls into view, then answers to the visitor. With reduced motion the last frame is
 * shown at once.
 */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";

/* ---------------------------------------------------------------------------
 * How it works: one run, replayable
 * ------------------------------------------------------------------------- */

export function RunTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const last = HOW.steps.length - 1;
  const played = useInViewSequence(ref, last, 1500);
  const [picked, setPicked] = useState<number | null>(null);
  const position = picked ?? played;
  const { replay } = DOCTRINE_RUN;

  const stateFor = (index: number): RunState => {
    if (index < position) return "done";
    if (index > position) return "queued";
    return index === last ? "waiting" : "running";
  };

  const step = HOW.steps[position];
  const did = replay.did[step.id as keyof typeof replay.did];

  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-36px_rgba(var(--brand-rgb),0.7)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <p className={eyebrow}>
          {replay.label} · {HERO.exampleLabel}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums" aria-hidden>
          {replay.stage} {position + 1} {replay.of} {HOW.steps.length}
        </p>
      </div>

      <div className="px-4 pt-5 sm:px-5">
        {/* The five stages. Each is a button, so the run can be stepped by keyboard as well as dragged. */}
        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {HOW.steps.map((item, index) => {
            const state = stateFor(index);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPicked(index)}
                  aria-current={index === position ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-lg border px-2 py-2 text-left transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none sm:px-3 sm:py-2.5",
                    index === position ? "border-brand-500/50 bg-brand-500/10" : state === "done" ? "border-border bg-muted" : "border-dashed border-border bg-transparent",
                  )}
                >
                  <span className={cn("font-heading text-xs tabular-nums", index <= position ? "text-brand-300" : "text-muted-foreground")}>{String(index + 1).padStart(2, "0")}</span>
                  {/* On a phone the five titles do not fit, so only the numbers show. The stage in view is named below. */}
                  <span className={cn("sr-only text-sm font-medium sm:not-sr-only sm:truncate", index <= position ? "text-strong" : "text-muted-foreground")}>{item.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-4">
          <label htmlFor={sliderId} className="sr-only">
            {replay.scrub}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={last}
            step={1}
            value={position}
            onChange={(event) => setPicked(Number(event.target.value))}
            aria-valuetext={`${replay.stage} ${position + 1}: ${step.title}`}
            className="run-scrubber block h-6 w-full cursor-pointer accent-brand-500"
          />
          <p className="mt-0.5 text-xs text-muted-foreground" aria-hidden>
            {replay.scrub}
          </p>
        </div>
      </div>

      <div key={step.id} className="live-enter grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1fr] lg:gap-8">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-heading text-2xl tracking-tight text-strong">{step.title}</h3>
            <RunStateChip state={stateFor(position)} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.body}</p>
          <div className="mt-4 flex h-14 max-w-[15rem] items-center">
            <div className="w-full">
              <DoctrineScene id={step.id} />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="text-xs font-medium text-muted-foreground">{replay.didTitle}</p>
          <ul className="mt-2.5 grid gap-2">
            {did.map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-strong">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The loop: one change, from proposed to measured
 * ------------------------------------------------------------------------- */

export function LoopDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const last = LOOP_DEMO.stages.length - 1;
  const played = useInViewSequence(ref, last, 1700);
  const [picked, setPicked] = useState<number | null>(null);
  const position = picked ?? played;
  const { change } = LOOP_DEMO;

  return (
    <div ref={ref} className="grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
      <div>
        <h3 className="font-heading text-2xl tracking-tight text-strong sm:text-[1.75rem]">{LOOP_DEMO.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{LOOP_DEMO.lead}</p>
        <ol className="mt-5 grid gap-1.5">
          {LOOP_DEMO.stages.map((stage, index) => (
            <li key={stage.id}>
              <button
                type="button"
                onClick={() => setPicked(index)}
                aria-current={index === position ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
                  index === position ? "border-brand-500/50 bg-brand-500/10 font-medium text-strong" : index < position ? "border-border bg-muted text-strong" : "border-dashed border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border font-heading text-xs tabular-nums",
                    index <= position ? "border-brand-500/50 bg-card text-brand-300" : "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {index < position ? <CheckCircle2 className="size-3.5" /> : index + 1}
                </span>
                <span className="sr-only">
                  {LOOP_DEMO.stageLabel} {index + 1}:
                </span>
                {stage.name}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-36px_rgba(var(--brand-rgb),0.7)]">
        <p className={cn(eyebrow, "border-b border-border px-4 py-3 sm:px-5")}>{HERO.exampleLabel}</p>
        <div className="p-4 sm:p-5">
          <p className="font-heading text-lg tracking-tight text-strong">{change.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{change.body}</p>
          <div className="mt-3 rounded-lg bg-muted px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="size-3.5 text-brand-400" aria-hidden />
              {change.howLabel}
            </p>
            <p className="mt-1 text-sm text-strong">{change.how}</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{change.evidence}</p>

          {/* What the card shows at each step. The height is held so the page does not jump. */}
          <div key={position} className="live-enter mt-4 min-h-[9.5rem] border-t border-border pt-4" aria-live="polite">
            {position === 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPicked(1)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-500/50 bg-brand-500/10 px-3.5 text-sm font-medium text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <Target className="size-4 text-brand-400" aria-hidden />
                  {LOOP_DEMO.tryButton}
                </button>
                <span className="text-sm text-muted-foreground">
                  {LOOP_DEMO.checkBack} <span className="font-medium text-strong">{LOOP_DEMO.days}</span>
                </span>
              </div>
            ) : null}
            {position === 1 ? (
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <Clock className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                <span>
                  <span className="font-medium text-strong">{LOOP_DEMO.trying}</span> {LOOP_DEMO.tryingNote}
                </span>
              </p>
            ) : null}
            {position === 2 ? (
              <div>
                <p className="text-sm font-medium text-strong">{LOOP_DEMO.due}</p>
                <p className="mt-2 text-sm text-muted-foreground">{LOOP_DEMO.question}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {LOOP_DEMO.answers.map((answer) => (
                    <li key={answer}>
                      {answer === LOOP_DEMO.chosen ? (
                        <button
                          type="button"
                          onClick={() => setPicked(3)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-500/50 bg-brand-500/10 px-3 text-sm font-medium text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          {answer}
                          <ArrowRight className="size-3.5 text-brand-400" aria-hidden />
                        </button>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">{answer}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {position === 3 ? (
              <div>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="success" size="sm">
                    <CheckCircle2 aria-hidden />
                    {LOOP_DEMO.chosen}
                  </Badge>
                  {LOOP_DEMO.recorded}
                </p>
                <ul className="mt-3 grid gap-1.5">
                  {LOOP_DEMO.changes.map((row) => (
                    <li key={row.label} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="text-strong">{row.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.before} → {row.after}
                      </span>
                      <span className={cn("font-medium tabular-nums", row.good ? "text-flag-good" : "text-muted-foreground")}>({row.change})</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setPicked(0)}
                  className="mt-3 text-xs font-medium text-brand-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {LOOP_DEMO.replay}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Growth Architect: pick a skill, see the plan it runs
 * ------------------------------------------------------------------------- */

export function SkillPlans() {
  const [picked, setPicked] = useState(0);
  const skill = GROWTH_ARCHITECT.skills[picked];
  const available = skill.status === "available";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <ul className="grid gap-1.5" aria-label={GROWTH_ARCHITECT.pick}>
        {GROWTH_ARCHITECT.skills.map((item, index) => {
          const on = index === picked;
          const live = item.status === "available";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setPicked(index)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
                  on ? "border-brand-500/50 bg-brand-500/10" : live ? "border-border bg-card hover:bg-muted" : "border-dashed border-border bg-transparent hover:bg-muted",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="font-heading text-sm text-muted-foreground tabular-nums" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={cn("truncate font-medium", live ? "text-strong" : "text-muted-foreground")}>{item.name}</span>
                </span>
                <Badge variant={live ? "success" : "outline"} size="sm">
                  {live ? <CheckCircle2 aria-hidden /> : null}
                  {GROWTH_ARCHITECT.statusLabel[item.status]}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>

      <div key={skill.id} className="live-enter rounded-xl border border-border bg-card p-5 shadow-[0_24px_60px_-36px_rgba(var(--brand-rgb),0.7)] sm:p-6" aria-live="polite">
        <h3 className="font-heading text-2xl tracking-tight text-strong">{skill.name}</h3>
        <p className="mt-4 text-xs font-medium text-muted-foreground">{GROWTH_ARCHITECT.handsBackTitle}</p>
        <p className="mt-1 text-sm leading-relaxed text-strong sm:text-[15px]">{skill.handsBack}</p>

        <p className="mt-5 text-xs font-medium text-muted-foreground">{GROWTH_ARCHITECT.planTitle}</p>
        {available ? (
          <ol className="relative mt-2.5 grid gap-2">
            <span aria-hidden className="absolute top-3 bottom-3 left-3 w-px bg-border" />
            {skill.plan.map((line, index) => {
              const waits = index === skill.plan.length - 1;
              return (
                <li key={line} className="relative flex gap-3 text-sm leading-relaxed text-strong">
                  <span
                    className={cn(
                      "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card font-heading text-xs tabular-nums",
                      waits ? "border-brand-500 text-brand-300" : "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {waits ? <Clock className="size-3.5" /> : index + 1}
                  </span>
                  <span className={cn("pt-0.5", waits && "font-medium")}>{line}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2.5 rounded-lg border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">{GROWTH_ARCHITECT.notYet}</p>
        )}
      </div>
    </div>
  );
}
