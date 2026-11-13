"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ArrowUp, CalendarIcon, Check, CheckCircle2, CircleDashed, MessageCircleQuestion, ShieldCheck, Target, User, Users, X } from "@/components/icons";
import { AgentAvatar } from "@/components/live/agent-avatar";
import { BasisBadge } from "@/components/marketing/growth-visuals";
import { ModelLogo } from "@/components/models/model-mark";
import { BorderBeam } from "@/components/ui/border-beam";
import {
  AD_SET,
  APP_VISUALS,
  BRIEFING,
  CLIENTS,
  HOME,
  OFFER_COMPARE,
  PAGE_TEARDOWN,
  RESULTS,
  TASKS,
  TEST_PLAN,
  TOUR,
  type Model,
  type TaskCard,
} from "@/lib/marketing/app-visuals";
import { cn } from "@/lib/utils";

/**
 * The app, drawn in the page's own parts. Each visual is a simplified drawing of a real screen and
 * reflows to fit its window: one column on a phone, more on a wide screen. Nothing is a picture, so
 * nothing is scaled or cut off. `scripts/check-landing-overflow.cjs` fails if anything here runs past
 * its window. The site is white only, and the tour holds still when motion is reduced.
 */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";
const chip = "inline-flex max-w-full items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] leading-snug text-muted-foreground";
const clientChip = "inline-flex max-w-full items-center rounded-full border border-brand-500/35 px-2 py-0.5 text-[11px] leading-snug text-brand-300";
/** Buttons in a drawing are drawn, not pressed, so they are plain text to a screen reader. */
const drawnPrimary = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-primary-foreground";
const drawnOutline = "inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-strong";
const drawnText = "inline-flex h-8 items-center px-1 text-xs font-medium text-muted-foreground";

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

/** True on a screen wide enough to hold every tab's screen at one height. False until the page has loaded. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

/** The light that travels a window's edge. Decoration only, and hidden when motion is reduced. */
function Beam({ delay = 0 }: { delay?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden data-decor>
      <BorderBeam delay={delay} duration={8} size={110} borderWidth={1} colorFrom="#9A88FC" colorTo="#C3B6FE" />
    </div>
  );
}

function WindowDots() {
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
      <span className="size-2 rounded-full bg-foreground/15" />
      <span className="size-2 rounded-full bg-foreground/15" />
      <span className="size-2 rounded-full bg-brand-400" />
    </span>
  );
}

/** Which model did the work, as the app marks it: the maker's mark and the model's name. */
function Mark({ model, className }: { model: Model; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <ModelLogo family={model.family} className="size-3" />
      <span className="sr-only">Made with </span>
      {model.name}
    </span>
  );
}

/** A window with a title bar. Everything inside wraps; the window never scrolls sideways. */
function Window({ who, what, title, beam, className, children }: { who: string; what: string; title: string; beam?: number; className?: string; children: ReactNode }) {
  return (
    <figure data-window className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_50px_-32px_rgba(11,10,17,0.45)]", className)}>
      {beam === undefined ? null : <Beam delay={beam} />}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted px-3 py-2">
        <WindowDots />
        <p className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {who === APP_VISUALS.agent ? <AgentAvatar name={who} size="xs" className="size-5" /> : null}
          <span>
            {who} · <span className="font-medium text-strong">{what}</span>
          </span>
        </p>
      </div>
      <div className="relative min-w-0 flex-1 p-3 sm:p-4">{children}</div>
      <figcaption className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-3 py-2.5 sm:px-4">
        <span className="text-sm font-medium text-strong">{title}</span>
        <span className="text-xs text-muted-foreground">{APP_VISUALS.note}</span>
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * Tasks: proposed work with its expected return, credit cost and evidence.
 * ------------------------------------------------------------------------- */

const COLUMN_TONE: Record<TaskCard["state"], { head: string; dot: string; edge: string }> = {
  proposed: { head: "bg-muted", dot: "bg-muted-foreground", edge: "border-l-muted-foreground/50" },
  approved: { head: "bg-info/8", dot: "bg-info", edge: "border-l-info" },
  running: { head: "bg-brand-500/10", dot: "bg-brand-500", edge: "border-l-brand-500" },
};

function TaskCardView({ card }: { card: TaskCard }) {
  return (
    <article className={cn("min-w-0 rounded-xl border border-l-2 border-border bg-card p-3", COLUMN_TONE[card.state].edge)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <AgentAvatar name={APP_VISUALS.agent} size="xs" className="size-5" working={card.state === "running"} />
        <span className={chip}>{card.kind}</span>
        <span className={clientChip}>{card.client}</span>
      </div>
      {card.model ? <Mark model={card.model} className="mt-2" /> : null}
      <p className="mt-2 text-sm leading-snug font-medium text-strong">{card.title}</p>
      <div className="mt-2.5 rounded-lg bg-muted p-2.5 text-xs">
        <p className="text-muted-foreground">{TASKS.expectedLabel}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 font-medium text-strong">
          {card.expected ?? null}
          <BasisBadge basis={card.basis} />
        </p>
        {card.estimate ? <p className="mt-1 text-muted-foreground">{card.estimate}</p> : null}
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border pt-2">
          <span className="text-muted-foreground">{TASKS.costLabel}</span>
          <span className="font-medium text-strong">{card.cost}</span>
        </p>
        <p className="mt-1.5 text-muted-foreground">{card.evidence}</p>
      </div>
      {card.state === "proposed" ? (
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span className={drawnPrimary}>
            <Check className="size-3.5" aria-hidden />
            {TASKS.actions.approve}
          </span>
          <span className={drawnOutline}>{TASKS.actions.edit}</span>
          <span className={drawnText}>{TASKS.actions.skip}</span>
        </p>
      ) : card.state === "running" ? (
        <p className="mt-3 flex items-center gap-2 text-xs">
          <span className="live-pulse size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <span className="live-shimmer-text font-medium text-strong">{card.foot}</span>
        </p>
      ) : (
        <p className="mt-3 text-xs font-medium text-strong">{card.foot}</p>
      )}
    </article>
  );
}

function TasksScreen() {
  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-3">
      {TASKS.columns.map((column) => {
        const cards = TASKS.cards.filter((card) => card.state === column.id);
        const tone = COLUMN_TONE[column.id];
        return (
          <section key={column.id} className="min-w-0" aria-label={column.name}>
            <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 text-xs", tone.head)}>
              <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
              <span className="text-sm font-medium text-strong">{column.name}</span>
              <span className="rounded-full bg-card px-1.5 text-[11px] text-muted-foreground tabular-nums">{cards.length}</span>
              <span className="ml-auto text-muted-foreground">{column.note}</span>
            </p>
            <div className="mt-2 grid gap-2">
              {cards.map((card) => (
                <TaskCardView key={card.id} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Briefing: the post that asks, and the approval beside it.
 * ------------------------------------------------------------------------- */

function BriefingScreen() {
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5">
        {BRIEFING.filters.map((filter) => (
          <li
            key={filter.name}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              "on" in filter && filter.on ? "border-brand-500/50 bg-brand-500/10 font-medium text-strong" : "border-border text-muted-foreground",
            )}
          >
            {filter.name}
            <span className="tabular-nums">{filter.count}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        {BRIEFING.posts.map((post) => (
          <article key={post.id} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-warning/8 text-warning-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
              </span>
              <span className="font-medium text-strong">{BRIEFING.kind}</span>
              <AgentAvatar name={APP_VISUALS.agent} size="xs" className="size-5" />
              <span>{APP_VISUALS.agent}</span>
              <span className={clientChip}>{post.client}</span>
              <span>{post.when}</span>
              <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{BRIEFING.fresh}</span>
            </div>
            <p className="mt-2.5 text-sm leading-snug font-medium text-strong">{post.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">{post.body}</p>
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/8 p-3">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                <span className="font-medium text-strong">{post.reason}</span>
                {post.cost ? <span className="text-muted-foreground">{post.cost}</span> : null}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span className={drawnPrimary}>
                  <Check className="size-3.5" aria-hidden />
                  {BRIEFING.actions.approve}
                </span>
                <span className={drawnText}>{BRIEFING.actions.decline}</span>
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Home: ask, what needs you, and what changed.
 * ------------------------------------------------------------------------- */

function HomeScreen() {
  return (
    <div className="grid gap-4">
      <div className="mx-auto w-full max-w-2xl text-center">
        <p className="font-heading text-lg tracking-tight text-strong sm:text-xl">{HOME.ask}</p>
        <div className="mt-3 flex items-end gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-[0_18px_40px_-28px_rgba(var(--brand-rgb),0.7)]">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{HOME.placeholder}</p>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300" aria-hidden>
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-strong">
            {HOME.needsTitle}
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular-nums">{HOME.needs.length}</span>
          </p>
          <ul className="mt-2 grid gap-2">
            {HOME.needs.map((item) => (
              <li key={item.id} className="flex min-w-0 gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/8 text-warning-foreground" aria-hidden>
                  {item.id === "question" ? <MessageCircleQuestion className="size-4" /> : item.id === "approval" ? <ShieldCheck className="size-4" /> : <CalendarIcon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-strong">{item.kind}</span>
                    <span>{APP_VISUALS.agent}</span>
                    <span className={clientChip}>{item.client}</span>
                  </p>
                  <p className="mt-1.5 text-sm leading-snug font-medium text-strong">{item.title}</p>
                  {"approval" in item ? (
                    <div className="mt-2 rounded-lg border border-warning/30 bg-warning/8 p-2.5">
                      <p className="text-xs font-medium text-strong">{item.approval}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={drawnPrimary}>
                          <Check className="size-3.5" aria-hidden />
                          {HOME.actions.approve}
                        </span>
                        <span className={drawnText}>{HOME.actions.decline}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs font-medium text-brand-300">{item.action}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0">
          <p className="text-sm font-medium text-strong">{HOME.sinceTitle}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {HOME.since.map((figure) => (
              <li key={figure.label} className="min-w-0 rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{figure.label}</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-heading text-xl text-strong tabular-nums">{figure.value}</span>
                  <span className="text-xs text-muted-foreground">{figure.was}</span>
                  <span className={cn("text-xs font-medium tabular-nums", figure.good ? "text-success-foreground" : "text-muted-foreground")}>{figure.change}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Clients: who the agency works for, and who on the team can see each one.
 * ------------------------------------------------------------------------- */

function ClientsScreen() {
  const { profile } = CLIENTS;
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <ul className="grid content-start gap-1.5">
        {CLIENTS.list.map((client) => {
          const on = "on" in client && client.on;
          return (
            <li key={client.name} className={cn("flex min-w-0 items-center gap-3 rounded-xl border p-2.5", on ? "border-brand-500/50 bg-brand-500/10" : "border-transparent")}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-300" aria-hidden>
                {"person" in client && client.person ? <User className="size-4" /> : <Users className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-strong">{client.name}</span>
                <span className="block text-xs text-muted-foreground">{client.line}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid min-w-0 gap-3">
        <section className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-sm font-medium text-strong">{profile.name}</p>
          <p className="text-xs text-muted-foreground">{profile.kind}</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {profile.fields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">{field.label}</dt>
                <dd className="mt-1 rounded-lg bg-muted px-2.5 py-2 text-xs leading-snug text-strong">{field.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{profile.note}</p>
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-sm font-medium text-strong">{CLIENTS.accessTitle}</p>
          <ul className="mt-2 divide-y divide-border">
            {CLIENTS.access.map((person) => (
              <li key={person.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-strong">{person.name}</span>
                  <span className="block text-xs text-muted-foreground">{person.role}</span>
                </span>
                {person.sees === "all" ? (
                  <span className="text-xs text-muted-foreground">{CLIENTS.everyClient}</span>
                ) : (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="sr-only">{person.sees === "on" ? CLIENTS.canSee : CLIENTS.cannotSee}</span>
                    <span aria-hidden className={cn("flex h-5 w-9 items-center rounded-full p-0.5", person.sees === "on" ? "justify-end bg-brand-500" : "justify-start bg-foreground/15")}>
                      <span className="size-4 rounded-full bg-card shadow-sm" />
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const SCREENS: Record<(typeof TOUR)[number]["id"], () => ReactNode> = {
  tasks: TasksScreen,
  briefing: BriefingScreen,
  home: HomeScreen,
  clients: ClientsScreen,
};

/* ---------------------------------------------------------------------------
 * The window that steps through the app: Tasks, Briefing, Home, Clients.
 * ------------------------------------------------------------------------- */

const TOUR_MS = 6000;

export function AppWindow() {
  const [picked, setPicked] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  // On a phone the screens differ in height, so the window shows the tab you pick and does not move on by itself.
  const wide = useWide();
  const auto = useTicker(TOUR.length, TOUR_MS, picked !== null || held || !wide);
  const index = picked ?? (wide ? auto : null) ?? 0;
  const screen = TOUR[index];
  const running = picked === null && auto !== null && !held && wide;

  return (
    <div
      data-window
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_0_80px_-32px_rgba(var(--brand-rgb),0.9)]"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <Beam delay={1.2} />
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted px-3 py-2.5 sm:px-4">
        <WindowDots />
        <span className="text-xs font-medium text-strong">{APP_VISUALS.organization}</span>
        <p className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="live-pulse size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
            <AgentAvatar name={APP_VISUALS.agent} size="xs" className="size-5" />
            <span className="font-medium text-strong">{APP_VISUALS.agent}</span>
          </span>
          <span key={screen.id} className="live-enter">
            {screen.doing}
          </span>
        </p>
      </div>

      {/* The tabs. Each is a button; the one in view fills as its turn runs. */}
      <ul className="relative grid grid-cols-2 gap-1.5 border-b border-border p-2 sm:grid-cols-4" aria-label={APP_VISUALS.tourLabel}>
        {TOUR.map((item, position) => {
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
                {item.tab}
                {on && running ? <span key={`${item.id}-${auto}`} aria-hidden data-decor className="tour-fill absolute inset-x-0 bottom-0 h-0.5 bg-brand-500" style={{ animationDuration: `${TOUR_MS}ms` }} /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {/* On a wide screen every tab's screen sits in the same cell, so the window keeps the height of the tallest and nothing below it jumps. */}
      <div className="relative grid">
        {TOUR.map((item, position) => {
          const Screen = SCREENS[item.id];
          const on = position === index;
          return (
            <div
              key={item.id}
              data-screen={item.id}
              aria-hidden={on ? undefined : true}
              inert={on ? undefined : true}
              className={cn("col-start-1 row-start-1 min-w-0 p-3 transition-opacity duration-500 motion-reduce:transition-none sm:p-5", on ? "opacity-100" : "hidden lg:invisible lg:block lg:opacity-0")}
            >
              <Screen />
            </div>
          );
        })}
      </div>

      <p className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-3 py-2.5 sm:px-4">
        <span className="text-sm font-medium text-strong">{screen.title}</span>
        <span className="text-xs text-muted-foreground">{APP_VISUALS.note}</span>
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * What the skills hand back.
 * ------------------------------------------------------------------------- */

function AnswerBlock({ label, model, children }: { label: string; model: Model; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-brand-500/25 bg-brand-500/[0.06] p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={eyebrow}>{label}</span>
        <BasisBadge basis="inferred" />
        <Mark model={model} className="ml-auto" />
      </p>
      <p className="mt-2 text-sm leading-snug font-medium text-strong">{children}</p>
    </div>
  );
}

function OfferCompareVisual() {
  const offer = OFFER_COMPARE;
  return (
    <Window who={APP_VISUALS.agent} what={offer.skill} title={offer.title} beam={0.4}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-strong">{offer.heading}</span>
        <span className="inline-flex items-center rounded-full bg-warning/8 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">{offer.status}</span>
      </p>
      <div className="mt-3">
        <AnswerBlock label={offer.answerLabel} model={offer.model}>
          {offer.answer}
        </AnswerBlock>
      </div>
      {/* One block per question. Each offer is a cell that carries its own name, so the grid can fold to two columns. */}
      <dl className="mt-3 grid gap-3">
        {offer.rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{row.label}</dt>
            <dd className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {row.cells.map((cell, index) => {
                const yours = index === 0;
                const flagged = yours && "flagged" in row && row.flagged;
                return (
                  <div key={offer.columns[index]} className={cn("min-w-0 rounded-lg border p-2", yours ? "border-brand-500/35 bg-brand-500/[0.07]" : "border-border bg-card", flagged && "border-warning/40 bg-warning/8")}>
                    <p className={cn("text-[11px] font-medium", yours ? "text-brand-300" : "text-muted-foreground")}>{offer.columns[index]}</p>
                    <p className={cn("mt-1 text-xs leading-snug", cell ? "text-strong" : "text-muted-foreground italic")}>{cell ?? offer.notStated}</p>
                    {flagged ? <p className="mt-1.5 text-[11px] leading-snug font-medium text-warning-foreground">{offer.flag}</p> : null}
                  </div>
                );
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{offer.sources}</p>
    </Window>
  );
}

function AdSetVisual() {
  const set = AD_SET;
  return (
    <Window who={APP_VISUALS.agent} what={set.skill} title={set.title} beam={2.2}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className={clientChip}>{set.brand}</span>
        <span>{set.brandNote}</span>
        <Mark model={set.model} className="ml-auto" />
      </p>
      <p className="mt-2 flex items-start gap-2 text-xs font-medium text-success-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {set.checks}
      </p>
      <p className={cn(eyebrow, "mt-3")}>{set.heading}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {set.variations.map((variation) => (
          <li key={variation.letter} className="min-w-0 rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-300">{variation.letter}</span>
              {variation.angle}
            </p>
            <p className="mt-2 text-sm leading-snug font-medium text-strong">{variation.hook}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {set.headlineLabel} <span className="text-strong">{set.headline}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {set.buttonLabel} <span className="text-strong">{set.button}</span>
            </p>
            <p className="mt-2 rounded-lg bg-muted px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-strong">{set.hypothesisLabel}</span> {variation.hypothesis}
            </p>
          </li>
        ))}
      </ul>
    </Window>
  );
}

const SECTION_TONE = {
  does: { box: "border-success/30 bg-success/8", text: "text-success-foreground", bar: "bg-brand-500/25" },
  partly: { box: "border-warning/35 bg-warning/8", text: "text-warning-foreground", bar: "bg-warning/25" },
  skipped: { box: "border-dashed border-border bg-card", text: "text-muted-foreground", bar: "" },
} as const;

function PageTeardownVisual() {
  const page = PAGE_TEARDOWN;
  const onPage = page.sections.filter((section) => section.state !== "skipped");
  return (
    <Window who={APP_VISUALS.agent} what={page.skill} title={page.title} beam={3.4} className="lg:col-span-2">
      <p className="text-sm font-medium text-strong">{page.heading}</p>
      <p className="text-xs text-muted-foreground">{page.meta}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
          <AnswerBlock label={page.answerLabel} model={page.model}>
            {page.answer}
          </AnswerBlock>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {page.counts.map((count) => (
              <div key={count.label} className="min-w-0 rounded-lg bg-muted p-2.5">
                <dd className="font-heading text-xl text-strong tabular-nums">{count.value}</dd>
                <dt className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{count.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{page.caution}</p>
          <p className="mt-4 text-sm font-medium text-strong">{page.weakTitle}</p>
          <ul className="mt-2 grid gap-2">
            {page.weak.map((point) => (
              <li key={point.title} className="flex min-w-0 gap-2 text-xs">
                <X className="mt-0.5 size-3.5 shrink-0 text-destructive-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium text-strong">
                    {point.title}
                    <BasisBadge basis="inferred" />
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">{point.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid min-w-0 content-start gap-3 sm:grid-cols-[0.7fr_1.3fr] lg:grid-cols-1 xl:grid-cols-[0.7fr_1.3fr]">
          {/* The page as the teardown read it: one band for each section it found, top to bottom. */}
          <div className="hidden min-w-0 overflow-hidden rounded-lg border border-border sm:block" aria-hidden>
            <p className="border-b border-border bg-muted px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">{page.mapLabel}</p>
            {onPage.map((section) => (
              <div key={section.name} className={cn("px-2.5 py-2", SECTION_TONE[section.state].bar)}>
                <p className="text-[10px] font-medium text-strong">{section.name}</p>
                <span className="mt-1 block h-1 w-3/4 rounded-full bg-foreground/15" />
                <span className="mt-1 block h-1 w-1/2 rounded-full bg-foreground/10" />
              </div>
            ))}
          </div>
          <ul className="grid min-w-0 content-start gap-1.5">
            {page.sections.map((section, index) => {
              const tone = SECTION_TONE[section.state];
              return (
                <li key={section.name} className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-xs", tone.box)}>
                  <span className="flex items-center gap-2 font-medium text-strong">
                    <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                    {section.name}
                  </span>
                  <span className={cn("flex items-center gap-1 text-[11px] font-medium", tone.text)}>
                    {section.state === "does" ? <Check className="size-3" aria-hidden /> : section.state === "partly" ? <Target className="size-3" aria-hidden /> : <CircleDashed className="size-3" aria-hidden />}
                    {page.states[section.state]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Window>
  );
}

export function SkillVisuals() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <OfferCompareVisual />
      <AdSetVisual />
      <PageTeardownVisual />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The loop in the app: the test plan, then what was measured.
 * ------------------------------------------------------------------------- */

function TestPlanVisual() {
  const plan = TEST_PLAN;
  return (
    <Window who={APP_VISUALS.app} what={plan.by} title={plan.title}>
      <p className="flex items-center gap-2 text-sm font-medium text-strong">
        <Target className="size-4 shrink-0 text-brand-400" aria-hidden />
        {plan.heading}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.lead}</p>
      <ol className="mt-3 grid gap-2">
        {plan.changes.map((change, index) => (
          <li key={change.title} className="min-w-0 rounded-xl border border-border bg-card p-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-300 tabular-nums">{index + 1}</span>
              <span className="text-sm font-medium text-strong">{change.title}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <BasisBadge basis={change.basis} />
              <span className={chip}>{change.channel}</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{change.body}</p>
            {"trying" in change ? (
              <p className="mt-2.5 flex items-start gap-2 border-t border-border pt-2.5 text-xs">
                <CalendarIcon className="mt-0.5 size-3.5 shrink-0 text-brand-400" aria-hidden />
                <span>
                  <span className="font-medium text-strong">{change.trying}</span> <span className="text-muted-foreground">{change.note}</span>
                </span>
              </p>
            ) : (
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-xs">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-500/50 bg-brand-500/10 px-3 font-medium text-strong">
                  <Target className="size-3.5 text-brand-400" aria-hidden />
                  {plan.tryButton}
                </span>
                <span className="text-muted-foreground">
                  {plan.checkBack} <span className="font-medium text-strong">{plan.days}</span>
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </Window>
  );
}

function ResultVisual() {
  const results = RESULTS;
  return (
    <Window who={APP_VISUALS.app} what={results.by} title={results.title}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-brand-500/10 px-3 py-2 text-xs">
        <span className="size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
        <span className="text-sm font-medium text-strong">{results.column}</span>
        <span className="rounded-full bg-card px-1.5 text-[11px] text-muted-foreground tabular-nums">{results.cards.length}</span>
        <span className="ml-auto text-muted-foreground">{results.note}</span>
      </p>
      <div className="mt-2 grid gap-2">
        {results.cards.map((card) => (
          <article key={card.title} className="min-w-0 rounded-xl border border-l-2 border-border border-l-brand-500 bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <AgentAvatar name={APP_VISUALS.agent} size="xs" className="size-5" />
              <span className={chip}>{results.kind}</span>
              <span className={clientChip}>{card.client}</span>
            </div>
            <p className="mt-2 text-sm leading-snug font-medium text-strong">{card.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.dates}</p>
            <div className="mt-2.5 rounded-lg bg-muted p-2.5 text-xs">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium", card.tone === "good" ? "bg-success/8 text-success-foreground" : "border border-border bg-card text-strong")}>
                  {card.tone === "good" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
                  {card.result}
                </span>
                <span className="text-muted-foreground">{card.measured}</span>
              </p>
              <ul className="mt-2 grid gap-1">
                {card.figures.map((figure) => (
                  <li key={figure.label} className="flex flex-wrap items-baseline gap-x-2 text-strong">
                    {figure.label}
                    <span className="text-muted-foreground tabular-nums">
                      {figure.from} → {figure.to}
                    </span>
                    <span className={cn("tabular-nums", figure.good ? "font-medium text-success-foreground" : "text-muted-foreground")}>({figure.change})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-strong">“{card.quote}”</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-border pt-2 text-muted-foreground">
                {results.expectedLabel} {card.expected}
                <BasisBadge basis={card.basis} />
              </p>
            </div>
          </article>
        ))}
      </div>
    </Window>
  );
}

export function LoopVisuals() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <TestPlanVisual />
      <ResultVisual />
    </div>
  );
}
