"use client";

import { StreamingText } from "@/components/operator/streaming-text";
import { ToolCallRow } from "@/components/operator/tool-call-row";
import { ChangePreview } from "@/components/operator/change-preview";
import { Input } from "@/components/ui/input";
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

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-4">
      <header>
        <p className={helperClass}>Request</p>
        <p className="mt-1 text-sm text-white">{requestText}</p>
        {statusLabel ? <p className={`mt-1 ${helperClass}`}>{statusLabel}</p> : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {steps.map((step) => (
          <ToolCallRow key={step.id} step={step} />
        ))}
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
        <form
          className="shrink-0"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const text = String(data.get("followUp") ?? "").trim();
            if (text) {
              onFollowUp(text);
              form.reset();
            }
          }}
        >
          <label className="block">
            <span className={helperClass}>One follow-up on this run</span>
            <Input
              name="followUp"
              type="text"
              className="mt-1"
              placeholder="Narrow or correct this result"
            />
          </label>
        </form>
      ) : null}
    </article>
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
