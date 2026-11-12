"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronLeft,
  FileText,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  Store,
} from "@/components/icons";
import Logo from "@/components/brand/logo";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { FindingsView } from "@/components/research/findings";
import { LiveActivity } from "@/components/research/live-activity";
import { QuestionCard, SourceStatusList, StageProgress } from "@/components/research/studio-parts";
import type { ThreadData } from "@/components/sessions/session-thread";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ShaderBackdrop } from "@/components/ui/shader-backdrop";
import { errorWords } from "@/lib/research/words";
import { creditWords, dollarWords } from "@/lib/credits";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ------------------------------------------------------------------------------------------- types

export type FreeSessionData = {
  stage: "freeSession" | "paywall";
  workspaceId: Id<"workspaces">;
  business: { name: string; offer: string; area: string; website: string };
  freeAttempts: number;
  maxAttempts: number;
  billing: { on: boolean; testMode: boolean; paid: boolean; plan: { name: string; priceCents: number; includedCents: number } };
  /** The live session, once it has started. */
  session: ThreadData | null;
};

export type FreeSessionActions = {
  /** Starts the free session (or a retry after it stopped without a report). */
  start: () => Promise<unknown>;
  paywall: (open: boolean) => Promise<unknown>;
  /** Starts checkout. Resolves with Stripe's page, or null when nothing needs paying. */
  subscribe: () => Promise<{ url: string | null }>;
  /** Moves on when the plan is paid or there is no billing here. */
  unlock: () => Promise<{ unlocked: boolean }>;
};

type Phase = "starting" | "working" | "waiting" | "report" | "stopped";

export function phaseOf(session: ThreadData | null): Phase {
  if (!session?.studio.run) return "starting";
  const run = session.studio.run;
  if (session.studio.report) return "report";
  if (run.waitingFor) return "waiting";
  if (session.open) return "working";
  return "stopped";
}


function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// --------------------------------------------------------------------------------------------- frame

function Header({ step }: { step: 0 | 1 | 2 }) {
  const labels = ["Research", "Your report", "Unlock"];
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <Logo markOnly className="size-8" title="" />
        <span className="font-heading text-lg text-strong">Vistrial</span>
      </div>
      <ol className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase" aria-label="Free session steps">
        {labels.map((label, index) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1",
                index < step
                  ? "bg-primary/10 text-primary ring-primary/20"
                  : index === step
                    ? "bg-card text-strong ring-border"
                    : "text-muted-foreground/70 ring-transparent",
                index !== step && "hidden sm:inline-flex",
              )}
            >
              {index < step ? <Check aria-hidden className="size-3" /> : null}
              {label}
            </span>
            {index < labels.length - 1 ? <span aria-hidden className="hidden h-px w-4 bg-border sm:block" /> : null}
          </li>
        ))}
      </ol>
    </header>
  );
}

function Hero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial={still ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="grid min-w-0 max-w-3xl gap-3"
    >
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
      <h1 className="font-heading text-3xl leading-tight text-strong sm:text-4xl">{title}</h1>
      {children ? <div className="text-base leading-relaxed text-muted-foreground">{children}</div> : null}
    </motion.div>
  );
}

function ScopeChips({ business }: { business: FreeSessionData["business"] }) {
  const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-border";
  return (
    <div className="flex flex-wrap gap-2">
      <span className={chip}>
        <Store aria-hidden className="size-3.5 shrink-0" /> <span className="truncate">{business.offer}</span>
      </span>
      {business.area ? (
        <span className={chip}>
          <MapPin aria-hidden className="size-3.5 shrink-0" /> {business.area}
        </span>
      ) : null}
      {business.website ? <span className={chip}>{hostOf(business.website)}</span> : null}
    </div>
  );
}

/** "This one's on us": what the free session is, so nobody wonders about a bill. */
function OnUsCard() {
  return (
    <Panel className="grid gap-2 border-primary/25 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <Sparkles aria-hidden className="size-4 text-primary" /> This one is on us
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Your first research session is free. Nothing is charged and no card is needed. You can close this page: the research keeps going and the report waits for
        you here.
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------- session

/**
 * Onboarding's free research session: the live show while Growth Architect works, the full report when it is
 * done, then the paywall. Plain data in, so the story page can show every state without a backend.
 */
export function FreeSession({ data, actions, startError }: { data: FreeSessionData; actions: FreeSessionActions; startError?: unknown }) {
  if (data.stage === "paywall") return <Paywall data={data} actions={actions} />;
  return <SessionView data={data} actions={actions} startError={startError} />;
}

function SessionView({ data, actions, startError }: { data: FreeSessionData; actions: FreeSessionActions; startError?: unknown }) {
  const { session, business } = data;
  const phase = phaseOf(session);
  const [busy, setBusy] = useState(false);
  const [localError, setError] = useState("");
  const error = localError || (startError ? errorWords(startError, "The free session did not start. Try again.") : "");
  const run = session?.studio.run ?? null;
  const sources = session ? [...session.sources.values()] : [];

  const act = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (problem) {
      setError(errorWords(problem, fallback));
    } finally {
      setBusy(false);
    }
  };

  const hero =
    phase === "starting" ? (
      <Hero eyebrow="Free research session" title={<>Getting Growth Architect ready for {business.name}</>}>
        <p>It reads what you told us, writes a plan, then starts researching. This takes a few seconds.</p>
      </Hero>
    ) : phase === "report" ? (
      <Hero eyebrow="Your report is ready" title={<>What Growth Architect found for {business.name}</>}>
        <p>Every opportunity below is backed by sources you can open. Read it, then unlock Vistrial to act on it.</p>
      </Hero>
    ) : phase === "stopped" ? (
      <Hero eyebrow="Free research session" title="The session stopped before the report">
        <p>
          {data.freeAttempts < data.maxAttempts
            ? "Try once more: it starts fresh and is still free."
            : "It stopped again before writing the report. You can still unlock Vistrial and run a new session from your organization."}
        </p>
      </Hero>
    ) : (
      <Hero eyebrow="Free research session · live" title={<>Growth Architect is researching {business.name}</>}>
        <p>
          Watch it work. It searches the web, video and social platforms and ad libraries, keeps the sources it trusts, and writes a report with three opportunities
          for you. It usually takes a few minutes.
        </p>
      </Hero>
    );

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 sm:px-8 lg:py-10">
        <Header step={phase === "report" ? 1 : 0} />
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {hero}
          <ScopeChips business={business} />
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
            {phase === "starting" ? (
              <Panel className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin text-primary motion-reduce:animate-none" />
                {error ? <span className="text-destructive">{error}</span> : "Starting your free session…"}
                {error ? (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => void act(actions.start, "It did not start. Try again.")}>
                    Try again
                  </Button>
                ) : null}
              </Panel>
            ) : null}

            {phase === "waiting" && session ? (
              <Section icon={Search} title="Growth Architect needs one answer to go on">
                <QuestionCard workspaceId={data.workspaceId} studio={session.studio} canAnswer />
              </Section>
            ) : null}

            {phase === "stopped" ? (
              <Panel className="flex flex-wrap items-center gap-3 p-4">
                {data.freeAttempts < data.maxAttempts ? (
                  <Button variant="gradient" disabled={busy} onClick={() => void act(actions.start, "It did not start. Try again.")}>
                    {busy ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />} Try again, free
                  </Button>
                ) : null}
                <Button variant="ghost" disabled={busy} onClick={() => void act(() => actions.paywall(true), "That did not open.")}>
                  See plans <ArrowRight aria-hidden />
                </Button>
                {error ? (
                  <p role="alert" className="w-full text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </Panel>
            ) : null}

            {session && run && phase !== "report" && phase !== "starting" ? (
              <LiveActivity steps={session.steps} sources={sources} status={run.status} startedAt={run.startedAt} finishedAt={run.finishedAt ?? null} costCents={run.costCents} free />
            ) : null}

            {phase === "report" && session ? (
              <>
                <FindingsView workspaceId={data.workspaceId} studio={session.studio} sources={session.sources} assetStatus={session.assetStatus} canDecide={false} showDecision={false} />
                <UnlockTeaser data={data} onUnlock={() => void act(() => actions.paywall(true), "That did not open.")} busy={busy} />
              </>
            ) : null}
          </main>

          <aside className="grid min-w-0 content-start gap-3 lg:sticky lg:top-6 lg:self-start" aria-label="Session details">
            {phase !== "report" ? <OnUsCard /> : null}
            <Panel className="grid gap-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                <BookOpenCheck aria-hidden className="size-4 text-primary" /> Progress
              </h2>
              {session && run ? <StageProgress steps={session.steps} open={session.open} /> : <p className="text-sm text-muted-foreground">Starting.</p>}
            </Panel>
            <Panel className="grid gap-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                <ListChecks aria-hidden className="size-4 text-primary" /> Where it looked
              </h2>
              <SourceStatusList statuses={session?.statuses ?? []} />
            </Panel>
          </aside>
        </div>
      </div>

      {phase === "report" ? (
        <div className="sticky bottom-0 z-20 border-t border-border/60 bg-background/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              <span className="text-card-foreground">Like what you see?</span> Unlock Vistrial to act on these opportunities and keep researching.
            </p>
            <Button variant="gradient" size="lg" disabled={busy} onClick={() => void act(() => actions.paywall(true), "That did not open.")}>
              <Lock aria-hidden /> Unlock Vistrial
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Search; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
        <Icon aria-hidden className="size-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

function UnlockTeaser({ data, onUnlock, busy }: { data: FreeSessionData; onUnlock: () => void; busy: boolean }) {
  return (
    <Panel className="relative isolate grid gap-4 overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-[#a78bfa]/10" />
      <div className="flex items-start gap-3">
        <VistrialMark className="mt-0.5" />
        <div className="grid gap-1">
          <h2 className="font-heading text-lg text-card-foreground">Turn this report into results</h2>
          <p className="text-sm text-muted-foreground">
            With Vistrial unlocked, Growth Architect plans each opportunity with you, answers follow-up questions from these sources, and runs new research
            whenever you need it.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="gradient" size="lg" disabled={busy} onClick={onUnlock}>
          <Lock aria-hidden /> Unlock Vistrial
        </Button>
        <span className="text-sm text-muted-foreground">
          {data.billing.plan.name} plan, {dollarWords(data.billing.plan.priceCents)} a month with {creditWords(data.billing.plan.includedCents)} included.
        </span>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------- paywall

const UNLOCKS = [
  { title: "Act on your report", words: "Plan each opportunity, set a date to check it, and record what happened." },
  { title: "Ask follow-up questions", words: "Answers come from your sources, with links. New research is proposed with an estimate first." },
  { title: "Run new research any time", words: "Competitors, offers, prices and ads, for any market or area you name." },
  { title: "Memory that keeps building", words: "Everything you told us and every approved report is remembered, so you never repeat yourself." },
];

function Paywall({ data, actions }: { data: FreeSessionData; actions: FreeSessionActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { plan } = data.billing;
  const report = data.session?.studio.report ?? null;
  const sourceCount = data.session?.sources.size ?? 0;

  const act = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (problem) {
      setError(errorWords(problem, fallback));
      setBusy(false);
    }
  };

  const checkout = () =>
    act(async () => {
      const result = await actions.subscribe();
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await actions.unlock();
      setBusy(false);
    }, "Checkout did not open. Try again.");

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8 px-4 py-6 sm:px-10 lg:px-14 lg:py-10">
        <Header step={2} />
        <div className="grid max-w-xl gap-8 lg:mt-6">
          <Hero eyebrow="Unlock Vistrial" title={<>Keep Growth Architect working for {data.business.name}</>}>
            <p>Your free report is yours to keep. Unlock Vistrial to act on it and keep going.</p>
          </Hero>

          <ul className="grid gap-4">
            {UNLOCKS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Check aria-hidden className="size-3.5" />
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium text-card-foreground">{item.title}</span>
                  <span className="text-sm text-muted-foreground">{item.words}</span>
                </span>
              </li>
            ))}
          </ul>

          <Panel className="grid gap-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-card-foreground">{plan.name}</p>
                <p className="text-xs text-muted-foreground">Cancel any time from Billing.</p>
              </div>
              <p className="font-heading text-3xl text-strong">
                {dollarWords(plan.priceCents)}
                <span className="text-sm font-normal text-muted-foreground"> / month</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Includes {creditWords(plan.includedCents)} every month. Research and follow-ups use credits as they run, and you can add more any time.
            </p>
            {data.billing.on ? (
              <Button variant="gradient" size="lg" disabled={busy} onClick={() => void checkout()} className="w-full">
                {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Lock aria-hidden />} Unlock Vistrial
              </Button>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Billing is not switched on for this deployment, so there is nothing to pay.</p>
                <Button variant="gradient" size="lg" disabled={busy} onClick={() => void act(actions.unlock, "That did not work. Try again.")} className="w-full">
                  Continue to Vistrial <ArrowRight aria-hidden />
                </Button>
              </div>
            )}
            {data.billing.testMode ? <p className="text-xs text-warning">Test mode: Stripe takes test cards only and nothing real is charged.</p> : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </Panel>

          <Button variant="ghost" className="justify-self-start" disabled={busy} onClick={() => void act(() => actions.paywall(false), "That did not open.")}>
            <ChevronLeft aria-hidden /> Back to my report
          </Button>
        </div>
      </section>

      <aside className="relative isolate hidden overflow-hidden border-l border-border/60 lg:block">
        <ShaderBackdrop className="-z-10" />
        <div className="sticky top-0 flex min-h-dvh items-center justify-center p-10 xl:p-16">
          <Panel className="grid w-full max-w-md gap-4 bg-card/80 p-6 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <FileText aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-heading text-base text-card-foreground">{data.business.name}: first report</p>
                <p className="text-xs text-muted-foreground">
                  {report ? `${report.opportunities.length} opportunities · ${sourceCount} sources` : "Free research session"}
                </p>
              </div>
            </div>
            {report ? (
              <ol className="grid gap-2">
                {report.opportunities.map((row, index) => (
                  <li key={`${index}-${row.opportunity}`} className="flex gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-border">
                    <span className="font-heading text-sm text-brand-500 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-card-foreground">{row.opportunity}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Your report shows here once the free session finishes.</p>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock aria-hidden className="size-3.5" /> Planning these, follow-ups and new research unlock with the plan.
            </p>
          </Panel>
        </div>
      </aside>
    </div>
  );
}
