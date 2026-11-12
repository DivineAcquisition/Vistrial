"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Check, ChevronDown, ExternalLink, NotebookPenIcon, Plus, Trash2 } from "@/components/icons";
import { useChatPanel } from "@/components/chat/side-panel";
import { MeasuredChanges, OutcomeForm, RESULT_WORDS } from "@/components/research/outcome-loop";
import { useClientScope, useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { creditWords } from "@/lib/credits";
import { showError } from "@/lib/errors/show-error";
import { selectClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type Board = FunctionReturnType<typeof api.agentTasks.board>;
export type TaskCard = Board["columns"][number]["cards"][number];
export type Column = Board["columns"][number]["column"];
export type SelfNote = FunctionReturnType<typeof api.personalNotes.mine>[number];
type Result = keyof typeof RESULT_WORDS;

export const COLUMN_WORDS: Record<Column, { label: string; hint: string; empty: string }> = {
  proposed: { label: "Proposed", hint: "Waiting for an Owner or Admin", empty: "Nothing is waiting for a decision." },
  approved: { label: "Approved", hint: "Agreed, or being tried", empty: "Nothing approved is waiting to start." },
  running: { label: "Running", hint: "An agent is working", empty: "No agent is working on a task." },
  needsYou: { label: "Needs you", hint: "A question, a draft or a check-in", empty: "Nothing needs you." },
  done: { label: "Done", hint: "Finished, not yet measured", empty: "Nothing finished yet." },
  result: { label: "Result", hint: "What was measured at the check-in", empty: "No result has been measured yet." },
};

/**
 * Each stage has its own colour, used the same way everywhere on the board: the column's header, the edge
 * of its cards and its chip on a phone. The name is always written beside it, so colour is never the only sign.
 * Grey: waiting for a decision. Blue: agreed. Violet: an agent is working. Amber: needs a person.
 * Green: finished. Pink: measured (kept apart from the green and red of the outcome shown inside a Result card).
 */
export const STAGE_COLOR: Record<Column, { dot: string; header: string; edge: string; chip: string; count: string }> = {
  proposed: { dot: "bg-slate-400", header: "border-slate-400/70 bg-slate-400/10", edge: "border-l-slate-400", chip: "border-slate-400 bg-slate-400/15", count: "bg-slate-400/20 text-slate-700 dark:text-slate-200" },
  approved: { dot: "bg-sky-500", header: "border-sky-500/70 bg-sky-500/10", edge: "border-l-sky-500", chip: "border-sky-500 bg-sky-500/15", count: "bg-sky-500/20 text-sky-800 dark:text-sky-200" },
  running: { dot: "bg-violet-500", header: "border-violet-500/70 bg-violet-500/10", edge: "border-l-violet-500", chip: "border-violet-500 bg-violet-500/15", count: "bg-violet-500/20 text-violet-800 dark:text-violet-200" },
  needsYou: { dot: "bg-amber-500", header: "border-amber-500/70 bg-amber-500/10", edge: "border-l-amber-500", chip: "border-amber-500 bg-amber-500/15", count: "bg-amber-500/25 text-amber-900 dark:text-amber-200" },
  done: { dot: "bg-emerald-500", header: "border-emerald-500/70 bg-emerald-500/10", edge: "border-l-emerald-500", chip: "border-emerald-500 bg-emerald-500/15", count: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200" },
  result: { dot: "bg-fuchsia-500", header: "border-fuchsia-500/70 bg-fuchsia-500/10", edge: "border-l-fuchsia-500", chip: "border-fuchsia-500 bg-fuchsia-500/15", count: "bg-fuchsia-500/20 text-fuchsia-800 dark:text-fuchsia-200" },
};

export type ProposeInput = { title: string; why: string; ask: string; skillSlug: string; low?: number; high?: number; metric?: string };

/** Everything the board can do. Each resolves when it is done, or rejects with the server's words. */
export type BoardActions = {
  decide: (approvalId: string, approve: boolean, reason?: string) => Promise<unknown>;
  edit: (taskId: string, words: { title: string; why: string; ask?: string }) => Promise<unknown>;
  propose: (input: ProposeInput) => Promise<unknown>;
  reopen: (taskId: string) => Promise<unknown>;
  markDone: (taskId: string) => Promise<unknown>;
  recordOutcome: (decisionId: string, result: Result, note: string) => Promise<unknown>;
  addNote: (body: string) => Promise<unknown>;
  setNoteDone: (noteId: string, done: boolean) => Promise<unknown>;
  removeNote: (noteId: string) => Promise<unknown>;
};

const shortDate = (time: number) => new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const chip = "inline-flex max-w-full items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground";

/** The three things every card states: what it may return and on what basis, what it may cost, and what stands behind it. */
function Facts({ card }: { card: TaskCard }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const sources = card.evidence.filter((item) => item.kind === "sourceRef").length;
  return (
    <div className="grid gap-2 rounded-lg bg-overlay/[0.04] p-2.5">
      <dl className="grid gap-2 text-xs">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Expected return</dt>
          <dd className="flex flex-wrap items-center gap-1.5 text-card-foreground">
            <span className={cn("font-medium", !card.expectedReturn.known && "font-normal text-muted-foreground")}>{card.expectedReturn.text}</span>
            {card.expectedReturn.known ? <span className={chip}>{card.expectedReturn.basis}</span> : null}
          </dd>
          {card.expectedReturn.known && card.expectedReturn.basis === "Inference" ? (
            <dd className="text-[11px] leading-4 text-muted-foreground">
              An estimate, not a measurement. {sources > 0 ? `It rests on the ${sources === 1 ? "source" : `${sources} sources`} linked below.` : "No source is linked to it."}
            </dd>
          ) : null}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Credit cost</dt>
          <dd className="text-card-foreground tabular-nums">{card.creditCost > 0 ? `Up to ${creditWords(card.creditCost)}` : "No credits"}</dd>
        </div>
      </dl>
      {card.evidence.length > 0 ? (
        <div className="grid gap-1.5 border-t border-border pt-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
            className="flex items-center justify-between gap-2 rounded text-xs text-muted-foreground outline-none hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              Evidence: {card.evidence.length} {card.evidence.length === 1 ? "item" : "items"}
            </span>
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
          </button>
          {open ? (
            <ul id={id} className="grid gap-1.5 text-xs">
              {card.evidence.map((item, index) => (
                <li key={index} className="flex min-w-0 items-start gap-1.5">
                  <span className={cn(chip, "shrink-0")}>{item.kind === "sourceRef" ? "Source" : item.kind === "asset" ? "Report" : item.kind === "decision" ? "Earlier result" : "Your figure"}</span>
                  {item.href ? (
                    item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer noopener" className="min-w-0 break-words text-primary underline-offset-2 hover:underline">
                        {item.label} <ExternalLink aria-hidden className="inline size-3" />
                      </a>
                    ) : (
                      <Link href={item.href} className="min-w-0 break-words text-primary underline-offset-2 hover:underline">
                        {item.label}
                      </Link>
                    )
                  ) : (
                    <span className="min-w-0 break-words text-card-foreground">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">No evidence attached.</p>
      )}
    </div>
  );
}

function Card({ card, column, board, actions, onEdit, onSkip }: { card: TaskCard; column: Column; board: Board; actions: BoardActions; onEdit: (card: TaskCard) => void; onSkip: (card: TaskCard) => void }) {
  const [busy, setBusy] = useState(false);
  const panel = useChatPanel();
  const run = (work: Promise<unknown>) => {
    setBusy(true);
    void work.catch((problem: unknown) => showError(problem)).finally(() => setBusy(false));
  };
  return (
    <li className={cn("grid gap-2.5 rounded-xl border border-l-[3px] border-border bg-card p-3", STAGE_COLOR[column].edge)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {card.agentSlug ? <AgentAvatar slug={card.agentSlug} size="xs" className="size-5" /> : null}
        <span className={chip}>{card.type === "work" ? (card.skill ? `Agent work · ${card.skill}` : "Agent work") : "A change you make"}</span>
        {card.client ? <span className={cn(chip, "border-primary/30 text-primary")}>{card.client}</span> : null}
        {card.by === "person" ? <span className={chip}>From a teammate</span> : null}
      </div>
      <div className="grid gap-1">
        <h3 className="text-sm font-medium text-card-foreground">{card.title}</h3>
        {card.why ? <p className="text-xs leading-relaxed text-muted-foreground">{card.why}</p> : null}
      </div>

      {column === "result" && card.result ? (
        <div className="grid gap-2 rounded-lg bg-overlay/[0.04] p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge label={RESULT_WORDS[card.result.result].label} tone={RESULT_WORDS[card.result.result].tone} className="[&_span]:normal-case" />
            <span className="text-xs text-muted-foreground">Measured {shortDate(card.result.recordedAt)}</span>
          </div>
          <MeasuredChanges changes={card.result.changes} />
          {card.result.note ? <p className="text-xs text-card-foreground">&ldquo;{card.result.note}&rdquo;</p> : null}
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Expected beforehand: {card.expectedReturn.text}
            {card.expectedReturn.known ? ` (${card.expectedReturn.basis})` : ""}
          </p>
        </div>
      ) : (
        <Facts card={card} />
      )}

      {card.note ? <p className="text-xs text-card-foreground">{card.note}</p> : null}

      {column === "proposed" ? (
        board.canApprove && card.approvalId ? (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => run(actions.decide(card.approvalId!, true))}>
              <Check aria-hidden /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(card)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSkip(card)}>
              Skip
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {board.canWork ? (
              <Button size="sm" variant="outline" onClick={() => onEdit(card)}>
                Edit
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">An Owner or Admin approves or skips this.</span>
          </div>
        )
      ) : null}

      {panel && board.canWork ? (
        <button type="button" onClick={() => panel.openAbout({ kind: "task", id: card.id, title: card.title })} className="justify-self-start text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          Ask Vistrial about this
        </button>
      ) : null}

      {card.decisionId && board.canWork ? <OutcomeForm onSubmit={(result, note) => actions.recordOutcome(card.decisionId!, result, note).then(() => undefined, (problem: unknown) => void showError(problem, "That did not save."))} /> : null}

      {column !== "proposed" && (card.link || (board.canWork && card.type === "work" && (column === "approved" || column === "needsYou") && !card.decisionId)) ? (
        <div className="flex flex-wrap items-center gap-2">
          {card.link && !card.decisionId ? (
            <Link href={card.link.href} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
              {card.link.label}
            </Link>
          ) : null}
          {board.canWork && (column === "approved" || column === "needsYou") && !card.decisionId && card.checkInAt === null ? (
            <button type="button" disabled={busy} onClick={() => run(actions.markDone(card.id))} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Mark done
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ColumnView({ column, cards, children }: { column: Column; cards: TaskCard[]; children: ReactNode }) {
  const words = COLUMN_WORDS[column];
  return (
    <section aria-label={words.label} className="flex min-w-0 flex-col gap-2 md:w-[19rem] md:shrink-0">
      <header className={cn("flex items-baseline justify-between gap-2 rounded-lg border-t-2 px-2.5 py-2", STAGE_COLOR[column].header)}>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className={cn("size-2.5 rounded-full", STAGE_COLOR[column].dot, column === "running" && cards.length > 0 && "animate-pulse motion-reduce:animate-none")} aria-hidden />
          {words.label}
          <span className={cn("rounded-full px-1.5 text-[11px] leading-5 tabular-nums", STAGE_COLOR[column].count)}>{cards.length}</span>
        </h2>
        <span className="truncate text-[11px] text-muted-foreground">{words.hint}</span>
      </header>
      {cards.length > 0 ? <ul className="grid gap-2">{children}</ul> : <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{words.empty}</p>}
    </section>
  );
}

/** Notes to self: a person's own reminders, kept beside the board. No agent reads them and nobody else sees them. */
function Notes({ notes, actions, startOpen }: { notes: SelfNote[]; actions: BoardActions; startOpen: boolean }) {
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(startOpen);
  const open = notes.filter((note) => !note.done);
  const done = notes.filter((note) => note.done);
  return (
    <section aria-label="Notes to self" className="grid gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <NotebookPenIcon aria-hidden className="size-4 text-muted-foreground" /> Notes to self
          <span className="text-xs font-normal text-muted-foreground">Only you see these. No agent acts on them.</span>
        </h2>
        {!adding ? (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add a note
          </Button>
        ) : null}
      </div>
      {adding ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            void actions.addNote(body).then(
              () => setBody(""),
              (problem: unknown) => showError(problem),
            );
          }}
        >
          <Input autoFocus value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} placeholder="Something to remember, such as: ask Dana for October's numbers" aria-label="Note to self" className="min-w-0 flex-1" />
          <Button type="submit" size="sm" disabled={!body.trim()}>
            Save
          </Button>
        </form>
      ) : null}
      {notes.length > 0 ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {[...open, ...done].map((note) => (
            <li key={note.id} className="flex min-w-0 items-start gap-2 rounded-lg px-1 py-1 text-sm">
              <input type="checkbox" checked={note.done} onChange={(event) => void actions.setNoteDone(note.id, event.target.checked).catch((problem: unknown) => showError(problem))} aria-label={note.done ? "Mark as not done" : "Mark as done"} className="mt-1 size-4 shrink-0 accent-primary" />
              <span className="min-w-0 flex-1 break-words">
                <span className={note.done ? "text-muted-foreground line-through" : "text-card-foreground"}>{note.body}</span>
                {note.client ? <span className="ml-1.5 text-xs text-muted-foreground">· {note.client}</span> : null}
              </span>
              <button type="button" aria-label="Remove this note" onClick={() => void actions.removeNote(note.id).catch((problem: unknown) => showError(problem))} className="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="text-xs text-muted-foreground">Nothing noted.</p>
      ) : null}
    </section>
  );
}

const field = "grid gap-1 text-sm";
const fieldLabel = "text-card-foreground";
const fieldHint = "text-xs text-muted-foreground";

function ProposeDialog({ board, scopeLabel, onClose, actions }: { board: Board; scopeLabel: string; onClose: () => void; actions: BoardActions }) {
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [ask, setAsk] = useState("");
  const [skill, setSkill] = useState<string>(board.skills[0]?.slug ?? "");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [metric, setMetric] = useState("booked calls");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const ranged = low.trim() !== "" || high.trim() !== "";
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPopup className="p-4 sm:p-5">
        <DialogTitle className="mb-1 font-heading text-base">Propose a task</DialogTitle>
        <p className="mb-3 text-sm text-muted-foreground">For {scopeLabel}. It waits in Proposed until an Owner or Admin approves it; then the agent starts by asking what it needs.</p>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setNotice("");
            void actions
              .propose({ title, why, ask, skillSlug: skill, ...(ranged ? { low: Number(low), high: Number(high), metric } : {}) })
              .then(onClose, (problem: unknown) => setNotice(showError(problem)))
              .finally(() => setBusy(false));
          }}
        >
          <label className={field}>
            <span className={fieldLabel}>Title</span>
            <Input value={title} maxLength={140} onChange={(event) => setTitle(event.target.value)} placeholder="Research what competing programs charge" required />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Which agent work</span>
            <select value={skill} onChange={(event) => setSkill(event.target.value)} className={selectClass}>
              {board.skills.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}: {row.does}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span className={fieldLabel}>What should the agent work on?</span>
            <Textarea value={ask} maxLength={1000} rows={2} onChange={(event) => setAsk(event.target.value)} placeholder="What do executive coaching competitors charge for a twelve week program, and what do they include?" required />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Why now</span>
            <Textarea value={why} maxLength={600} rows={2} onChange={(event) => setWhy(event.target.value)} placeholder="Two competitors changed their pricing pages this month." />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className={cn(fieldLabel, "text-sm")}>Expected return (optional)</legend>
            <p className={fieldHint}>A range, never one number. Leave it empty and the card says &ldquo;Not enough data&rdquo;. Yours is shown as an inference.</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input inputMode="decimal" value={low} onChange={(event) => setLow(event.target.value)} aria-label="Low end" placeholder="2" className="w-20" />
              <span className="text-muted-foreground">to</span>
              <Input inputMode="decimal" value={high} onChange={(event) => setHigh(event.target.value)} aria-label="High end" placeholder="5" className="w-20" />
              <span className="text-muted-foreground">more</span>
              <Input value={metric} maxLength={60} onChange={(event) => setMetric(event.target.value)} aria-label="Measured in" className="min-w-0 flex-1" />
              <span className="text-muted-foreground">a month</span>
            </div>
          </fieldset>
          {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !title.trim() || !ask.trim()}>
              Propose
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function EditDialog({ card, onClose, actions }: { card: TaskCard; onClose: () => void; actions: BoardActions }) {
  const [title, setTitle] = useState(card.title);
  const [why, setWhy] = useState(card.why);
  const [ask, setAsk] = useState(card.ask ?? "");
  const [notice, setNotice] = useState("");
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPopup className="p-4 sm:p-5">
        <DialogTitle className="mb-1 font-heading text-base">Edit before deciding</DialogTitle>
        <p className="mb-3 text-sm text-muted-foreground">You can change the words. The expected return and its evidence stay as the agent worked them out.</p>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.edit(card.id, { title, why, ...(card.type === "work" ? { ask } : {}) }).then(onClose, (problem: unknown) => setNotice(showError(problem)));
          }}
        >
          <label className={field}>
            <span className={fieldLabel}>Title</span>
            <Input value={title} maxLength={140} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Why</span>
            <Textarea value={why} maxLength={600} rows={3} onChange={(event) => setWhy(event.target.value)} />
          </label>
          {card.type === "work" ? (
            <label className={field}>
              <span className={fieldLabel}>What the agent is asked</span>
              <Textarea value={ask} maxLength={1000} rows={3} onChange={(event) => setAsk(event.target.value)} required />
            </label>
          ) : null}
          {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function SkipDialog({ card, onClose, actions }: { card: TaskCard; onClose: () => void; actions: BoardActions }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPopup className="p-4 sm:p-5">
        <DialogTitle className="mb-1 font-heading text-base">Skip this task</DialogTitle>
        <p className="mb-3 text-sm text-muted-foreground">&ldquo;{card.title}&rdquo; leaves the board. Nothing runs and no credits are used. It is kept under Skipped and can be proposed again.</p>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.decide(card.approvalId!, false, reason).then(onClose, (problem: unknown) => showError(problem));
          }}
        >
          <label className={field}>
            <span className={fieldLabel}>Why (optional)</span>
            <Input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Not this month" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Keep it
            </Button>
            <Button type="submit" variant="outline">
              Skip
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * The Tasks board. Six columns; inside each, cards are ranked by expected return. On a phone one column
 * shows at a time, chosen from a row of counts. Approving and skipping are always buttons, never a drag.
 */
export function TaskBoardView({
  board,
  notes,
  scopeLabel,
  actions,
  initialColumn,
  initialDialog,
}: {
  board: Board | undefined;
  notes: SelfNote[] | undefined;
  /** Who new work is for: the client picker's choice, in words. */
  scopeLabel: string;
  actions: BoardActions;
  initialColumn?: Column;
  /** Stories open a dialog straight away. */
  initialDialog?: "propose" | "edit" | "skip" | "note";
}) {
  const firstBusy = board?.columns.find((row) => row.cards.length > 0)?.column;
  const [column, setColumn] = useState<Column | null>(initialColumn ?? null);
  const shown = column ?? (board?.columns.find((row) => row.column === "needsYou" && row.cards.length > 0)?.column ?? firstBusy ?? "proposed");
  const firstProposed = board?.columns[0]?.cards[0] ?? null;
  const [proposing, setProposing] = useState(initialDialog === "propose");
  const [editing, setEditing] = useState<TaskCard | null>(initialDialog === "edit" ? firstProposed : null);
  const [skipping, setSkipping] = useState<TaskCard | null>(initialDialog === "skip" ? firstProposed : null);
  const [showSkipped, setShowSkipped] = useState(false);
  const total = board?.columns.reduce((sum, row) => sum + row.cards.length, 0) ?? 0;

  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description="Your agents propose work, with what each is expected to return, what it may cost in credits and the evidence behind it. You approve; agents do the work. Each column is ranked by expected return."
        actions={
          board?.canWork ? (
            <Button variant="primary" onClick={() => setProposing(true)}>
              <Plus aria-hidden /> Propose a task
            </Button>
          ) : undefined
        }
      />

      {board && board.spendLimit !== null ? (
        <p className="text-xs text-muted-foreground">
          Spending limit: work that may use more than {creditWords(board.spendLimit)} waits for an Owner or Admin. <Link href="/app/settings?section=agents" className="text-primary underline-offset-2 hover:underline">Change it in Settings</Link>
        </p>
      ) : null}

      {notes ? <Notes notes={notes} actions={actions} startOpen={initialDialog === "note"} /> : null}

      {board === undefined ? (
        <p className="text-sm text-muted-foreground">Loading the board.</p>
      ) : total === 0 && board.skipped.length === 0 ? (
        <EmptyState
          preview="board"
          title="No tasks yet."
          detail="When a report finishes, results change or a check-in comes back, your agents propose what to do next here, each with its expected return, credit cost and evidence. You can also propose one yourself."
        />
      ) : (
        <>
          {/* A phone shows one column at a time. */}
          <div role="tablist" aria-label="Columns" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
            {board.columns.map((row) => (
              <button
                key={row.column}
                type="button"
                role="tab"
                aria-selected={shown === row.column}
                onClick={() => setColumn(row.column)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  shown === row.column ? cn(STAGE_COLOR[row.column].chip, "text-foreground") : "border-border text-muted-foreground",
                )}
              >
                <span className={cn("size-2 rounded-full", STAGE_COLOR[row.column].dot)} aria-hidden />
                {COLUMN_WORDS[row.column].label}
                <span className="tabular-nums">{row.cards.length}</span>
              </button>
            ))}
          </div>
          {/* Positioned, so visually hidden inputs inside a card scroll with the board and never widen the page. */}
          <div className="relative min-w-0 md:overflow-x-auto md:pb-3">
            <div className="grid min-w-0 gap-4 md:flex md:w-max md:items-start">
              {board.columns.map((row) => (
                <div key={row.column} className={cn(shown === row.column ? "block" : "hidden", "min-w-0 md:block")}>
                  <ColumnView column={row.column} cards={row.cards}>
                    {row.cards.map((card) => (
                      <Card key={card.id} card={card} column={row.column} board={board} actions={actions} onEdit={setEditing} onSkip={setSkipping} />
                    ))}
                  </ColumnView>
                </div>
              ))}
            </div>
          </div>

          {board.skipped.length > 0 ? (
            <section aria-label="Skipped" className="grid gap-2">
              <button type="button" aria-expanded={showSkipped} onClick={() => setShowSkipped((value) => !value)} className="flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronDown aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", showSkipped && "rotate-180")} />
                Skipped ({board.skipped.length})
              </button>
              {showSkipped ? (
                <ul className="grid gap-1.5">
                  {board.skipped.map((card) => (
                    <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="text-card-foreground">{card.title}</span>
                        {card.skippedReason ? <span className="text-muted-foreground"> · {card.skippedReason}</span> : null}
                      </span>
                      {board.canWork ? (
                        <Button size="sm" variant="ghost" onClick={() => void actions.reopen(card.id).catch((problem: unknown) => showError(problem))}>
                          Propose again
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {proposing && board ? <ProposeDialog board={board} scopeLabel={scopeLabel} onClose={() => setProposing(false)} actions={actions} /> : null}
      {editing ? <EditDialog card={editing} onClose={() => setEditing(null)} actions={actions} /> : null}
      {skipping ? <SkipDialog card={skipping} onClose={() => setSkipping(null)} actions={actions} /> : null}
    </div>
  );
}

/** The board fed by Convex, filtered by the client picker. */
export function TaskBoard() {
  const shell = useWorkspaceShell();
  const { scope, clientId } = useClientScope();
  const workspaceId = shell?.workspaceId;
  const board = useQuery(api.agentTasks.board, workspaceId ? { workspaceId, scope } : "skip");
  const notes = useQuery(api.personalNotes.mine, workspaceId ? { workspaceId } : "skip");
  const decide = useMutation(api.approvals.decide);
  const edit = useMutation(api.agentTasks.edit);
  const propose = useMutation(api.agentTasks.propose);
  const reopen = useMutation(api.agentTasks.reopen);
  const markDone = useMutation(api.agentTasks.markDone);
  const recordOutcome = useMutation(api.decisions.recordOutcome);
  const addNote = useMutation(api.personalNotes.add);
  const updateNote = useMutation(api.personalNotes.update);
  const removeNote = useMutation(api.personalNotes.remove);
  if (!shell || !workspaceId) return null;
  const chosen = shell.clients?.find((row) => row.id === clientId);
  const actions: BoardActions = {
    decide: (approvalId, approve, reason) => decide({ workspaceId, approvalId: approvalId as Id<"approvals">, approve, ...(reason ? { reason } : {}) }),
    edit: (taskId, words) => edit({ workspaceId, agentTaskId: taskId as Id<"agentTasks">, ...words }),
    propose: (input) =>
      propose({
        workspaceId,
        title: input.title,
        why: input.why,
        ask: input.ask,
        skillSlug: input.skillSlug,
        ...(clientId ? { clientId } : {}),
        ...(input.low !== undefined && input.high !== undefined ? { expectedReturn: { basis: "inferred" as const, low: input.low, high: input.high, metric: input.metric } } : {}),
      }),
    reopen: (taskId) => reopen({ workspaceId, agentTaskId: taskId as Id<"agentTasks"> }),
    markDone: (taskId) => markDone({ workspaceId, agentTaskId: taskId as Id<"agentTasks"> }),
    recordOutcome: (decisionId, result, note) => recordOutcome({ workspaceId, decisionId: decisionId as Id<"decisions">, result, note }),
    addNote: (body) => addNote({ workspaceId, body, ...(clientId ? { clientId } : {}) }),
    setNoteDone: (noteId, done) => updateNote({ workspaceId, personalNoteId: noteId as Id<"personalNotes">, done }),
    removeNote: (noteId) => removeNote({ workspaceId, personalNoteId: noteId as Id<"personalNotes"> }),
  };
  return <TaskBoardView board={board} notes={notes} scopeLabel={chosen?.name ?? "your organization itself"} actions={actions} />;
}
