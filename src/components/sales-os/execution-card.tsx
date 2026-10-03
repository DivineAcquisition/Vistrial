"use client";

import { useAuiState, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { loadExecutionPreviewAction } from "@/app/app/ask/actions";
import { ToolLine } from "@/components/sales-os/tool-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EXECUTION_TYPE_COPY, TOOL_LABELS, type ExecutionType } from "@/lib/sales-os/catalog";
import type { ExecutionPreview, ExecutionToolResult } from "@/lib/sales-os/executions/types";
import { captionText, cardTitle } from "@/lib/ui";

function usePreview(toolCallId: string, enabled: boolean) {
  const conversationId = useAuiState((s) => s.threadListItem.remoteId);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!enabled || !conversationId) return;
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      const next = await loadExecutionPreviewAction(conversationId, toolCallId);
      if (cancelled) return;
      if (next) setPreview(next);
      else if (tries++ < 8) setTimeout(load, 750);
      else setMissing(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, toolCallId, enabled]);
  return { preview, missing };
}

function PreviewBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
      <p className={`${captionText} mb-1.5`}>Exactly what will be sent</p>
      <pre className="max-h-72 overflow-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">{text}</pre>
    </div>
  );
}

function ApprovalCard({
  type,
  toolCallId,
  respond,
}: {
  type: ExecutionType;
  toolCallId: string;
  respond: (approved: boolean, reason?: string) => void;
}) {
  const { preview, missing } = usePreview(toolCallId, true);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState(false);

  return (
    <Card className="gap-3 border-brand-500/40 p-4" role="group" aria-label="Waiting for your approval">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={cardTitle}>Vistrial wants to do this</h3>
        <Badge variant="info">Waiting for your OK</Badge>
      </div>
      {preview ? (
        <>
          <p className="text-sm leading-relaxed text-card-foreground">{preview.plainSummary}</p>
          <p className={captionText}>
            {EXECUTION_TYPE_COPY[type].title}. {preview.gateReason}
          </p>
          <PreviewBox text={preview.preview} />
        </>
      ) : missing ? (
        <p className="text-sm text-destructive">The request couldn&apos;t be loaded, so it can&apos;t be approved from here. Nothing will be sent.</p>
      ) : (
        <ToolLine state="running">Getting the details</ToolLine>
      )}
      {rejecting ? (
        <div className="space-y-2">
          <label className="block text-sm text-card-foreground" htmlFor={`reject-${toolCallId}`}>
            Why not? This is kept with the record.
          </label>
          <Textarea id={`reject-${toolCallId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button
              variant="destructive-outline"
              size="sm"
              disabled={decided}
              onClick={() => {
                setDecided(true);
                respond(false, reason.trim() || undefined);
              }}
            >
              Don&apos;t do it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!preview || decided}
            onClick={() => {
              setDecided(true);
              respond(true);
            }}
          >
            Approve and run it
          </Button>
          <Button variant="outline" size="sm" disabled={decided} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
    </Card>
  );
}

function ResultCard({ result }: { result: ExecutionToolResult }) {
  const ok = result.status === "succeeded";
  const who =
    result.gateSatisfiedBy === "in_conversation_approval"
      ? `Approved by ${result.approvedByName ?? "an owner or admin"}.`
      : result.gateSatisfiedBy === "prior_configuration"
        ? "Ran without asking, as this workspace's settings allow."
        : null;
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={cardTitle}>{ok ? "Done" : result.status === "rejected" ? "Not sent" : "This didn't happen"}</h3>
        <Badge variant={ok ? "success" : result.status === "failed" ? "error" : "warning"}>
          {ok ? "Sent" : result.status === "failed" ? "Failed, not retried" : "Nothing was sent"}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed text-card-foreground">{result.summary}</p>
      {result.link ? (
        <a href={result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 underline-offset-4 hover:underline">
          Open it <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      ) : null}
      {who ? <p className={captionText}>{who}</p> : null}
    </Card>
  );
}

export function ExecutionToolCard(props: ToolCallMessagePartProps) {
  const type = props.toolName as ExecutionType;
  const labels = TOOL_LABELS[type];
  const { approval } = props;

  if (props.result && !props.isError && (props.result as ExecutionToolResult).kind === "execution") {
    return <ResultCard result={props.result as ExecutionToolResult} />;
  }
  if (props.isError) {
    const message = (props.result as { error?: string } | undefined)?.error ?? "";
    const rejected = approval?.approved === false;
    return (
      <Card className="gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cardTitle}>{rejected ? "Not sent" : labels.failed}</h3>
          <Badge variant="warning">Nothing was sent</Badge>
        </div>
        <p className="text-sm text-card-foreground">
          {rejected ? (approval?.reason ? `Rejected: ${approval.reason}` : "You rejected it.") : message || "It stopped before anything was sent."}
        </p>
      </Card>
    );
  }
  if (approval && approval.approved === undefined) {
    return (
      <ApprovalCard
        type={type}
        toolCallId={props.toolCallId}
        respond={(approved, reason) => props.respondToApproval({ approved, ...(reason ? { reason } : {}) })}
      />
    );
  }
  if (approval?.approved === true) return <ToolLine state="running">Approved. Running it now</ToolLine>;
  return <ToolLine state="running">{labels.running}</ToolLine>;
}
