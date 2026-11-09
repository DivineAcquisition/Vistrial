"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { CalendarIcon, CheckCircle2, Target } from "@/components/icons";
import { MeasuredChanges, OutcomeForm, RESULT_WORDS } from "@/components/research/outcome-loop";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import type { ItemDecision } from "./types";

const DAYS = [14, 30, 60, 90] as const;
type Result = keyof typeof RESULT_WORDS;

export type TryActions = {
  plan: (index: number, days: number) => Promise<void>;
  record: (decisionId: string, result: Result, note: string) => Promise<void>;
  remove: (decisionId: string) => Promise<void>;
};

/**
 * "We'll try this" under one offer change or roadmap step: a check-in date, then "What happened" when it
 * is due. The same outcome loop as a report opportunity; the next session reads the result.
 */
export function TryThis({ index, decision, editor, actions, defaultDays = 30 }: { index: number; decision: ItemDecision | undefined; editor: boolean; actions: TryActions; defaultDays?: number }) {
  const [days, setDays] = useState<number>(defaultDays);
  const [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!decision) {
    if (!editor) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void actions.plan(index, days).then(
              () => setBusy(false),
              (problem: unknown) => {
                setBusy(false);
                setNotice(showError(problem, "That did not save."));
              },
            );
          }}
        >
          <Target aria-hidden className="size-4" /> We&apos;ll try this
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
        {notice ? <span className="text-xs text-destructive">{notice}</span> : null}
      </div>
    );
  }

  const outcome = decision.outcome;
  const dueForm = !outcome && decision.due;
  return (
    <div className="grid gap-2">
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
      {editor && (recording || dueForm) ? (
        <OutcomeForm onSubmit={(result, note) => actions.record(decision.id, result, note).then(() => setRecording(false), (problem: unknown) => setNotice(showError(problem, "That did not save.")))} />
      ) : null}
      {editor && !recording && !dueForm ? (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setRecording(true)}>
            {outcome ? "Update what happened" : "Record what happened now"}
          </button>
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => void actions.remove(decision.id)}>
            {outcome ? "Delete this record" : "We're not trying this after all"}
          </button>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </div>
  );
}

/** The decisions made on one asset's items, and the actions to make more. */
export function useItemDecisions(workspaceId: Id<"workspaces">, assetId: Id<"assets"> | null) {
  const rows = useQuery(api.decisions.forAsset, assetId ? { workspaceId, assetId } : "skip");
  const plan = useMutation(api.decisions.planItem);
  const record = useMutation(api.decisions.recordOutcome);
  const remove = useMutation(api.decisions.remove);
  const actions: TryActions = {
    plan: async (index, checkInDays) => {
      if (assetId) await plan({ workspaceId, assetId, index, checkInDays });
    },
    record: async (decisionId, result, note) => {
      await record({ workspaceId, decisionId: decisionId as Id<"decisions">, result, note });
    },
    remove: async (decisionId) => {
      await remove({ workspaceId, decisionId: decisionId as Id<"decisions"> });
    },
  };
  return { byIndex: new Map((rows ?? []).map((row) => [row.opportunityIndex, row])), actions };
}
