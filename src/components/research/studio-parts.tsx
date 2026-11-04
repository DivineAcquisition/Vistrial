"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FACT_SOURCE_WORDS,
  FACT_STATUS_WORDS,
  PLATFORM_LABEL,
  SOURCE_STATE_WORDS,
  STAGES,
  errorWords,
  shortDate,
} from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type Studio = FunctionReturnType<typeof api.studio.studio>;
type Step = { phase?: string | null; status: string; kind: string; resultCode: string };

const heading = "font-heading text-base text-card-foreground";

/**
 * "Know what you know": everything the agent is working from, with where each item came from and when,
 * what is missing, and the assumptions it made. An Owner or Manager corrects a fact in place; the
 * correction is a new verified fact, and the old one is kept.
 */
export function ContextPanel({ workspaceId, studio, canEdit }: { workspaceId: Id<"workspaces">; studio: Studio; canEdit: boolean }) {
  const record = useMutation(api.facts.record);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const context = studio.context;
  return (
    <Panel className="grid gap-4 p-4">
      <div className="grid gap-1">
        <h2 className={heading}>Context</h2>
        <p className="text-sm text-muted-foreground">What the agent knows, where it came from, and what it had to assume.</p>
      </div>
      {!context ? <p className="text-sm text-muted-foreground">Read when the run starts.</p> : null}
      {context ? (
        <dl className="grid gap-3 text-sm">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Market</dt>
            <dd className="text-card-foreground">{context.market || "Not given"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Area</dt>
            <dd className="text-card-foreground">{context.geography || "Not given"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Business profile</dt>
            <dd className="text-card-foreground">{context.profile ? `Confirmed. Offer: ${context.profile.offer}` : "No confirmed profile."}</dd>
          </div>
        </dl>
      ) : null}
      {context && context.facts.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-card-foreground">Business facts</h3>
          <ul className="grid gap-3">
            {context.facts.map((fact) => {
              const status = FACT_STATUS_WORDS[fact.status] ?? FACT_STATUS_WORDS.unverified;
              return (
                <li key={fact.id} className="grid gap-1 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium break-words text-card-foreground">{fact.factKey}</span>
                    <StatusBadge label={status.label} tone={status.tone} className="[&_span]:normal-case" />
                  </div>
                  {editing === fact.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void record({ workspaceId, factKey: fact.factKey, value }).then(
                          () => {
                            setEditing(null);
                            setNotice("Saved as a verified fact. The next run uses it; the old value is kept in its history.");
                          },
                          (problem: unknown) => setNotice(errorWords(problem, "The fact was not saved.")),
                        );
                      }}
                    >
                      <label className="sr-only" htmlFor={`fact-${fact.id}`}>
                        New value for {fact.factKey}
                      </label>
                      <Input id={`fact-${fact.id}`} value={value} onChange={(event) => setValue(event.target.value)} />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={!value.trim()}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-sm break-words text-card-foreground">{fact.value}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {FACT_SOURCE_WORDS[fact.sourceType] ?? fact.sourceType}, {shortDate(fact.recordedAt)}
                  </p>
                  {canEdit && editing !== fact.id ? (
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(fact.id);
                          setValue(fact.value);
                        }}
                      >
                        Correct
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {studio.brief && (studio.brief.missing.length > 0 || studio.brief.assumptions.length > 0) ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-card-foreground">Missing, and what it assumed</h3>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {studio.brief.missing.map((row) => (
              <li key={`m-${row.gap}`}>Missing: {row.gap}</li>
            ))}
            {studio.brief.assumptions.map((row) => (
              <li key={`a-${row}`}>Assumed: {row}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {notice}
      </p>
    </Panel>
  );
}

/**
 * The run asks one question when the answer would change the result. The card says exactly what happens
 * on answer, so the person approves a resolved action, not a vague prompt.
 */
export function QuestionCard({ workspaceId, studio, canAnswer }: { workspaceId: Id<"workspaces">; studio: Studio; canAnswer: boolean }) {
  const answer = useMutation(api.runs.answer);
  const resume = useMutation(api.runs.resume);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const run = studio.run;
  if (!run || (run.status !== "waiting" && run.status !== "needsInput") || !run.waitingFor) return null;
  const timedOut = run.status === "needsInput";
  return (
    <Panel className="grid gap-3 border-warning/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={timedOut ? "Needs Input — Timed Out" : "Waiting for User"} tone={timedOut ? "critical" : "warning"} className="[&_span]:normal-case" />
        <span className="text-xs text-muted-foreground">Asked {shortDate(run.waitingFor.askedAt)}</span>
      </div>
      <p className="font-heading text-lg text-card-foreground">{run.waitingFor.question}</p>
      <p className="text-sm text-muted-foreground">
        The answer changes what gets researched, so the agent stopped instead of guessing. Nothing runs or spends while it waits.
      </p>
      {timedOut ? (
        <>
          <p className="text-sm text-muted-foreground">No answer came within seven days. Resuming asks the same question again, with a new seven days.</p>
          {canAnswer ? (
            <div>
              <Button
                type="button"
                onClick={() => void resume({ workspaceId, runId: run.id }).catch((problem: unknown) => setNotice(errorWords(problem, "It did not resume.")))}
              >
                Resume
              </Button>
            </div>
          ) : null}
        </>
      ) : canAnswer ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void answer({ workspaceId, runId: run.id, questionId: run.waitingFor!.questionId, answer: text }).then(
              () => setText(""),
              (problem: unknown) => setNotice(errorWords(problem, "The answer was not saved.")),
            );
          }}
        >
          <label className="sr-only" htmlFor="question-answer">
            Your answer
          </label>
          <Input id="question-answer" value={text} onChange={(event) => setText(event.target.value)} />
          <p className="text-xs text-muted-foreground">Your answer is saved as a verified business fact, and the research picks up where it stopped.</p>
          <div>
            <Button type="submit" disabled={!text.trim()}>
              Answer and continue
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">An owner or manager answers.</p>
      )}
      <p role="status" className="min-h-5 text-sm text-destructive">
        {notice}
      </p>
    </Panel>
  );
}

/** The doctrine's five stages, each marked done, working, or still to come, from the run's own steps. */
export function StageProgress({ steps, open }: { steps: Step[]; open: boolean }) {
  const lastPhase = steps.at(-1)?.phase ?? null;
  const current = lastPhase ? STAGES.findIndex((stage) => (stage.phases as readonly string[]).includes(lastPhase)) : open ? 0 : -1;
  return (
    <ol className="grid gap-3" aria-label="Stages">
      {STAGES.map((stage, index) => {
        const done = index < current || (!open && index <= current);
        const working = open && index === current;
        const label = done ? "Done" : working ? "Working" : "To come";
        return (
          <li key={stage.id} className="flex gap-3">
            <span
              aria-hidden
              className={
                done
                  ? "mt-1 size-2.5 shrink-0 rounded-full bg-success"
                  : working
                    ? "live-pulse mt-1 size-2.5 shrink-0 rounded-full bg-brand-500"
                    : "mt-1 size-2.5 shrink-0 rounded-full border border-border"
              }
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">
                {stage.label} <span className="font-normal text-muted-foreground">· {label}</span>
              </p>
              <p className="text-xs text-muted-foreground">{stage.words}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Each source's honest status for the run. A source that could not see something says so. */
export function SourceStatusList({ statuses }: { statuses: { platform: string; state: string; reasonCode: string; found: number }[] }) {
  if (statuses.length === 0) return <p className="text-sm text-muted-foreground">No sources checked yet.</p>;
  return (
    <ul className="grid gap-2">
      {statuses.map((row) => {
        const state = SOURCE_STATE_WORDS[row.state] ?? SOURCE_STATE_WORDS.unavailable;
        return (
          <li key={row.platform} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-28 text-card-foreground">{PLATFORM_LABEL[row.platform] ?? row.platform}</span>
            <StatusBadge label={state.label} tone={state.tone} className="[&_span]:normal-case" />
            <span className="text-muted-foreground">{row.found} found</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The plan the agent wrote before it researched anything. */
export function BriefCard({ studio }: { studio: Studio }) {
  const brief = studio.brief;
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <h2 className={heading}>Brief</h2>
      <p className="text-sm text-card-foreground">{studio.project.objective}</p>
      {!brief ? <p className="text-sm text-muted-foreground">The agent writes its plan here before it researches.</p> : null}
      {brief && brief.researchQuestions.length > 0 ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium text-card-foreground">Questions it set out to answer</h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {brief.researchQuestions.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {brief && brief.searchQueries.length > 0 ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium text-card-foreground">Planned searches</h3>
          <ul className="flex flex-wrap gap-2">
            {brief.searchQueries.map((row) => (
              <li key={row} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                {row}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
