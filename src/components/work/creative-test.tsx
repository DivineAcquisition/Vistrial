"use client";

import { useState } from "react";

import { CalendarIcon, CheckCircle2, Target } from "@/components/icons";
import { MeasuredChanges, OutcomeForm, RESULT_WORDS } from "@/components/research/outcome-loop";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";

import type { CreativeView } from "./types";

const DAYS = [14, 30, 60, 90] as const;
type Result = keyof typeof RESULT_WORDS;

export type TestActions = {
  start: (days: number) => Promise<void>;
  record: (testId: string, result: Result, winnerKey: string | null, note: string) => Promise<void>;
  remove: (testId: string) => Promise<void>;
};

/**
 * Under an approved ad set: "We're running this" with a check-in date, then "What happened" and which
 * variation did best. The next ad set for the same brand builds on the answer.
 */
export function CreativeTest({ test, approved, variations, editor, actions }: { test: CreativeView["test"]; approved: boolean; variations: { key: string; hook: string }[]; editor: boolean; actions: TestActions }) {
  const [days, setDays] = useState<number>(14);
  const [winner, setWinner] = useState<string | null>(test?.outcome?.winner?.key ?? null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const failed = (problem: unknown) => {
    setBusy(false);
    setNotice(showError(problem, "That did not save."));
  };

  if (!test) {
    if (!editor || !approved) return null;
    return (
      <section className="grid gap-2" aria-label="Running this ad set">
        <h4 className="font-heading text-sm text-card-foreground">Once these ads are live</h4>
        <p className="text-sm text-muted-foreground">Tell Vistrial you are running them. It saves your figures today, reminds you here to check back, and the next ad set for this brand builds on the variation that won.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void actions.start(days).then(() => setBusy(false), failed);
            }}
          >
            <Target aria-hidden className="size-4" /> We&apos;re running this
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Check back in
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-card-foreground">
              {DAYS.map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
          </label>
        </div>
        {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
      </section>
    );
  }

  const outcome = test.outcome;
  const showForm = editor && (recording || (!outcome && test.due));
  return (
    <section className="grid gap-2" aria-label="Running this ad set">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {outcome ? (
          <>
            <CheckCircle2 aria-hidden className="size-4 text-muted-foreground" />
            <StatusBadge label={RESULT_WORDS[outcome.result].label} tone={RESULT_WORDS[outcome.result].tone} className="[&_span]:normal-case" />
            <span className="text-xs text-muted-foreground">Recorded {shortDate(outcome.recordedAt)}</span>
          </>
        ) : (
          <>
            <CalendarIcon aria-hidden className="size-4 text-primary" />
            <span className="text-card-foreground">You&apos;re running this ad set.</span>
            <span className="text-xs text-muted-foreground">
              {test.due ? "Check-in due now." : `Check-in ${shortDate(test.checkInAt)}.`}
              {test.baseline.length > 0 ? ` Starting figures saved from ${test.baseline.map((row) => row.label).join(", ")}.` : ""}
            </span>
          </>
        )}
      </div>
      {outcome ? (
        <>
          <p className="text-sm text-card-foreground">
            {outcome.winner ? (
              <>
                Variation {outcome.winner.key} did best: &ldquo;{outcome.winner.hook}&rdquo;
              </>
            ) : (
              "No variation stood out."
            )}
          </p>
          {outcome.note ? <p className="text-sm text-muted-foreground">&ldquo;{outcome.note}&rdquo;</p> : null}
          <MeasuredChanges changes={outcome.changes} />
        </>
      ) : null}
      {showForm ? (
        <div className="grid gap-3 rounded-xl border border-border p-3">
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs text-muted-foreground">Which variation did best?</legend>
            {[...variations, { key: "", hook: "None stood out" }].map((row) => {
              const on = (winner ?? "") === row.key;
              return (
                <label key={row.key || "none"} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm", on ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground")}>
                  <input type="radio" name={`winner-${test.id}`} className="mt-1" checked={on} onChange={() => setWinner(row.key || null)} />
                  <span className="min-w-0">
                    {row.key ? <span className="text-card-foreground">{row.key}: </span> : null}
                    {row.hook}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <OutcomeForm onSubmit={(result, note) => actions.record(test.id, result, winner, note).then(() => setRecording(false), failed)} />
        </div>
      ) : null}
      {editor && !showForm ? (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setRecording(true)}>
            {outcome ? "Update what happened" : "Record what happened now"}
          </button>
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => void actions.remove(test.id).catch(failed)}>
            {outcome ? "Delete this record" : "We're not running this after all"}
          </button>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </section>
  );
}
