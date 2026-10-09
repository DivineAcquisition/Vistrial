"use client";

import { useEffect, useState, useTransition } from "react";

import {
  decideAgentRequest,
  fetchRelayDraft,
  markRequestSentAction,
  withdrawRequestAction,
  type RelayDraftView,
} from "@/app/(workspace)/app/agents/actions";
import { AgentGlyph } from "@/components/live/agent-identity";
import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AGENTS } from "@/lib/agents/roster";
import type { WaitingItem } from "@/lib/live/model";
import { finalMessage } from "@/lib/relay/footer";
import { cn } from "@/lib/utils";

/**
 * The one card for an agent's approval or question. Every surface (panel,
 * Home, run viewer, record page) renders this against the same request, so a
 * decision in one place shows everywhere through the live channel.
 *
 * Messages to leads are never sent by Vistrial: once approved, the card shows
 * the final text to copy into the CRM and a button to mark it sent.
 */
export function AgentRequestCard({
  item,
  compact = false,
  className,
}: {
  item: WaitingItem;
  compact?: boolean;
  className?: string;
}) {
  const org = useOrg();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.preview ?? "");
  const [subject, setSubject] = useState("");
  const [relay, setRelay] = useState<RelayDraftView | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [localState, setLocalState] = useState<string | null>(null);
  const agent = item.agentId ? AGENTS[item.agentId] : null;
  const isRelay = item.agentId === "relay" && item.kind === "approval";
  const status = localState ?? item.status;
  const approved = status === "approved";
  const decided = status !== "pending";

  useEffect(() => {
    if (!isRelay || compact) return;
    let live = true;
    void fetchRelayDraft(item.id).then((result) => {
      if (!live || !result.ok) return;
      setRelay(result.data);
      setDraft(result.data.body);
      setSubject(result.data.subject ?? "");
    });
    return () => {
      live = false;
    };
  }, [isRelay, compact, item.id, item.status]);

  function decide(decision: "approve" | "reject" | "answer") {
    setError(null);
    start(async () => {
      const original = relay?.body ?? item.preview ?? "";
      const result = await decideAgentRequest({
        itemId: item.id,
        decision,
        reason: decision === "reject" ? reason : undefined,
        answer: decision === "answer" ? answer : undefined,
        editedPreview: editing && draft !== original ? draft : undefined,
        editedSubject: editing && relay?.channel === "email" && subject !== (relay.subject ?? "") ? subject : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.already) {
        setNote(result.data.already);
        return;
      }
      setEditing(false);
      if (result.data.state === "approved") {
        setLocalState("approved");
        setNote(null);
        return;
      }
      setNote(decision === "reject" ? "Rejected. Nothing was sent." : decision === "answer" ? "Answer sent." : "Approved. It continues now.");
    });
  }

  function markSent() {
    setError(null);
    start(async () => {
      const result = await markRequestSentAction(item.id);
      if (!result.ok) setError(result.error);
      else {
        setLocalState(result.data.state === "withdrawn" ? "withdrawn" : "succeeded");
        setNote(result.data.note ?? "Marked sent. It is logged on the case file.");
      }
    });
  }

  function withdraw() {
    setError(null);
    start(async () => {
      const result = await withdrawRequestAction(item.id, reason || undefined);
      if (!result.ok) setError(result.error);
      else {
        setLocalState("withdrawn");
        setNote("Withdrawn. Nothing was sent.");
      }
    });
  }

  async function copy() {
    const text = finalMessage(relay?.channel === "email" && subject ? `Subject: ${subject}\n\n${draft}` : draft, relay?.footer ?? null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it instead.");
    }
  }

  const used = relay?.facts.filter((fact) => fact.used) ?? [];
  const heading =
    item.kind === "question" ? "Question for you" : approved ? "Approved, ready to send from your CRM" : "Waiting for your approval";

  return (
    <article
      className={cn("live-enter rounded-xl border border-warning/30 bg-warning/5 p-3 sm:p-4", className)}
      aria-label={item.title}
    >
      <div className="flex items-start gap-3">
        {item.agentId ? <AgentGlyph agentId={item.agentId} size="md" /> : null}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-warning">{heading}</p>
          <h3 className="text-sm font-medium text-card-foreground">{item.title}</h3>
          {item.reason && !approved ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-card-foreground">Why: </span>
              {item.reason}
            </p>
          ) : null}
        </div>
      </div>

      {item.kind === "approval" && (relay || item.preview) && !compact ? (
        <div className="mt-3 space-y-2">
          {relay?.channel === "email" ? (
            editing && !approved ? (
              <Input aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            ) : (
              <p className="text-sm text-card-foreground">
                <span className="font-medium">Subject: </span>
                {subject}
              </p>
            )
          ) : null}
          {editing && !approved ? (
            <Textarea aria-label="Edit before approving" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
          ) : (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm text-card-foreground">
              {approved && relay ? finalMessage(draft, relay.footer) : draft}
            </p>
          )}
          {relay?.footer && !approved ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-card-foreground">Added by Vistrial at the end: </span>
              {relay.footer}
            </p>
          ) : null}
          {used.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer text-card-foreground">Based on {used.length} fact{used.length === 1 ? "" : "s"} from the case file</summary>
              <ul className="mt-1 space-y-1">
                {used.map((fact) => (
                  <li key={fact.key}>
                    <span className="font-medium text-card-foreground">{fact.label}: </span>
                    {fact.value}
                    {fact.quote ? <span className="block italic">“{fact.quote}”</span> : null}
                  </li>
                ))}
              </ul>
              {item.leadIds[0] ? (
                <a className="mt-1 inline-block underline" href={`/app/cases/${item.leadIds[0]}`}>
                  Open the case file
                </a>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}

      {item.kind === "question" && !decided && org.canApprove ? (
        <div className="mt-3">
          <Textarea aria-label="Your answer" placeholder="Your answer" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} />
        </div>
      ) : null}

      {rejecting ? (
        <div className="mt-3">
          <Textarea aria-label="Reason (optional)" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
        </div>
      ) : null}

      {agent && !compact ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {isRelay ? "Vistrial never sends this. You send it from your CRM, then mark it sent here." : agent.promise}
        </p>
      ) : null}

      {note ? (
        <p role="status" className="mt-3 text-sm text-card-foreground">
          {note}
        </p>
      ) : error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : approved ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!compact ? (
            <Button size="sm" variant="outline" onClick={copy} disabled={pending || !relay}>
              {copied ? "Copied" : "Copy message"}
            </Button>
          ) : null}
          <Button size="sm" onClick={markSent} disabled={pending}>
            I sent it from the CRM
          </Button>
          {org.canApprove ? (
            <Button size="sm" variant="ghost" onClick={withdraw} disabled={pending}>
              Withdraw
            </Button>
          ) : null}
        </div>
      ) : decided ? null : !org.canApprove ? (
        <p className="mt-3 text-xs text-muted-foreground">An owner or approver decides this.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.kind === "question" ? (
            <Button size="sm" onClick={() => decide("answer")} disabled={pending || !answer.trim()}>
              Send answer
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => decide("approve")} disabled={pending || (editing && !draft.trim())}>
                Approve
              </Button>
              {(relay || item.preview) && !compact ? (
                <Button size="sm" variant="outline" onClick={() => setEditing((on) => !on)} disabled={pending}>
                  {editing ? "Done editing" : "Edit"}
                </Button>
              ) : null}
            </>
          )}
          {rejecting ? (
            <Button size="sm" variant="destructive-outline" onClick={() => decide("reject")} disabled={pending}>
              Confirm reject
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} disabled={pending}>
              {item.kind === "question" ? "Skip" : "Reject"}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
