"use client";

import { useState } from "react";

import { ToolGroupCard, type ToolGroupStep } from "@/components/agent-elements/cards";
import { AgentComposer } from "@/components/agent-elements/composer";
import { StreamingText } from "@/components/operator/streaming-text";
import { ChangePreview } from "@/components/operator/change-preview";
import type { OperatorConfirmationView, OperatorRunView, OperatorStepView } from "@/lib/operator/types";
import { helperClass } from "@/lib/ui";

export function RunContainer({
  requestText,
  steps,
  confirmations,
  streamedText,
  finalResponse,
  streaming,
  statusLabel,
  busy = false,
  followUp,
  onConfirm,
  onCancel,
  onUndo,
  onFollowUp,
}: {
  requestText: string;
  steps: Array<Pick<OperatorStepView, "id" | "toolName" | "label" | "state" | "resultSummary" | "errorText" | "ui" | "arguments">>;
  confirmations: OperatorConfirmationView[];
  streamedText: string;
  finalResponse: string | null;
  streaming: boolean;
  statusLabel?: string | null;
  busy?: boolean;
  followUp?: { used: boolean; enabled: boolean };
  onConfirm?: (confirmationId: string, selectedIds: string[]) => void;
  onCancel?: (confirmationId: string) => void;
  onUndo?: (confirmationId: string) => void;
  onFollowUp?: (text: string) => void;
}) {
  const answer = finalResponse ?? streamedText;
  const groupSteps: ToolGroupStep[] = steps.map((step) => ({
    id: step.id,
    title: step.label || "Working",
    detail: step.errorText || step.resultSummary,
    state: step.state === "running" || step.state === "done" || step.state === "permission" ? step.state : "failed",
    links: step.ui?.links.map((link) => ({
      id: link.id,
      href: link.href,
      name: link.name,
      meta: [link.status, link.score != null ? String(link.score) : null].filter(Boolean).join(" · ") || null,
    })),
  }));
  const groupLabel = streaming
    ? steps.length
      ? steps[steps.length - 1]?.label || "Working on it"
      : "Working on it"
    : steps.length
      ? `Checked ${steps.length} ${steps.length === 1 ? "thing" : "things"}`
      : "Nothing to check";

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-4">
      <header>
        <p className={helperClass}>Request</p>
        <p className="mt-1 text-sm text-strong">{requestText}</p>
        {statusLabel ? <p className={`mt-1 ${helperClass}`}>{statusLabel}</p> : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {groupSteps.length || streaming ? <ToolGroupCard label={groupLabel} pending={streaming} steps={groupSteps} /> : null}
        {confirmations.map((confirmation) => (
          <ChangePreview
            key={confirmation.id}
            confirmation={confirmation}
            busy={busy}
            onConfirm={onConfirm ? (ids) => onConfirm(confirmation.id, ids) : undefined}
            onCancel={onCancel ? () => onCancel(confirmation.id) : undefined}
            onUndo={onUndo ? () => onUndo(confirmation.id) : undefined}
          />
        ))}
        {answer || streaming ? (
          <StreamingText text={answer} done={!streaming} />
        ) : null}
      </div>

      {followUp?.enabled && !followUp.used && onFollowUp && !streaming ? (
        <FollowUpComposer onFollowUp={onFollowUp} />
      ) : null}
    </article>
  );
}

function FollowUpComposer({ onFollowUp }: { onFollowUp: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <AgentComposer
      value={value}
      onChange={setValue}
      intent="lookup"
      showIntent={false}
      placeholder="Narrow or correct this result"
      onSend={(text) => {
        onFollowUp(text);
        setValue("");
      }}
    />
  );
}

export function runStatusLabel(run: Pick<OperatorRunView, "status" | "stopReason">): string | null {
  if (run.status === "awaiting_confirmation") return "Waiting for you to confirm or cancel.";
  if (run.status === "rate_limited") return "Try again in a moment.";
  if (run.status === "stopped_step_limit") return "Stopped so this does not run on forever.";
  if (run.status === "stopped_time_limit") return "Stopped so this does not run on forever.";
  if (run.status === "failed") return "Could not finish that.";
  if (run.status === "cancelled") return "Stopped.";
  return null;
}
