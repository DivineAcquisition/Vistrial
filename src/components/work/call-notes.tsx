"use client";

import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, Loader2, MessageSquareText, Mic, Square, Trash2, TriangleAlert } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { showError } from "@/lib/errors/show-error";
import type { api } from "../../../convex/_generated/api";

import { SectionTitle } from "./work-shell";

export type NotesData = FunctionReturnType<typeof api.callNotes.recent>;
type Note = NotesData["notes"][number];

const FIT: { field: "need" | "budget" | "decider" | "timing" | "fit"; label: string; hint: string }[] = [
  { field: "need", label: "Need", hint: "What they want solved" },
  { field: "budget", label: "Budget", hint: "What they said they can spend" },
  { field: "decider", label: "Who decides", hint: "Who else signs off" },
  { field: "timing", label: "Timing", hint: "When they want to start" },
  { field: "fit", label: "Fit with the offer", hint: "Which package, or why not" },
];

/** The most a memo may run: a minute of the closer's own voice. */
const MEMO_SECONDS = 60;

export type NoteInput = {
  contactRef?: string;
  dealRef?: string;
  appointmentRef?: string;
  leadName?: string;
  outcome: Note["outcome"];
  nextStep?: string;
  nextStepDue?: number;
  fit: { field: (typeof FIT)[number]["field"]; value: string }[];
  objections: { title: string; itemId?: string }[];
  memo?: { blob: Blob; seconds: number };
};

export type NotesActions = { saveNote: (input: NoteInput) => Promise<unknown> };

/** A voice memo of up to a minute, recorded in the browser. Nothing is sent until the notes are saved. */
function MemoRecorder({ memo, onChange }: { memo: { blob: Blob; seconds: number } | null; onChange: (memo: { blob: Blob; seconds: number } | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stop();
    setRecording(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const length = Math.min(MEMO_SECONDS, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        onChange({ blob: new Blob(chunks, { type: media.mimeType || "audio/webm" }), seconds: length });
      };
      recorder.current = media;
      started.current = Date.now();
      setSeconds(0);
      media.start();
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - started.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MEMO_SECONDS) stop();
      }, 250);
    } catch {
      showError(new Error("The microphone could not be opened. Type your notes instead."));
    }
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">A voice memo of up to a minute, in your own words. Record yourself, never the call. Dealmaker transcribes it and deletes the audio.</p>
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <Button size="sm" variant="outline" onClick={stop}>
            <Square aria-hidden className="size-3.5" />
            Stop ({MEMO_SECONDS - seconds}s left)
          </Button>
        ) : memo ? (
          <>
            <Badge variant="success" size="sm">
              <CheckCircle2 aria-hidden className="size-3" />
              Memo recorded, {memo.seconds}s
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              <Trash2 aria-hidden className="size-3.5" />
              Discard
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void start()}>
            <Mic aria-hidden className="size-3.5" />
            Record a memo
          </Button>
        )}
      </div>
    </div>
  );
}

/** The closer's notes after one call: everything here is their own account. */
export function CallNotesForm({
  lead,
  options,
  actions,
  onDone,
}: {
  lead: { contactRef?: string; dealRef?: string | null; appointmentRef?: string; leadName: string; askName?: boolean };
  options: Pick<NotesData, "outcomes" | "objections">;
  actions: NotesActions;
  onDone: () => void;
}) {
  const [leadName, setLeadName] = useState("");
  const [outcome, setOutcome] = useState<Note["outcome"]>("proposal");
  const [nextStep, setNextStep] = useState("");
  const [due, setDue] = useState("");
  const [fit, setFit] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [memo, setMemo] = useState<{ blob: Blob; seconds: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await actions.saveNote({
        ...(lead.contactRef ? { contactRef: lead.contactRef } : {}),
        ...(lead.dealRef ? { dealRef: lead.dealRef } : {}),
        ...(lead.appointmentRef ? { appointmentRef: lead.appointmentRef } : {}),
        ...(lead.askName ? { leadName } : {}),
        outcome,
        ...(nextStep.trim() ? { nextStep } : {}),
        ...(due ? { nextStepDue: new Date(`${due}T17:00:00`).getTime() } : {}),
        fit: FIT.map((row) => ({ field: row.field, value: fit[row.field] ?? "" })).filter((row) => row.value.trim()),
        objections: [...picked.map((itemId) => ({ title: "", itemId })), ...(other.trim() ? [{ title: other }] : [])],
        ...(memo ? { memo } : {}),
      });
      onDone();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/40 p-3" data-call-notes>
      <p className="text-xs text-muted-foreground">Your notes on the call with {lead.leadName}. They are shown as your account, with your name; they never change your CRM.</p>
      {lead.askName ? <Input aria-label="Who the call was with" value={leadName} onChange={(event) => setLeadName(event.target.value)} placeholder="Who the call was with" /> : null}
      <label className="grid gap-1 text-xs text-muted-foreground">
        How it ended
        <Select aria-label="How it ended" value={outcome} onChange={(event) => setOutcome(event.target.value as Note["outcome"])} options={options.outcomes.map((row) => ({ value: row.id, label: row.label }))} />
      </label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input aria-label="The next step" value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="The next step, and who does it" />
        <Input aria-label="Due" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIT.map((row) => (
          <Input key={row.field} aria-label={row.label} value={fit[row.field] ?? ""} onChange={(event) => setFit({ ...fit, [row.field]: event.target.value })} placeholder={`${row.label}: ${row.hint}`} />
        ))}
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-xs text-muted-foreground">Objections you heard</legend>
        {options.objections.length ? (
          <div className="flex flex-wrap gap-2">
            {options.objections.map((row) => {
              const on = picked.includes(row.id);
              return (
                <Button key={row.id} size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((id) => id !== row.id) : [...picked, row.id])}>
                  {on ? <CheckCircle2 aria-hidden className="size-3.5" /> : null}
                  {row.title}
                </Button>
              );
            })}
          </div>
        ) : null}
        <Input aria-label="Another objection" value={other} onChange={(event) => setOther(event.target.value)} placeholder="Another objection, in a few words" />
      </fieldset>
      <MemoRecorder memo={memo} onChange={setMemo} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || (lead.askName && !leadName.trim())} onClick={() => void save()}>
          {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
          Save notes
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Notes from recent calls, newest first, each the closer's account. */
export function RecentNotes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
      <SectionTitle icon={MessageSquareText}>Call notes</SectionTitle>
      <ul className="grid gap-2">
        {notes.map((note) => (
          <li key={note.id} className="grid min-w-0 gap-1.5 rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{note.leadName}</span>
              <Badge variant="outline" size="sm">
                {note.outcomeWords}
              </Badge>
            </div>
            {note.nextStep ? (
              <p className="text-foreground">
                Next: {note.nextStep}
                {note.nextStepDue ? <span className="text-muted-foreground"> · due {new Date(note.nextStepDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
              </p>
            ) : null}
            {note.fit.length ? (
              <ul className="grid gap-0.5 text-xs text-foreground">
                {note.fit.map((row) => (
                  <li key={row.field}>
                    <span className="font-medium">{FIT.find((item) => item.field === row.field)?.label}:</span> {row.value}
                  </li>
                ))}
              </ul>
            ) : null}
            {note.objections.length ? <p className="text-xs text-muted-foreground">Objections heard: {note.objections.join(", ")}</p> : null}
            {note.memo ? (
              note.memo.status === "done" ? (
                <blockquote className="border-l-2 border-border pl-3 text-xs break-words text-foreground">&ldquo;{note.memo.transcript}&rdquo;</blockquote>
              ) : note.memo.status === "transcribing" ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 aria-hidden className="size-3 animate-spin" /> Transcribing the memo…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <TriangleAlert aria-hidden className="size-3" /> {note.memo.problem}
                </span>
              )
            ) : null}
            <p className="text-xs text-muted-foreground">Rep&apos;s account, {note.writtenBy}.</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
