"use client";

import { useAuiState, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { loadExecutionPreviewAction, reviseExecutionAction } from "@/app/app/ask/actions";
import { ToolLine } from "@/components/sales-os/tool-line";
import { useWorkPane } from "@/components/sales-os/work-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
      <pre className="max-h-72 overflow-x-hidden overflow-y-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">{text}</pre>
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
  const conversationId = useAuiState((s) => s.threadListItem.remoteId);
  const { open } = useWorkPane();
  const opened = useRef(false);
  const [rejecting, setRejecting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sections, setSections] = useState<Array<{ heading: string; bullets: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [shownSummary, setShownSummary] = useState<string | null>(null);
  const [shownPreview, setShownPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview || opened.current) return;
    opened.current = true;
    open({ key: toolCallId, kind: "execution", toolCallId, summary: preview.plainSummary, preview: preview.preview });
  }, [preview, open, toolCallId]);

  return (
    <Card className="gap-3 border-brand-500/40 p-4" role="group" aria-label="Waiting for your approval">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={cardTitle}>Vistrial wants to do this</h3>
        <Badge variant="info">Waiting for your OK</Badge>
      </div>
      {preview ? (
        <>
          <p className="text-sm leading-relaxed text-card-foreground">{shownSummary ?? preview.plainSummary}</p>
          <p className={captionText}>
            {EXECUTION_TYPE_COPY[type].title}. {preview.gateReason} It goes to {preview.destinationLabel}.
          </p>
          <PreviewBox text={shownPreview ?? preview.preview} />
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
              disabled={decided || !reason.trim()}
              onClick={() => {
                const why = reason.trim();
                if (!why) return;
                setDecided(true);
                respond(false, why);
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
          <Button
            variant="outline"
            size="sm"
            disabled={decided || !preview}
            onClick={() => {
              setTitle(preview?.editable?.title ?? "");
              setSummary(preview?.editable?.summary ?? "");
              setSections((preview?.editable?.sections ?? []).map((section) => ({ heading: section.heading, bullets: section.bullets.join("\n") })));
              setFileName(preview?.fileName ?? "");
              setChanging(true);
            }}
          >
            Change it
          </Button>
          <Button variant="outline" size="sm" disabled={decided} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
      {changing && preview ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!conversationId) return;
            void reviseExecutionAction({
              conversationId,
              toolCallId,
              title,
              summary,
              sections: sections.map((section) => ({
                heading: section.heading,
                bullets: section.bullets.split("\n").map((line) => line.trim()).filter(Boolean),
              })),
              fileName: type === "save_asset_to_drive" || type === "deliver_asset" ? fileName.trim() || null : null,
            }).then((result) => {
              if (!result.ok) {
                setChangeError(result.error);
                return;
              }
              setShownSummary(result.plainSummary);
              setShownPreview(result.preview);
              setChanging(false);
              setChangeError(null);
              open({ key: toolCallId, kind: "execution", toolCallId, summary: result.plainSummary, preview: result.preview });
            });
          }}
        >
          {preview.editable ? (
            <>
              <Input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <Textarea aria-label="What it says" rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} />
              {sections.map((section, index) => (
                <div key={index} className="space-y-1">
                  <Input
                    aria-label={`Section ${index + 1} heading`}
                    value={section.heading}
                    onChange={(event) =>
                      setSections((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, heading: event.target.value } : item)))
                    }
                  />
                  <Textarea
                    aria-label={`Section ${index + 1}, one line each`}
                    rows={3}
                    value={section.bullets}
                    onChange={(event) =>
                      setSections((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, bullets: event.target.value } : item)))
                    }
                  />
                </div>
              ))}
            </>
          ) : null}
          {type === "save_asset_to_drive" || type === "deliver_asset" ? (
            <Input aria-label="File name" placeholder="File name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">
              Save this version
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
              Back
            </Button>
          </div>
          {changeError ? <p className="text-sm text-destructive">{changeError}</p> : null}
        </form>
      ) : null}
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
