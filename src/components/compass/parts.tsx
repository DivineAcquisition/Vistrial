"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { BookOpenIcon, ChartNoAxesColumnIcon, CircleHelpIcon, ListIcon, ThumbsDownIcon, ThumbsUpIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { confirmSuggestionAction, dismissSuggestionAction, feedbackAction } from "@/app/(workspace)/app/compass/actions";
import { useCompassChat } from "@/components/compass/chat";
import { ToolLine } from "@/components/sales-os/tool-line";
import { Button } from "@/components/ui/button";
import type { CompassAnswerMeta, CompassSource, LookupOutput, SuggestedAction } from "@/lib/compass/types";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** What Compass is doing, in a sentence. Never a function name. */
const STEP_LABELS: Record<string, { running: string; done: string }> = {
  find_leads: { running: "Finding leads", done: "Looked up leads" },
  read_case_file: { running: "Reading the case file", done: "Read the case file" },
  response_health: { running: "Checking response times", done: "Checked response times" },
  pipeline: { running: "Checking the pipeline", done: "Checked the pipeline" },
  objections: { running: "Checking objections", done: "Checked objections" },
  agent_activity: { running: "Checking what the agents did", done: "Checked what the agents did" },
  team_activity: { running: "Checking team activity", done: "Checked team activity" },
  metric_leads: { running: "Listing the leads behind a number", done: "Listed the leads behind a number" },
  product_help: { running: "Looking in Help", done: "Looked in Help" },
  read_call_transcript: { running: "Reading a call transcript", done: "Read a call transcript" },
  find_leads_by_theme: { running: "Searching calls for a theme", done: "Searched calls for a theme" },
};

function outputOf(props: ToolCallMessagePartProps): LookupOutput | null {
  const result = props.result as LookupOutput | undefined;
  return result && typeof result === "object" && "sources" in result ? result : null;
}

export function LookupStep(props: ToolCallMessagePartProps) {
  const labels = STEP_LABELS[props.toolName] ?? { running: "Looking this up", done: "Looked this up" };
  const output = outputOf(props);
  const statusType = props.status?.type;
  const running = statusType === "running" || statusType === "requires-action";
  const failed = statusType === "incomplete" || (output && !output.ok && (output.gap === "unavailable" || output.gap === "hidden"));
  return (
    <div className="flex flex-col gap-1">
      <ToolLine state={running ? "running" : failed ? "failed" : "done"}>
        {running ? labels.running : failed ? `${labels.running}: not available` : labels.done}
      </ToolLine>
      {output?.more ? (
        <Link href={output.more.href} className="ms-5.5 text-sm text-brand-300 underline-offset-4 hover:underline">
          Open all {output.more.total} in the lead list
        </Link>
      ) : null}
    </div>
  );
}

const KIND_VERB: Record<SuggestedAction["kind"], string> = {
  open_list: "Open the list",
  open_case_file: "Open the case file",
  relay_draft: "Ask Relay for a draft",
  scribe_refresh: "Rebuild the case file",
  next_action: "Add the follow-up",
  pin_question: "Pin the question",
};

/** A suggested action. Nothing happens until the person confirms it here. */
export function SuggestionCard(props: ToolCallMessagePartProps) {
  const { conversationId, readOnly } = useCompassChat();
  const router = useRouter();
  const [state, setState] = useState<{ kind: "idle" | "working" | "done" | "dismissed" | "error"; message?: string }>({ kind: "idle" });
  const output = outputOf(props) as LookupOutput<{ suggestion?: SuggestedAction }> | null;
  const suggestion = output?.data?.suggestion;

  if (props.status?.type === "running") return <ToolLine state="running">Preparing a suggestion</ToolLine>;
  if (!suggestion || state.kind === "dismissed") return null;

  if (suggestion.unavailable) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground" role="note">
        {suggestion.unavailable}
      </div>
    );
  }

  const id = conversationId();
  const confirm = async () => {
    if (!id) return;
    setState({ kind: "working" });
    const result = await confirmSuggestionAction(id, suggestion.id);
    if (!result.ok) {
      setState({ kind: "error", message: result.error });
      return;
    }
    if (result.data?.href && !suggestion.needsConfirm) {
      router.push(result.data.href);
      return;
    }
    setState({ kind: "done", message: result.message ?? "Done." });
  };
  const dismiss = async () => {
    setState({ kind: "dismissed" });
    if (id) await dismissSuggestionAction(id, suggestion.id);
  };

  if (!suggestion.needsConfirm) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={confirm} loading={state.kind === "working"} disabled={readOnly}>
          {suggestion.kind === "open_list" ? <ListIcon aria-hidden /> : <UserRoundIcon aria-hidden />}
          {suggestion.description}
        </Button>
        {state.kind === "error" ? <span className="text-sm text-destructive">{state.message}</span> : null}
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3"
      aria-label="Suggested action"
    >
      <p className={captionText}>Suggested. Nothing happens until you confirm.</p>
      <p className="text-sm text-card-foreground">{suggestion.description}</p>
      {state.kind === "done" ? (
        <p className="text-sm text-card-foreground" role="status">
          {state.message}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={confirm} loading={state.kind === "working"} disabled={readOnly || !id}>
            {KIND_VERB[suggestion.kind]}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} disabled={state.kind === "working" || readOnly}>
            Not now
          </Button>
          {state.kind === "error" ? (
            <span className="text-sm text-destructive" role="alert">
              {state.message}
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SourceIcon({ kind }: { kind: CompassSource["kind"] }) {
  if (kind === "lead") return <UserRoundIcon className="size-3.5" aria-hidden />;
  if (kind === "metric") return <ChartNoAxesColumnIcon className="size-3.5" aria-hidden />;
  if (kind === "help") return <BookOpenIcon className="size-3.5" aria-hidden />;
  return <ListIcon className="size-3.5" aria-hidden />;
}

function sourceKey(source: CompassSource): string {
  if (source.kind === "lead") return `lead:${source.id}`;
  if (source.kind === "metric") return `metric:${source.metric}:${source.range}`;
  if (source.kind === "help") return `help:${source.slug}`;
  return `list:${source.href}`;
}

/** What the answer was built from: real records and definitions, from the lookups, never from the model's words. */
export function AnswerSources({ sources }: { sources: CompassSource[] }) {
  const [all, setAll] = useState(false);
  if (!sources.length) return null;
  const shown = all ? sources : sources.slice(0, 6);
  return (
    <div className="flex flex-col gap-1.5">
      <p className={captionText}>Sources</p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((source) => (
          <li key={sourceKey(source)} className="inline-flex max-w-full items-center gap-0.5">
            <Link
              href={source.href}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-card-foreground hover:bg-muted"
            >
              <SourceIcon kind={source.kind} />
              <span className="truncate">
                {source.label}
                {source.kind === "metric" ? `, ${source.range}` : ""}
              </span>
            </Link>
            {source.kind === "metric" ? (
              <Link
                href={source.definition}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground"
                aria-label={`How "${source.label}" is counted`}
                title="How this is counted"
              >
                <CircleHelpIcon className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </li>
        ))}
        {sources.length > shown.length ? (
          <li>
            <button type="button" className="px-2 py-1 text-xs text-muted-foreground hover:text-card-foreground" onClick={() => setAll(true)}>
              {sources.length - shown.length} more
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function AnswerNotes({ meta }: { meta: CompassAnswerMeta }) {
  const notes: string[] = [];
  if (meta.outcome === "unverified" && meta.unverified?.length) {
    notes.push(
      `Compass couldn't match ${meta.unverified.length === 1 ? "one figure" : "some figures"} in this answer (${meta.unverified.slice(0, 4).join(", ")}) to what it looked up. Check Results before relying on ${meta.unverified.length === 1 ? "it" : "them"}.`
    );
  }
  if (meta.near) notes.push(meta.near);
  if (!notes.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {notes.map((note) => (
        <p key={note} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-card-foreground" role="note">
          {note}
        </p>
      ))}
    </div>
  );
}

const REASONS: Array<{ id: string; label: string }> = [
  { id: "wrong_number", label: "A number is wrong" },
  { id: "wrong_lead", label: "Wrong lead" },
  { id: "missed_something", label: "Missed something" },
  { id: "not_helpful", label: "Not helpful" },
  { id: "too_long", label: "Too long" },
  { id: "other", label: "Something else" },
];

/** Thumbs up or down, and on down, one tap for why. Only the rating is kept, never the text. */
export function AnswerFeedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  const send = async (next: "up" | "down", why: string | null = null) => {
    setRating(next);
    setReason(why);
    const result = await feedbackAction(messageId, next, why);
    setThanks(result.ok && (next === "up" || why !== null));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Was this answer useful?">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Useful"
          aria-pressed={rating === "up"}
          className={cn(rating === "up" && "text-brand-300")}
          onClick={() => send("up")}
        >
          <ThumbsUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Not useful"
          aria-pressed={rating === "down"}
          className={cn(rating === "down" && "text-brand-300")}
          onClick={() => send("down")}
        >
          <ThumbsDownIcon />
        </Button>
        {thanks ? (
          <span className={captionText} role="status">
            Thanks. That helps make Compass better.
          </span>
        ) : null}
      </div>
      {rating === "down" && reason === null ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What was wrong?">
          {REASONS.map((item) => (
            <Button key={item.id} variant="outline" size="xs" onClick={() => send("down", item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
