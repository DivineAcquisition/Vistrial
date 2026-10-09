"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { LockIcon, LockOpenIcon, PencilIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";

import {
  acceptScribeSuggestionAction,
  editCaseFieldAction,
  fetchScribeCaseFile,
  lockCaseFieldAction,
  scribeFeedbackAction,
} from "@/app/(workspace)/app/cases/scribe-actions";
import { AgentGlyph, formatAgo } from "@/components/live/agent-identity";
import { useRunViewer } from "@/components/live/run-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CASE_FILE_STATUS_LABEL, formatFieldValue, type CaseFieldView, type ScribeCaseFileView } from "@/lib/scribe/view";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { building: "info", ready: "success", needs_review: "warning", held: "error" } as const;
const SPEAKER = { prospect: "the lead", team: "your team", unknown: "someone on the call" } as const;

/** Scribe's case file for one lead, kept current as Scribe or a teammate changes it. */
export function ScribeCaseFile({ leadId, initial }: { leadId: string; initial: ScribeCaseFileView | null }) {
  const [file, setFile] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const viewer = useRunViewer();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchScribeCaseFile(leadId).then((result) => {
          if (result.ok) setFile(result.data);
        });
      }, 400);
    };
    let channel = supabase.channel(`case-file:${leadId}`);
    for (const table of ["case_files", "case_file_fields"]) {
      channel = channel.on("postgres_changes" as never, { event: "*", schema: "public", table, filter: `lead_id=eq.${leadId}` }, refetch);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [leadId]);

  const refresh = async (action: Promise<{ ok: boolean; error?: string }>) => {
    const result = await action;
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setError(null);
    const next = await fetchScribeCaseFile(leadId);
    if (next.ok) setFile(next.data);
  };

  if (!file) {
    return (
      <Card className="mb-6 flex items-start gap-3 p-4">
        <AgentGlyph agentId="scribe" size="sm" />
        <div className="text-sm">
          <p className="font-medium text-card-foreground">No case file yet</p>
          <p className="text-muted-foreground">Scribe writes one after the first call with a transcript. Every fact will link to where it was said.</p>
        </div>
      </Card>
    );
  }

  const present = file.fields.filter((f) => f.state !== "absent");
  const missing = file.fields.filter((f) => f.state === "absent");

  return (
    <Card className="mb-6 space-y-4 p-4" aria-label="Case file">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AgentGlyph agentId="scribe" size="sm" working={file.status === "building"} />
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Case file</h2>
            <p className="text-xs text-muted-foreground">
              Written by Scribe{file.builtAt ? `, updated ${formatAgo(file.builtAt)}` : ""} · version {file.version}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[file.status]}>{CASE_FILE_STATUS_LABEL[file.status]}</Badge>
          {file.lastRunId ? (
            <Button variant="ghost" size="sm" onClick={() => viewer.open(file.lastRunId!)}>
              How Scribe got here
            </Button>
          ) : null}
        </div>
      </div>

      {file.status === "held" && file.heldReason ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive-foreground">
          {file.heldReason} No follow-up will be drafted until someone releases it.
        </p>
      ) : null}
      {file.reviewReasons.length ? (
        <ul className="space-y-1 rounded-md border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground">
          {file.reviewReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Where things stand</p>
          <p className="text-sm text-card-foreground">{file.summary ?? "Scribe has not written a summary yet."}</p>
          {file.nextStep ? (
            <p className="text-sm">
              <span className="font-medium">Next step: </span>
              {file.nextStep}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Readiness</p>
          <p className="text-sm font-medium text-card-foreground">
            {file.band ?? "Not scored yet"}
            {file.score != null ? <span className="ml-1 font-normal text-muted-foreground">({file.score})</span> : null}
          </p>
          {file.readinessReason ? <p className="text-sm text-muted-foreground">{file.readinessReason}</p> : null}
        </div>
      </div>

      {present.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What we know</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {present.map((field) => (
              <FieldRow key={field.key} field={field} leadId={leadId} onAction={refresh} />
            ))}
          </ul>
        </div>
      ) : null}

      {missing.length || file.openQuestions.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {missing.length ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Not discussed yet</p>
              <ul className="space-y-1">
                {missing.map((field) => (
                  <FieldRow key={field.key} field={field} leadId={leadId} onAction={refresh} compact />
                ))}
              </ul>
            </div>
          ) : null}
          {file.openQuestions.length ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Still to find out</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-card-foreground">
                {file.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function FieldRow({
  field,
  leadId,
  onAction,
  compact = false,
}: {
  field: CaseFieldView;
  leadId: string;
  onAction: (action: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value == null ? "" : String(field.value));
  const [rated, setRated] = useState<"right" | "wrong" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => startTransition(() => onAction(action()));

  const save = () =>
    run(async () => {
      const result = await editCaseFieldAction({ leadId, fieldKey: field.key, value: draft.trim() || null });
      if (result.ok) setEditing(false);
      return result;
    });

  const editor = (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input aria-label={field.label} value={draft} maxLength={500} autoFocus onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );

  if (compact) {
    return (
      <li className="text-sm">
        {editing ? (
          editor
        ) : (
          <button type="button" className="text-left text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
            {field.label} <span className="text-xs">(add)</span>
          </button>
        )}
      </li>
    );
  }

  return (
    <li className={cn("space-y-1 p-3", pending && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{field.label}</p>
          {editing ? (
            editor
          ) : (
            <p className="text-sm text-card-foreground">
              {field.state === "unclear" && field.value == null ? <span className="text-muted-foreground">Came up, but unclear</span> : formatFieldValue(field.value)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {field.source === "person" ? <Badge variant="secondary">Edited</Badge> : null}
          {field.locked ? <Badge variant="outline">Locked</Badge> : null}
          {!editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${field.label}`} onClick={() => setEditing(true)}>
              <PencilIcon />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={field.locked ? `Unlock ${field.label}` : `Lock ${field.label} so Scribe leaves it alone`}
            onClick={() => run(() => lockCaseFieldAction({ leadId, fieldKey: field.key, locked: !field.locked }))}
          >
            {field.locked ? <LockIcon /> : <LockOpenIcon />}
          </Button>
          {field.source === "scribe" ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Scribe got this right"
                aria-pressed={rated === "right"}
                onClick={() => {
                  setRated("right");
                  run(() => scribeFeedbackAction({ leadId, fieldKey: field.key, verdict: "right" }));
                }}
              >
                <ThumbsUpIcon className={rated === "right" ? "text-success" : undefined} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Scribe got this wrong"
                aria-pressed={rated === "wrong"}
                onClick={() => {
                  setRated("wrong");
                  run(() => scribeFeedbackAction({ leadId, fieldKey: field.key, verdict: "wrong" }));
                }}
              >
                <ThumbsDownIcon className={rated === "wrong" ? "text-destructive" : undefined} />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {field.quote ? (
        <p className="text-xs text-muted-foreground">
          <span className="italic">&ldquo;{field.quote}&rdquo;</span>
          {field.from ? (
            <>
              {" "}
              said by {SPEAKER[field.from.speaker]} ·{" "}
              <Link className="underline underline-offset-2 hover:text-foreground" href={`/app/calls/${field.from.callId}`}>
                Open the call
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {field.suggestion != null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-xs">
          <span>
            Scribe heard <span className="font-medium">{formatFieldValue(field.suggestion)}</span> on the latest call. {field.reviewNote}
          </span>
          <Button size="sm" variant="outline" onClick={() => run(() => acceptScribeSuggestionAction({ leadId, fieldKey: field.key }))}>
            Use this
          </Button>
        </div>
      ) : null}
    </li>
  );
}
