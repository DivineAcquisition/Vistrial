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
  money,
  shortDate,
} from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type Studio = FunctionReturnType<typeof api.studio.studio>;
type Step = { phase?: string | null; status: string; kind: string; resultCode: string };

const heading = "font-heading text-base text-card-foreground";

const MISSING_WORDS: Record<string, string> = {
  researchMarket: "the market to research",
  researchGeography: "the area to research",
  adBudget: "an ad budget",
  businessProfile: "a confirmed business profile",
};

/**
 * "Know what you know": everything the agent is working from, with where each item came from and when,
 * what is missing, and the assumptions it made. An Owner or Manager corrects a fact in place; the
 * correction is a new verified fact, and the old one is kept.
 */
export function ContextPanel({ workspaceId, studio, canEdit }: { workspaceId: Id<"workspaces">; studio: Studio; canEdit: boolean }) {
  const record = useMutation(api.facts.record);
  const remove = useMutation(api.facts.remove);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const context = studio.context;
  return (
    <Panel className="grid gap-4 p-4">
      <div className="grid gap-1">
        <h2 className={heading}>Business memory</h2>
        <p className="text-sm text-muted-foreground">What Vistrial knows about your business, shared across your research. Each item shows where it came from and when. Correct or remove anything that is wrong.</p>
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
                    <div className="flex flex-wrap gap-1">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void remove({ workspaceId, factId: fact.id as Id<"businessFacts"> }).then(
                            () => setNotice(`Removed ${fact.factKey}. Its history is kept, and the next run will not use it.`),
                            (problem: unknown) => setNotice(errorWords(problem, "It was not removed.")),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
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

/**
 * The task brief (doctrine 3.2): objective, deliverables, what is known with origin and date, what is
 * missing and assumed, which sources and tools are permitted, and the research budget. Built in code;
 * only the research questions and planned searches come from the model.
 */
export function BriefCard({ studio, capCents, reserveCents = 50 }: { studio: Studio; capCents: number; reserveCents?: number }) {
  const brief = studio.brief;
  const context = studio.context;
  const spent = studio.run?.costCents ?? 0;
  const row = "grid gap-1 border-t border-border pt-3 first:border-0 first:pt-0";
  const label = "text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase";
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <div className="grid gap-1">
        <h2 className={heading}>Task brief</h2>
        <p className="text-sm text-muted-foreground">Written before any research. The agent works from this, and the report is checked against it.</p>
      </div>
      <dl className="grid gap-3 text-sm">
        <div className={row}>
          <dt className={label}>Objective</dt>
          <dd className="text-card-foreground">{studio.project.objective}</dd>
        </div>
        <div className={row}>
          <dt className={label}>Deliverable</dt>
          <dd className="text-card-foreground">A market report with three actionable opportunities, each with its evidence, why it matters here, a proposed action, and how to tell if it worked.</dd>
        </div>
        <div className={row}>
          <dt className={label}>Already known</dt>
          <dd>
            {context && context.known.length > 0 ? (
              <ul className="grid gap-1">
                {context.known.map((item) => (
                  <li key={item.key} className="break-words">
                    <span className="text-card-foreground">{item.label}:</span> <span className="text-card-foreground">{item.value}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      ({item.origin === "project" ? "this assignment" : item.origin === "profile" ? "business profile" : `business fact, ${FACT_STATUS_WORDS[item.status]?.label.toLowerCase() ?? item.status}`}, {shortDate(item.recordedAt)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Read when the run starts.</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Missing, and assumed</dt>
          <dd>
            {context && (context.missing.length > 0 || context.assumptions.length > 0) ? (
              <ul className="grid gap-1 text-muted-foreground">
                {context.missing.map((item) => (
                  <li key={`m-${item.key}`}>
                    Missing: {MISSING_WORDS[item.key] ?? item.key}
                    {item.blocking ? " (it asks before researching)" : ""}
                  </li>
                ))}
                {context.assumptions.map((item) => (
                  <li key={`a-${item}`}>Assumed: {item}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">{context ? "Nothing missing." : "Read when the run starts."}</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Permitted sources and tools</dt>
          <dd className="text-card-foreground">
            {studio.project.platforms.map((platform) => PLATFORM_LABEL[platform] ?? platform).join(", ")}, through Claude web search, official APIs and embeds, and links you paste.{" "}
            <span className="text-muted-foreground">It never logs in anywhere and never works around a block.</span>
          </dd>
        </div>
        <div className={row}>
          <dt className={label}>Research budget</dt>
          <dd className="text-card-foreground">
            Up to {money(capCents)} for this run, with {money(reserveCents)} held back to check the report and fix it once. Spent so far: {money(spent)}.
          </dd>
        </div>
        {brief && brief.researchQuestions.length > 0 ? (
          <div className={row}>
            <dt className={label}>Questions it set out to answer</dt>
            <dd>
              <ul className="list-disc pl-5 text-muted-foreground">
                {brief.researchQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {brief && brief.searchQueries.length > 0 ? (
          <div className={row}>
            <dt className={label}>Planned searches</dt>
            <dd>
              <ul className="flex flex-wrap gap-2">
                {brief.searchQueries.map((item) => (
                  <li key={item} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  );
}
