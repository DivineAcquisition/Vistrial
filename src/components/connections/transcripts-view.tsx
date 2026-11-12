"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { FileText, ShieldCheck, Trash2 } from "@/components/icons";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";

export type TranscriptRow = {
  id: string;
  title: string;
  tool: string;
  callDate: string | null;
  words: number;
  createdAt: number;
  agents: string[];
  opening: string;
};

export type NewTranscript = { title: string; tool: string; callDate?: string; text: string; consentConfirmed: boolean };

const TOOLS = ["Fathom", "Fireflies", "Otter", "Granola", "tl;dv", "Zoom", "Google Meet", "Other"];
/** The same words the setup guide gives a lawyer to approve. */
export const CONSENT_WORDS =
  "I recorded this call lawfully. Everyone on it was told it was being recorded and transcribed, and agreed where the law requires it. I may share this transcript with Vistrial.";
const MAX_FILE_BYTES = 1_200_000;

function AddTranscript({ onAdd }: { onAdd: (input: NewTranscript) => Promise<string | null> }) {
  const ids = useId();
  const [title, setTitle] = useState("");
  const [tool, setTool] = useState(TOOLS[0]);
  const [callDate, setCallDate] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = title.trim() && text.trim() && consent && !busy;

  return (
    <form
      className="grid gap-3 rounded-2xl border border-border bg-card p-4"
      aria-label="Add a call transcript"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setBusy(true);
        setProblem(null);
        const failed = await onAdd({ title, tool, ...(callDate ? { callDate } : {}), text, consentConfirmed: consent });
        setBusy(false);
        if (failed) {
          setProblem(failed);
          return;
        }
        setTitle("");
        setCallDate("");
        setText("");
        setFileName(null);
        setConsent(false);
      }}
    >
      <div className="grid gap-0.5">
        <h3 className="flex items-center gap-2 font-medium text-card-foreground">
          <FileText aria-hidden className="size-4 text-muted-foreground" /> Upload or paste a transcript
        </h3>
        <p className="text-sm text-muted-foreground">
          Works with any note taker. Copy the transcript out of your tool, or export it as a text file. Text only: Vistrial never takes audio or video.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-title`}>
          <span className="text-foreground">Call title</span>
          <Input id={`${ids}-title`} value={title} maxLength={120} placeholder="Discovery call, Harbor Dental" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-tool`}>
          <span className="text-foreground">Recorded with</span>
          <select
            id={`${ids}-tool`}
            value={tool}
            onChange={(event) => setTool(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            {TOOLS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-date`}>
          <span className="text-foreground">Call date</span>
          <Input id={`${ids}-date`} type="date" value={callDate} onChange={(event) => setCallDate(event.target.value)} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-file`}>
        <span className="text-foreground">Transcript file (.txt, .vtt, .srt or .md)</span>
        <input
          id={`${ids}-file`}
          type="file"
          accept=".txt,.vtt,.srt,.md,text/plain,text/vtt,text/markdown"
          className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setProblem(null);
            if (file.size > MAX_FILE_BYTES) {
              setProblem("That file is too large to be a transcript. Vistrial takes text only, never audio or video.");
              return;
            }
            // The file is read here in the browser; only its text is sent.
            setText(await file.text());
            setFileName(file.name);
            if (!title.trim()) setTitle(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120));
          }}
        />
      </label>
      <label className="grid gap-1.5 text-sm" htmlFor={`${ids}-text`}>
        <span className="text-foreground">{fileName ? `Text from ${fileName}` : "Or paste the transcript"}</span>
        <textarea
          id={`${ids}-text`}
          value={text}
          rows={6}
          placeholder={"Dana: Thanks for making time. What made you book the call?\nProspect: …"}
          className="min-h-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          onChange={(event) => {
            setText(event.target.value);
            setFileName(null);
          }}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground" htmlFor={`${ids}-consent`}>
        <input id={`${ids}-consent`} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{CONSENT_WORDS}</span>
      </label>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden className="size-3.5" /> Kept for this organization only, until you delete it.
        </p>
        <Button type="submit" size="sm" disabled={!ready}>
          {busy ? "Adding" : "Add transcript"}
        </Button>
      </div>
    </form>
  );
}

/** Call transcripts from any note taker: add one, see what is kept, choose which agents may use it, delete it. */
export function TranscriptsView({
  transcripts,
  agents,
  canEdit,
  canGrant,
  highlight,
  onAdd,
  onRemove,
  onGrant,
}: {
  transcripts: TranscriptRow[];
  agents: { slug: string; name: string }[];
  canEdit: boolean;
  canGrant: boolean;
  highlight?: string | null;
  onAdd: (input: NewTranscript) => Promise<string | null>;
  onRemove: (id: string) => Promise<void>;
  onGrant: (id: string, agentSlug: string, granted: boolean) => void;
}) {
  return (
    <div className="grid gap-3" id="transcripts">
      {canEdit ? (
        <AddTranscript onAdd={onAdd} />
      ) : (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          An Owner, Admin or Member can add call transcripts from any note taker.
        </p>
      )}
      {transcripts.map((row) => {
        const granted = new Set(row.agents);
        return (
          <article
            key={row.id}
            id={`transcript-${row.id}`}
            aria-label={`${row.title} transcript`}
            className={`grid gap-3 rounded-2xl border bg-card p-4 ${highlight === row.id ? "border-primary" : "border-border"}`}
          >
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <h3 className="flex items-center gap-2 font-medium text-card-foreground">
                  <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" /> <span className="min-w-0 break-words">{row.title}</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {row.tool}
                  {row.callDate ? `, call on ${new Date(`${row.callDate}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })}` : ""}.{" "}
                  {row.words.toLocaleString()} words, added {new Date(row.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.
                </p>
              </div>
              <span className="flex items-center gap-2">
                <StatusBadge label="Your data" tone="brand" className="[&_span]:normal-case" />
                {canEdit ? (
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${row.title} transcript`}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    }
                    title="Delete this transcript?"
                    description="Its text is deleted and agents stop using it. Reports already written keep their citation and short quote."
                    confirmLabel="Delete transcript"
                    onConfirm={() => onRemove(row.id)}
                  />
                ) : null}
              </span>
            </header>
            {agents.length > 0 ? (
              <ul className="grid gap-2 border-t border-border pt-3" aria-label="Agents that may use this transcript">
                {agents.map((agent) => (
                  <li key={agent.slug} className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <AgentAvatar slug={agent.slug} size="xs" className="size-5" />
                      {agent.name}
                    </span>
                    {canGrant ? (
                      <Switch aria-label={`Let ${agent.name} use the ${row.title} transcript`} checked={granted.has(agent.slug)} onCheckedChange={(next) => onGrant(row.id, agent.slug, next)} />
                    ) : (
                      <span className="text-muted-foreground">{granted.has(agent.slug) ? "May use it" : "Not granted"}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
