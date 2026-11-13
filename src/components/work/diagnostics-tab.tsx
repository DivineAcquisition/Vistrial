"use client";

import { useClientScope } from "@/components/shell/shell-context";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Gauge, Plug, PenLine, Target, TrendingUp, WrenchIcon, Rocket, type LucideIcon } from "@/components/icons";
import { StartDiagnosisButton } from "@/components/sessions/start-diagnosis-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Detail, EvidenceLabel, ModelMark, NextStep, VerdictStrip } from "@/components/readable";
import { showError } from "@/lib/errors/show-error";
import { diagnosisGlance, stepLabel } from "@/lib/readable/analysis";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { ViewSwitch, useWorkView, type WorkView } from "./board-canvas";
import { TryThis, useItemDecisions, type TryActions } from "./try-this";
import { RoadmapCanvas } from "./work-canvases";
import type { ConnectedData, DiagnosisView, GoalView, ItemDecision, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { RefineInChat, ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, refineLink, suggestionHref } from "./work-shell";

const PHASES: { key: "fix" | "build" | "scale"; name: string; weeks: string; icon: LucideIcon; blurb: string }[] = [
  { key: "fix", name: "Fix", weeks: "Weeks 1–4", icon: WrenchIcon, blurb: "Stop the leak where growth stalls." },
  { key: "build", name: "Build", weeks: "Weeks 5–8", icon: TrendingUp, blurb: "Strengthen what the fixes showed works." },
  { key: "scale", name: "Scale", weeks: "Weeks 9–12", icon: Rocket, blurb: "Put more behind what is proven." },
];

const STAGE_WORDS: Record<string, string> = { reach: "Reach", clicks: "Clicks", leads: "Leads or booked calls", revenue: "Revenue", unknown: "Not enough data" };

type Figure = DiagnosisView["stageFigures"][number];

function FigureChip({ figure }: { figure: Figure }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs" title={figure.formula ? `Worked out: ${figure.formula}` : "As reported"}>
      <span className="truncate text-muted-foreground">{figure.label}</span>
      <span className="font-medium text-card-foreground tabular-nums">{figure.display}</span>
    </span>
  );
}

/** The goal, first: what the owner wants to reach, in their words. The roadmap aims at it. */
export function GoalCard({ goal, editor, onSave }: { goal: GoalView; editor: boolean; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(goal === null);
  const [text, setText] = useState(goal?.text ?? "");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const open = editing && editor;
  return (
    <Panel className="relative grid gap-3 overflow-hidden p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Target aria-hidden className="size-5" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your 90-day goal</p>
            {goal && !open ? (
              <p className="font-heading text-xl break-words text-card-foreground">{goal.text}</p>
            ) : (
              <p className="text-sm text-card-foreground">{editor ? "Start here: what do you want to reach in the next 90 days? Say it with a number if you can, for example 10 more retained clients this quarter." : "No goal is set yet."}</p>
            )}
            {goal && !open ? (
              <p className="text-xs text-muted-foreground">
                Set {shortDate(goal.setAt)}
                {goal.target !== null ? ` · target ${goal.target.toLocaleString()}${goal.metric ? ` ${goal.metric}` : ""}${goal.period ? ` a ${goal.period}` : ""}` : " · no number in it, so the roadmap aims at the stall stage"}
              </p>
            ) : null}
          </div>
        </div>
        {goal && editor && !open ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PenLine aria-hidden className="size-4" /> Change
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="relative flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setProblem("");
            void onSave(text).then(
              () => {
                setBusy(false);
                setEditing(false);
              },
              (error: unknown) => {
                setBusy(false);
                setProblem(showError(error, "The goal was not saved."));
              },
            );
          }}
        >
          <Input aria-label="Your 90-day goal" className="min-w-0 flex-1 basis-60" placeholder="10 more retained clients this quarter" value={text} maxLength={200} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" size="sm" disabled={busy || text.trim().length < 3}>
            Save goal
          </Button>
          {goal ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
          {problem ? <p className="basis-full text-xs text-destructive">{problem}</p> : null}
        </form>
      ) : null}
    </Panel>
  );
}

/**
 * Where growth stalls: the answer first. The stage and the reason it was named, its evidence label, the
 * figures behind it and counts of the plan, then what to do next. The summary paragraph and what is missing
 * sit under it; nothing the earlier panel showed is gone.
 */
function StallSummary({ diagnosis, decisions }: { diagnosis: DiagnosisView; decisions: Map<number, ItemDecision> }) {
  const glance = diagnosisGlance(diagnosis, (index) => decisions.has(index));
  const named = diagnosis.hasData && diagnosis.stage !== "unknown";
  const next = diagnosis.status === "rejected" || diagnosis.status === "archived" ? null : glance.next;
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Gauge}>Where growth stalls</SectionTitle>
        <span className="flex flex-wrap items-center gap-2">
          <ModelMark model={diagnosis.model} />
          <StatusBadge
            label={diagnosis.status === "approved" ? "Approved" : diagnosis.status === "needsReview" ? "Needs review" : "Waiting for approval"}
            tone={diagnosis.status === "approved" ? "good" : "warning"}
            className="[&_span]:normal-case"
          />
        </span>
      </div>
      <VerdictStrip
        text={named ? `${STAGE_WORDS[diagnosis.stage] ?? diagnosis.stage}. ${diagnosis.stageReason}` : "Not enough data. Connect Meta or upload a results file, then run the diagnosis again."}
        label={glance.label}
        counts={
          named
            ? [
                ...diagnosis.stageFigures.slice(0, 2).map((figure) => ({ value: figure.display, words: figure.label, hint: figure.formula ? `Worked out: ${figure.formula}` : "As reported" })),
                ...(glance.steps ? [{ value: `${glance.underWay} of ${glance.steps}`, words: "roadmap steps under way" }] : []),
                ...(glance.thin ? [{ value: String(glance.thin), words: glance.thin === 1 ? "step without figures behind it" : "steps without figures behind them" }] : []),
              ]
            : []
        }
      >
        {named && diagnosis.stageFigures.length > 2 ? (
          <div className="flex flex-wrap gap-1.5">
            {diagnosis.stageFigures.slice(2).map((figure) => (
              <FigureChip key={figure.id} figure={figure} />
            ))}
          </div>
        ) : null}
        {named ? <p className="text-xs text-muted-foreground">The figures are your own, read as they are. No outside benchmark is used.</p> : null}
      </VerdictStrip>
      {diagnosis.hasData && diagnosis.summary ? (
        <p className="text-sm text-card-foreground">
          <EvidenceLabel label="Inference" className="mr-1.5 align-middle" />
          {diagnosis.summary}
        </p>
      ) : null}
      {diagnosis.findings.length ? (
        <Detail summary="What the figures show" aside={`${diagnosis.findings.length} ${diagnosis.findings.length === 1 ? "finding" : "findings"}`}>
          <ul className="grid gap-2">
            {diagnosis.findings.map((row) => (
              <li key={row.statement} className="grid gap-1.5 rounded-xl border border-border p-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-card-foreground">
                  <EvidenceLabel label={row.figures.length ? "Your data" : "Not enough data"} />
                  {row.statement}
                </p>
                {row.figures.length ? (
                  <div className="flex flex-wrap gap-1">
                    {row.figures.map((figure) => (
                      <FigureChip key={figure.id} figure={figure} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Detail>
      ) : null}
      {diagnosis.missing.length ? (
        <ul className="grid gap-1">
          {diagnosis.missing.map((row) => (
            <li key={row} className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {row}
            </li>
          ))}
        </ul>
      ) : null}
      {next ? <NextStep look="inline" title={next.action} label={stepLabel(next)} note={`${PHASES.find((phase) => phase.key === next.phase)?.name ?? "Roadmap"}, ${PHASES.find((phase) => phase.key === next.phase)?.weeks ?? ""}: the first step nobody is trying yet.`} href={`#roadmap-step-${next.index + 1}`} /> : null}
    </Panel>
  );
}

const PHASE_LOOK: Record<"fix" | "build" | "scale", { rule: string; dot: string; days: number }> = {
  fix: { rule: "border-card-foreground", dot: "bg-card-foreground text-card", days: 30 },
  build: { rule: "border-primary", dot: "border-2 border-primary text-card-foreground", days: 60 },
  scale: { rule: "border-success", dot: "border-2 border-success text-card-foreground", days: 90 },
};

/** What a step's decision says in a few words, for its tag. Null when nothing was decided yet. */
export function stepStatus(decision: ItemDecision | undefined): { label: string; tone: "accent" | "done" } | null {
  if (!decision) return null;
  if (decision.outcome) return { label: `Recorded ${shortDate(decision.outcome.recordedAt)}`, tone: "done" };
  return { label: decision.due ? "Trying · check-in due" : `Trying · check-in ${shortDate(decision.checkInAt)}`, tone: "accent" };
}

/**
 * The 90-day roadmap: Fix, Build, Scale as three columns on a wide screen and one numbered rail on a
 * phone. Each step names the action, the problem with the business's own figures, the measure with its
 * target, and "We'll try this" puts it in the outcome loop.
 */
export function Roadmap({ diagnosis, goal, decisions, actions, editor }: { diagnosis: DiagnosisView; goal: GoalView; decisions: Map<number, ItemDecision>; actions: TryActions; editor: boolean }) {
  const canTry = diagnosis.status !== "rejected" && diagnosis.status !== "archived";
  const goalChanged = goal && diagnosis.goalUsed && goal.text !== diagnosis.goalUsed;
  const trying = diagnosis.roadmap.filter((row) => decisions.has(row.index)).length;
  return (
    <section className="grid gap-4" aria-label="90-day roadmap">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <SectionTitle icon={Rocket}>90-day roadmap</SectionTitle>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {diagnosis.goalUsed ? <>Aimed at &ldquo;{diagnosis.goalUsed}&rdquo;. </> : null}Every problem and target uses your own figures, never an outside benchmark.
            {goalChanged ? " Your goal has changed since; run the diagnosis again to aim at the new one." : ""}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="grid">
            <dd className="font-heading text-xl text-card-foreground tabular-nums">
              {trying} of {diagnosis.roadmap.length}
            </dd>
            <dt>steps under way</dt>
          </div>
        </dl>
      </div>
      <ol className="grid gap-0 lg:grid-cols-3 lg:gap-4">
        {PHASES.map((phase, position) => {
          const steps = diagnosis.roadmap.filter((row) => row.phase === phase.key);
          const look = PHASE_LOOK[phase.key];
          return (
            <li key={phase.key} className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 lg:block">
              {/* The numbered rail, on phones only. */}
              <div aria-hidden className="flex flex-col items-center lg:hidden">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", look.dot)}>{position + 1}</span>
                {position < PHASES.length - 1 ? <span className="w-0.5 flex-1 bg-border" /> : null}
              </div>
              <div className="grid min-w-0 content-start gap-3 pb-6 lg:pb-0">
                <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 lg:border-b-[3px] lg:pb-2.5", look.rule)}>
                  <h3 className="font-heading text-lg text-card-foreground">{phase.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {phase.weeks} · {phase.blurb}
                  </span>
                </div>
                {steps.length === 0 ? <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No step in this phase.</p> : null}
                {steps.map((step) => {
                  const thin = step.figures.length === 0;
                  const status = stepStatus(decisions.get(step.index));
                  return (
                    <article key={step.index} id={`roadmap-step-${step.index + 1}`} className={cn("grid scroll-mt-24 gap-2.5 rounded-2xl border p-4 target:border-primary", thin ? "border-warning/50 bg-warning/[0.06]" : status?.tone === "accent" ? "border-primary/40 bg-card" : "border-border bg-card")}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <EvidenceLabel label={stepLabel(step)} />
                        {status ? <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold", status.tone === "accent" ? "bg-primary/[0.14] text-card-foreground" : "bg-muted text-muted-foreground")}>{status.label}</span> : null}
                      </span>
                      <h4 className="font-heading text-base leading-snug text-card-foreground">{step.action}</h4>
                      <p className="text-sm text-muted-foreground">{step.problem}</p>
                      {step.figures.length ? (
                        <div className="flex flex-wrap gap-1">
                          {step.figures.map((figure) => (
                            <FigureChip key={figure.id} figure={figure} />
                          ))}
                        </div>
                      ) : null}
                      <div className="grid gap-0.5 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
                        <span className="text-xs text-muted-foreground">{step.targetMetric}</span>
                        <span className="flex items-start gap-1.5 font-medium text-card-foreground">
                          <ArrowRight aria-hidden className="mt-1 size-3.5 shrink-0 text-primary" /> {step.target}
                        </span>
                      </div>
                      {canTry ? <TryThis index={step.index} decision={decisions.get(step.index)} editor={editor} actions={actions} defaultDays={look.days} /> : null}
                    </article>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Which of the business's own data is connected. A diagnosis reads only this: nothing from outside, and
 * nothing in these accounts is changed. Each row links to where it is connected.
 */
export function DataChecklist({ data, base }: { data: ConnectedData; base: string }) {
  const rows = [
    { key: "meta", done: data.meta, label: "Meta ads", detail: data.meta ? "Connected. Spend, clicks and results are read as they are." : "Not connected. Connect it to read spend, clicks and results.", href: `${base}/connections/meta`, action: data.meta ? "Manage" : "Connect" },
    {
      key: "results",
      done: data.resultsFiles > 0,
      label: "Results files",
      detail: data.resultsFiles > 0 ? `${data.resultsFiles} file${data.resultsFiles === 1 ? "" : "s"} ready: your own signed clients, booked calls or revenue.` : "None yet. Upload a CSV of signed clients, booked calls or revenue.",
      href: `${base}/connections/results`,
      action: data.resultsFiles > 0 ? "Add another" : "Upload",
    },
    {
      key: "outcomes",
      done: data.outcomes > 0,
      label: "Outcomes",
      detail: data.outcomes > 0 ? `${data.outcomes} recorded: what happened after you tried a change.` : "None recorded yet. They come from “We’ll try this” check-ins.",
      href: "/app",
      action: "Open check-ins",
    },
  ];
  const connected = rows.filter((row) => row.done).length;
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <SectionTitle icon={Plug} aside={<StatusBadge label={`${connected} of ${rows.length} connected`} tone={connected === 0 ? "warning" : connected === rows.length ? "good" : "neutral"} className="[&_span]:normal-case" />}>
        Your data
      </SectionTitle>
      <p className="text-sm text-muted-foreground">A diagnosis reads only your own data. The more of it is connected, the more of your funnel it can see.</p>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-3 py-2.5">
            {row.done ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="grid min-w-0 flex-1 basis-48 gap-0.5">
              <span className="text-sm text-card-foreground">
                {row.label} <span className="sr-only">{row.done ? "connected" : "not connected"}</span>
              </span>
              <span className="text-xs text-muted-foreground">{row.detail}</span>
            </span>
            <Link href={row.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
              {row.action}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export type DiagnosticsTabProps = {
  base: string;
  editor: boolean;
  data: ConnectedData;
  /** The Run diagnosis button. Owners, Admins and Members. */
  run: ReactNode;
  tab: TabData;
  goal: GoalView;
  diagnosis: DiagnosisView | null;
  onSaveGoal: (text: string) => Promise<void>;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
  /** Opens on Cards or Canvas (stories). Otherwise the view a person last chose. */
  initialView?: WorkView;
};

export function DiagnosticsTabView({ base, editor, data, run, tab, goal, diagnosis, onSaveGoal, decisions, tryActions, review, initialView }: DiagnosticsTabProps) {
  const [view, setView] = useWorkView(initialView);
  const canvas = view === "canvas" && diagnosis !== null;
  const rail = (
    <>
      <RunningNow running={tab.running} finished={tab.finished} sessionHref={(projectId) => `${base}/work/diagnostics/${projectId}`} />
      <SuggestedNext suggestions={tab.suggestions} hrefFor={(row) => suggestionHref(base, row)} />
      <SharedLinks base={base} />
    </>
  );
  const top = (
    <>
      <GoalCard key={goal?.text ?? "none"} goal={goal} editor={editor} onSave={onSaveGoal} />
      <WorkHero
        icon={Gauge}
        eyebrow="Strategist · Growth Diagnostics"
        title="Diagnostics"
        promise="Finds where growth stalls in your own data and turns it into a 90-day plan: Fix, Build, Scale."
        working={tab.running.length > 0}
        action={
          <>
            {diagnosis ? <ViewSwitch view={view} onChange={setView} /> : null}
            {editor ? run : null}
          </>
        }
      >
        {editor && !data.meta && data.resultsFiles === 0 ? <p className="text-xs text-warning">Nothing is connected yet, so a diagnosis would have no figures to read. Connect Meta or upload a results file first.</p> : null}
      </WorkHero>
    </>
  );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      {canvas ? (
        <div className="grid min-w-0 grid-cols-1 gap-5">{top}</div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid min-w-0 content-start gap-5">
            {top}
            {/* The owner's order (2026-11-13): what the diagnosis could read first, then what it found. */}
            <DataChecklist data={data} base={base} />
            {diagnosis ? <StallSummary diagnosis={diagnosis} decisions={decisions} /> : null}
          </div>
          {/* On a wide screen the rail sits beside the top; on a phone it comes after the roadmap. */}
          <aside className="hidden min-w-0 content-start gap-5 lg:grid">{rail}</aside>
        </div>
      )}
      {/* The roadmap and the canvas use the full width: three columns of steps need the room. */}
      {diagnosis ? (
        <>
          {canvas ? (
            <RoadmapCanvas goal={goal} diagnosis={diagnosis} data={data} decisions={decisions} tryActions={tryActions} editor={editor} />
          ) : diagnosis.roadmap.length ? (
            <Roadmap diagnosis={diagnosis} goal={goal} decisions={decisions} actions={tryActions} editor={editor} />
          ) : diagnosis.hasData ? (
            <Panel className="grid gap-2 p-4 sm:p-5">
              <SectionTitle icon={Rocket}>90-day roadmap</SectionTitle>
              <p className="text-sm text-muted-foreground">This diagnosis was written before roadmaps. Run it again for a Fix, Build and Scale plan.</p>
              {diagnosis.fixes.length ? (
                <ol className="grid gap-1 text-sm text-card-foreground">
                  {diagnosis.fixes.map((row, i) => (
                    <li key={row.fix}>
                      {i + 1}. {row.fix} <span className="text-muted-foreground">({row.howToTell})</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Panel>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {diagnosis.projectId ? (
              <Link href={`${base}/work/diagnostics/${diagnosis.projectId}`} className="w-fit text-sm text-primary hover:underline">
                Open the full diagnosis with every figure and its source
              </Link>
            ) : null}
            {editor ? <RefineInChat href={refineLink(base, "growth-diagnostics", { kind: "asset", id: diagnosis.assetId, title: diagnosis.title })} /> : null}
          </div>
        </>
      ) : null}
      <ResultsList results={tab.results} actions={review} editor={editor} empty="Diagnoses appear here for you to review. Press Run diagnosis to start one." openHref={(row) => (row.projectId ? `${base}/work/diagnostics/${row.projectId}` : `/app/assets/${row.id}`)} refineHref={(row) => refineLink(base, "growth-diagnostics", { kind: "asset", id: row.id, title: row.title })} />
      <aside className={cn("grid min-w-0 content-start gap-5", canvas ? "md:grid-cols-3" : "lg:hidden")}>{rail}</aside>
    </div>
  );
}

/** The Diagnostics tab fed by Convex. */
export function DiagnosticsTab({ workspaceId, base, editor }: { workspaceId: Id<"workspaces">; base: string; editor: boolean }) {
  const { scope } = useClientScope();
  const tab = useQuery(api.workTabs.tab, { workspaceId, scope, skillSlug: "growth-diagnostics" });
  const data = useQuery(api.workTabs.diagnostics, { workspaceId });
  const setGoal = useMutation(api.goals.set);
  const { byIndex, actions } = useItemDecisions(workspaceId, (data?.diagnosis?.assetId ?? null) as Id<"assets"> | null);
  const review = useReviewActions(workspaceId);
  if (!tab || !data) return <p className="text-sm text-muted-foreground">Loading diagnostics.</p>;
  return (
    <DiagnosticsTabView
      base={base}
      editor={editor}
      data={data.data}
      run={<StartDiagnosisButton workspaceId={workspaceId} agentSlug={base.split("/").pop() ?? "growth-architect"} />}
      tab={tab}
      goal={data.goal}
      diagnosis={data.diagnosis}
      onSaveGoal={async (text) => {
        await setGoal({ workspaceId, text });
      }}
      decisions={byIndex}
      tryActions={actions}
      review={review}
    />
  );
}
