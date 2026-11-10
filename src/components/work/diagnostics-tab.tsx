"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Gauge, Plug, PenLine, Target, TrendingUp, WrenchIcon, Rocket, type LucideIcon } from "@/components/icons";
import { StartDiagnosisButton } from "@/components/sessions/start-diagnosis-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { TryThis, useItemDecisions, type TryActions } from "./try-this";
import type { ConnectedData, DiagnosisView, GoalView, ItemDecision, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { RefineInChat, ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, WorkLayout, refineLink, suggestionHref } from "./work-shell";

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

/** Where growth stalls, from the business's own figures. */
function StallSummary({ diagnosis }: { diagnosis: DiagnosisView }) {
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Gauge}>Where growth stalls</SectionTitle>
        <StatusBadge
          label={diagnosis.status === "approved" ? "Approved" : diagnosis.status === "needsReview" ? "Needs review" : "Waiting for approval"}
          tone={diagnosis.status === "approved" ? "good" : "warning"}
          className="[&_span]:normal-case"
        />
      </div>
      {diagnosis.hasData ? (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-heading text-2xl text-card-foreground">{STAGE_WORDS[diagnosis.stage] ?? diagnosis.stage}</span>
            <span className="text-sm text-muted-foreground">{diagnosis.stageReason}</span>
          </div>
          {diagnosis.stageFigures.length ? (
            <div className="flex flex-wrap gap-1.5">
              {diagnosis.stageFigures.map((figure) => (
                <FigureChip key={figure.id} figure={figure} />
              ))}
            </div>
          ) : null}
          {diagnosis.summary ? <p className="text-sm text-card-foreground">{diagnosis.summary}</p> : null}
        </>
      ) : (
        <p className="text-sm text-card-foreground">Not enough data. Connect Meta or upload a results file, then run the diagnosis again.</p>
      )}
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
    </Panel>
  );
}

/**
 * The 90-day roadmap in three phases. Each step names the problem with the business's own figures, the
 * action, the measure and the target, and "We'll try this" puts it in the outcome loop.
 */
export function Roadmap({ diagnosis, goal, decisions, actions, editor }: { diagnosis: DiagnosisView; goal: GoalView; decisions: Map<number, ItemDecision>; actions: TryActions; editor: boolean }) {
  const canTry = diagnosis.status !== "rejected" && diagnosis.status !== "archived";
  const goalChanged = goal && diagnosis.goalUsed && goal.text !== diagnosis.goalUsed;
  return (
    <section className="grid gap-3" aria-label="90-day roadmap">
      <SectionTitle icon={Rocket}>90-day roadmap</SectionTitle>
      <p className="text-sm text-muted-foreground">
        {diagnosis.goalUsed ? <>Aimed at &ldquo;{diagnosis.goalUsed}&rdquo;. </> : null}Every problem and target uses your own figures, never an outside benchmark.
        {goalChanged ? " Your goal has changed since; run the diagnosis again to aim at the new one." : ""}
      </p>
      <ol className="grid gap-3 xl:grid-cols-3">
        {PHASES.map((phase) => {
          const steps = diagnosis.roadmap.filter((row) => row.phase === phase.key);
          return (
            <li key={phase.key} className="grid content-start gap-2 rounded-2xl border border-border bg-gradient-to-b from-primary/[0.05] to-transparent p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <phase.icon aria-hidden className="size-4" />
                </span>
                <span className="grid">
                  <span className="text-sm font-semibold text-card-foreground">{phase.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {phase.weeks} · {phase.blurb}
                  </span>
                </span>
              </div>
              {steps.length === 0 ? <p className="px-1 text-xs text-muted-foreground">No step in this phase.</p> : null}
              {steps.map((step) => {
                const thin = step.figures.length === 0;
                return (
                  <article key={step.index} className="grid gap-2 rounded-xl border border-border bg-card p-3">
                    <h4 className="text-sm font-medium text-card-foreground">{step.action}</h4>
                    <p className={cn("text-xs", thin ? "text-warning" : "text-muted-foreground")}>
                      <span className="font-medium">Fixes:</span> {step.problem}
                    </p>
                    {step.figures.length ? (
                      <div className="flex flex-wrap gap-1">
                        {step.figures.map((figure) => (
                          <FigureChip key={figure.id} figure={figure} />
                        ))}
                      </div>
                    ) : null}
                    <div className="grid gap-0.5 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
                      <span className="text-muted-foreground">
                        Watch <span className="text-card-foreground">{step.targetMetric}</span>
                      </span>
                      <span className="flex items-center gap-1 font-medium text-card-foreground">
                        <ArrowRight aria-hidden className="size-3 text-primary" /> {step.target}
                      </span>
                    </div>
                    {canTry ? <TryThis index={step.index} decision={decisions.get(step.index)} editor={editor} actions={actions} defaultDays={phase.key === "fix" ? 30 : phase.key === "build" ? 60 : 90} /> : null}
                  </article>
                );
              })}
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
  /** The Run diagnosis button. Owners and Managers. */
  run: ReactNode;
  tab: TabData;
  goal: GoalView;
  diagnosis: DiagnosisView | null;
  onSaveGoal: (text: string) => Promise<void>;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
};

export function DiagnosticsTabView({ base, editor, data, run, tab, goal, diagnosis, onSaveGoal, decisions, tryActions, review }: DiagnosticsTabProps) {
  return (
    <WorkLayout
      main={
        <>
          <GoalCard key={goal?.text ?? "none"} goal={goal} editor={editor} onSave={onSaveGoal} />
          <WorkHero icon={Gauge} eyebrow="Growth Architect · Growth Diagnostics" title="Diagnostics" promise="Finds where growth stalls in your own data and turns it into a 90-day plan: Fix, Build, Scale." action={editor ? run : null}>
            {editor && !data.meta && data.resultsFiles === 0 ? <p className="text-xs text-warning">Nothing is connected yet, so a diagnosis would have no figures to read. Connect Meta or upload a results file first.</p> : null}
          </WorkHero>
          <DataChecklist data={data} base={base} />
          {diagnosis ? (
            <>
              <StallSummary diagnosis={diagnosis} />
              {diagnosis.roadmap.length ? (
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
        </>
      }
      rail={
        <>
          <RunningNow running={tab.running} finished={tab.finished} sessionHref={(projectId) => `${base}/work/diagnostics/${projectId}`} />
          <SuggestedNext suggestions={tab.suggestions} hrefFor={(row) => suggestionHref(base, row)} />
          <SharedLinks base={base} />
        </>
      }
    />
  );
}

/** The Diagnostics tab fed by Convex. */
export function DiagnosticsTab({ workspaceId, base, editor }: { workspaceId: Id<"workspaces">; base: string; editor: boolean }) {
  const tab = useQuery(api.workTabs.tab, { workspaceId, skillSlug: "growth-diagnostics" });
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
