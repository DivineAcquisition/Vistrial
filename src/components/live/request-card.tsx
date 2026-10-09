"use client";

import { useState, useTransition } from "react";

import { decideAgentRequest } from "@/app/(workspace)/app/agents/actions";
import { AgentGlyph } from "@/components/live/agent-identity";
import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AGENTS } from "@/lib/agents/roster";
import type { WaitingItem } from "@/lib/live/model";
import { cn } from "@/lib/utils";

/**
 * The one card for an agent's approval or question. Every surface (panel,
 * Home, run viewer, record page) renders this against the same request, so a
 * decision in one place shows everywhere through the live channel.
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
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agent = item.agentId ? AGENTS[item.agentId] : null;
  const decided = item.status !== "pending";

  function decide(decision: "approve" | "reject" | "answer") {
    setError(null);
    start(async () => {
      const result = await decideAgentRequest({
        itemId: item.id,
        decision,
        reason: decision === "reject" ? reason : undefined,
        answer: decision === "answer" ? answer : undefined,
        editedPreview: editing && draft !== item.preview ? draft : undefined,
      });
      if (!result.ok) setError(result.error);
      else if (result.data.already) setNote(result.data.already);
      else setNote(decision === "reject" ? "Rejected." : decision === "answer" ? "Answer sent." : "Approved. It continues now.");
    });
  }

  return (
    <article
      className={cn("live-enter rounded-xl border border-warning/30 bg-warning/5 p-3 sm:p-4", className)}
      aria-label={item.title}
    >
      <div className="flex items-start gap-3">
        {item.agentId ? <AgentGlyph agentId={item.agentId} size="md" /> : null}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-warning">{item.kind === "question" ? "Question for you" : "Waiting for your approval"}</p>
          <h3 className="text-sm font-medium text-card-foreground">{item.title}</h3>
          {item.reason ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-card-foreground">Why: </span>
              {item.reason}
            </p>
          ) : null}
        </div>
      </div>

      {item.kind === "approval" && item.preview && !compact ? (
        <div className="mt-3">
          {editing ? (
            <Textarea
              aria-label="Edit before approving"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
            />
          ) : (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm text-card-foreground">{draft}</p>
          )}
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

      {agent && !compact ? <p className="mt-3 text-xs text-muted-foreground">{agent.promise}</p> : null}

      {note ? (
        <p role="status" className="mt-3 text-sm text-card-foreground">
          {note}
        </p>
      ) : error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : !org.canApprove ? (
        <p className="mt-3 text-xs text-muted-foreground">An owner or approver decides this.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.kind === "question" ? (
            <Button size="sm" onClick={() => decide("answer")} disabled={pending || !answer.trim()}>
              Send answer
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => decide("approve")} disabled={pending}>
                Approve
              </Button>
              {item.preview && !compact ? (
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
