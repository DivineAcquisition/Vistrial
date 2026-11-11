"use client";

import { canWork } from "@/lib/roles";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, CheckCircle2, FlaskConical } from "lucide-react";
import { useId, useState } from "react";

import { CheckInRow } from "@/components/home/waiting-rows";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { showError } from "@/lib/errors/show-error";

type Result = "better" | "same" | "worse" | "tooEarly" | "notTried";

export const RESULT_WORDS: Record<Result, { label: string; tone: "good" | "neutral" | "critical" | "warning" }> = {
  better: { label: "It helped", tone: "good" },
  same: { label: "No clear change", tone: "neutral" },
  worse: { label: "It made things worse", tone: "critical" },
  tooEarly: { label: "Too early to tell", tone: "warning" },
  notTried: { label: "We didn't try it", tone: "neutral" },
};
const RESULT_ORDER: Result[] = ["better", "same", "worse", "tooEarly", "notTried"];
const DAYS = [14, 30, 60, 90] as const;

export type ChangeView = { label: string; metric: string; before: number; after: number; percent: number };

function shortDate(time: number) {
  return new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Before and after, from the same source, as measured. */
export function MeasuredChanges({ changes }: { changes: ChangeView[] }) {
  if (changes.length === 0) {
    return <p className="text-xs text-muted-foreground">No measured change: connect Meta or upload a results file before and after to compare.</p>;
  }
  return (
    <ul className="grid gap-1 text-xs">
      {changes.map((row) => (
        <li key={`${row.label}-${row.metric}`} className="flex flex-wrap gap-1 text-muted-foreground">
          <span className="text-card-foreground">
            {row.label} {row.metric}
          </span>
          <span className="tabular-nums">
            {row.before.toLocaleString()} → {row.after.toLocaleString()}
          </span>
          <span
            className={
              // Spending less is not worse, so spend carries no colour.
              row.metric === "spend" || row.percent === 0 ? "tabular-nums" : row.percent > 0 ? "text-success tabular-nums" : "text-destructive tabular-nums"
            }
          >
            ({row.percent > 0 ? "+" : ""}
            {row.percent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What happened: a result and a few words. Today's figures are read on the server. */
export function OutcomeForm({ onSubmit }: { onSubmit: (result: Result, note: string) => Promise<void> }) {
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const ids = useId();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!result) return;
        setWorking(true);
        void onSubmit(result, note).finally(() => setWorking(false));
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm text-card-foreground">What happened?</legend>
        <div className="flex flex-wrap gap-2">
          {RESULT_ORDER.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${result === value ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground"}`}
            >
              <input type="radio" name={`${ids}-result`} value={value} checked={result === value} onChange={() => setResult(value)} className="sr-only" />
              {RESULT_WORDS[value].label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-sm" htmlFor={`${ids}-note`}>
        <span className="text-muted-foreground">In your words (optional): what you did, what you noticed</span>
        <Textarea id={`${ids}-note`} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} />
      </label>
      <Button type="submit" size="sm" className="w-fit" disabled={!result || working}>
        {working ? "Saving…" : "Save what happened"}
      </Button>
    </form>
  );
}

/**
 * Under each report opportunity: "We'll try this" with a check-in date, then "What happened" when it is
 * time. The next research session reads the result.
 */
export function OpportunityDecision({
  workspaceId,
  projectId,
  index,
  ready,
}: {
  workspaceId: Id<"workspaces">;
  projectId: Id<"researchProjects">;
  index: number;
  /** The report is saved, so its opportunities can be acted on. */
  ready: boolean;
}) {
  const shell = useWorkspaceShell();
  const decisions = useQuery(api.decisions.forProject, ready ? { workspaceId, projectId } : "skip");
  const plan = useMutation(api.decisions.plan);
  const record = useMutation(api.decisions.recordOutcome);
  const remove = useMutation(api.decisions.remove);
  const [days, setDays] = useState<number>(30);
  const [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false);
  if (!ready || decisions === undefined || !shell) return null;
  const canEdit = canWork(shell.role);
  const decision = decisions.find((row) => row.opportunityIndex === index);

  if (!decision) {
    if (!canEdit) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void plan({ workspaceId, projectId, opportunityIndex: index, checkInDays: days }).then(
              () => setNotice(""),
              (problem: unknown) => setNotice(showError(problem, "That did not save.")),
            )
          }
        >
          <FlaskConical aria-hidden className="size-4" /> We&apos;ll try this
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Check back in
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-card-foreground"
          >
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </select>
        </label>
        {notice ? <span className="text-xs text-destructive">{notice}</span> : null}
      </div>
    );
  }

  const outcome = decision.outcome;
  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {outcome ? (
          <>
            <CheckCircle2 aria-hidden className="size-4 text-muted-foreground" />
            <StatusBadge label={RESULT_WORDS[outcome.result].label} tone={RESULT_WORDS[outcome.result].tone} className="[&_span]:normal-case" />
            <span className="text-xs text-muted-foreground">Recorded {shortDate(outcome.recordedAt)}. The next research session builds on this.</span>
          </>
        ) : (
          <>
            <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
            <span className="text-card-foreground">You&apos;re trying this.</span>
            <span className="text-xs text-muted-foreground">
              {decision.due ? "Check-in due now." : `Check-in ${shortDate(decision.checkInAt)}.`}
              {decision.baseline.length > 0 ? ` Starting figures saved from ${decision.baseline.map((row) => row.label).join(", ")}.` : ""}
            </span>
          </>
        )}
      </div>
      {outcome ? (
        <>
          {outcome.note ? <p className="text-sm text-card-foreground">&ldquo;{outcome.note}&rdquo;</p> : null}
          <MeasuredChanges changes={outcome.changes} />
        </>
      ) : null}
      {canEdit && (recording || (!outcome && decision.due)) ? (
        <OutcomeForm
          onSubmit={(result, note) =>
            record({ workspaceId, decisionId: decision.id, result, note }).then(
              () => setRecording(false),
              (problem: unknown) => setNotice(showError(problem, "That did not save.")),
            )
          }
        />
      ) : null}
      {canEdit && !recording && !(!outcome && decision.due) ? (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setRecording(true)}>
            {outcome ? "Update what happened" : "Record what happened now"}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => void remove({ workspaceId, decisionId: decision.id })}
          >
            {outcome ? "Delete this record" : "We're not trying this after all"}
          </button>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </div>
  );
}

/** On the Decisions page: check-ins whose date has come, so the loop closes. */
export function CheckInsDue() {
  const shell = useWorkspaceShell();
  const due = useQuery(api.decisions.due, shell ? { workspaceId: shell.workspaceId } : "skip");
  if (!shell || !due || due.length === 0) return null;
  return (
    <Panel className="grid gap-3 p-4 sm:p-6">
      <h2 className="font-heading text-base text-card-foreground">Check-ins due</h2>
      <p className="text-sm text-muted-foreground">You said you&apos;d try these. Say what happened, and the next research builds on it.</p>
      <ul className="grid gap-3">
        {due.map((row) => (
          <li key={row.id}>
            <CheckInRow row={row} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
