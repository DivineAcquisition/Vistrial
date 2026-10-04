"use client";

import { useAuiState, useThreadRuntime, type AssistantState, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

import { ToolLine } from "@/components/sales-os/tool-line";
import { useWorkPane, type WorkArtifact } from "@/components/sales-os/work-pane";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Finding } from "@/lib/sales-os/analysis";
import type { AssetToolResult, AssetView } from "@/lib/sales-os/asset-types";
import { EXECUTION_TOOLS, TOOL_LABELS, isSalesOsTool, type SalesOsToolName } from "@/lib/sales-os/catalog";
import type { ExecutionToolResult } from "@/lib/sales-os/executions/types";
import { captionText } from "@/lib/ui";

type AssetList = { kind: "asset_list"; assets: AssetView[]; message: string };

function artifactFor(toolCallId: string, result: unknown): WorkArtifact | null {
  if (!result || typeof result !== "object") return null;
  const record = result as { kind?: string };
  if (record.kind === "finding") return { key: toolCallId, kind: "finding", finding: result as Finding };
  if (record.kind === "asset_list") {
    const list = result as AssetList;
    return { key: toolCallId, kind: "assets", assets: list.assets, message: list.message };
  }
  if (record.kind === "asset" && (result as AssetToolResult).status === "created") {
    return { key: toolCallId, kind: "asset", asset: (result as AssetToolResult & { status: "created" }).asset };
  }
  if (record.kind === "execution") {
    const execution = result as ExecutionToolResult;
    return { key: toolCallId, kind: "execution", toolCallId, summary: execution.summary, preview: execution.preview };
  }
  return null;
}

function detailFor(result: unknown, failed: string | null): string {
  if (failed) return failed;
  if (!result || typeof result !== "object") return "Nothing came back.";
  const record = result as { kind?: string; message?: string; summary?: string };
  if (record.kind === "finding") {
    const finding = result as Finding;
    const labels = (finding.records ?? []).slice(0, 3).map((item) => item.label);
    const extra = (finding.records?.length ?? 0) - labels.length;
    const looked = labels.length ? ` Looked at ${labels.join(", ")}${extra > 0 ? `, and ${extra} more` : ""}.` : "";
    return `${finding.headline} Sample: ${finding.sample}.${looked}`;
  }
  if (record.message) return record.message;
  if (record.summary) return record.summary;
  return "Done.";
}

function canRetry(toolName: string, failed: boolean): boolean {
  return failed && isSalesOsTool(toolName) && !(EXECUTION_TOOLS as readonly string[]).includes(toolName);
}

/** One tool call: a plain-language line, a state, and what it found. The artifact itself opens beside the conversation. */
export function ToolCallRow(props: ToolCallMessagePartProps) {
  const labels = isSalesOsTool(props.toolName) ? TOOL_LABELS[props.toolName as SalesOsToolName] : null;
  const running = props.result === undefined && !props.isError;
  const failed = Boolean(props.isError) || (props.result as { status?: string } | undefined)?.status === "failed";
  const state = running ? "running" : failed ? "failed" : "done";
  const line = running ? labels?.running ?? "Working on it" : failed ? labels?.failed ?? "That step didn't work" : labels?.done ?? "Done";
  const errorText = typeof (props.result as { error?: unknown } | undefined)?.error === "string" ? (props.result as { error: string }).error : null;
  const artifact = artifactFor(props.toolCallId, props.result);
  const { open } = useWorkPane();
  const thread = useThreadRuntime();
  const [expanded, setExpanded] = useState(failed);
  const sawRunning = useRef(false);

  useEffect(() => {
    if (running) sawRunning.current = true;
    if (!sawRunning.current || running) return;
    sawRunning.current = false;
    const next = artifactFor(props.toolCallId, props.result);
    if (next) open(next);
  }, [running, open, props.toolCallId, props.result]);

  return (
    <div className="rounded-lg border border-border/80 bg-card">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <ToolLine state={state} className="min-w-0 flex-1">
          {line}
        </ToolLine>
        <ChevronDownIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <p className="text-sm leading-relaxed text-card-foreground">{detailFor(props.result, failed ? errorText ?? "It stopped, and nothing was changed." : null)}</p>
          <div className="flex flex-wrap gap-2">
            {artifact ? (
              <Button variant="outline" size="xs" onClick={() => open(artifact)}>
                Open it
              </Button>
            ) : null}
            {canRetry(props.toolName, failed) ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => thread.append(`Try that again: ${labels?.running ?? "the last step"}.`)}
              >
                Try again
              </Button>
            ) : null}
          </div>
          {failed && (EXECUTION_TOOLS as readonly string[]).includes(props.toolName) ? (
            <p className={captionText}>This was not retried. Ask again if you want a new one.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function callsInRange(state: AssistantState, startIndex: number, endIndex: number) {
  const content = state.message.content;
  const calls = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const part = content[index];
    if (part?.type === "tool-call") calls.push(part);
  }
  return calls;
}

function sentence(label: string, first: boolean) {
  if (first) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Consecutive tool calls, one summary line, expanded together. */
export function ToolCallGroup({
  startIndex,
  endIndex,
  children,
}: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const count = endIndex - startIndex + 1;
  const summary = useAuiState((state) => {
    const calls = callsInRange(state, startIndex, endIndex);
    const waiting = calls.some((call) => call.approval && call.approval.approved === undefined);
    const failed = calls.some((call) => call.isError || (call.result as { status?: string } | undefined)?.status === "failed");
    const labels = calls.map((call) => {
      const known = isSalesOsTool(call.toolName) ? TOOL_LABELS[call.toolName] : null;
      const running = call.result === undefined && !call.isError;
      const broke = Boolean(call.isError) || (call.result as { status?: string } | undefined)?.status === "failed";
      return running ? known?.running ?? "Working on it" : broke ? known?.failed ?? "That step didn't work" : known?.done ?? "Done";
    });
    const line = waiting
      ? "Waiting for your OK"
      : labels.length <= 1
        ? labels[0] ?? `${count} steps`
        : labels.length === 2
          ? `${sentence(labels[0], true)}, then ${sentence(labels[1], false)}`
          : `${sentence(labels[0], true)}, then ${labels.length - 1} more`;
    return `${waiting ? "1" : "0"}${failed ? "1" : "0"}:${line}`;
  });
  const waiting = summary.startsWith("1");
  const failed = summary[1] === "1";
  const line = summary.slice(3);
  const attention = waiting || failed;
  const [open, setOpen] = useState(attention);
  const [seenAttention, setSeenAttention] = useState(attention);
  if (attention !== seenAttention) {
    setSeenAttention(attention);
    if (attention) setOpen(true);
  }
  if (count < 2) return <>{children}</>;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border/80">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-muted-foreground">
        <span className={waiting ? "text-card-foreground" : failed ? "text-destructive" : undefined}>{line}</span>
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-2 border-t border-border px-2 py-2">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
