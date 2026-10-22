"use client";

import { useState, useTransition } from "react";

import { decideSuggestionAction, setPolicyAction, undoRunAction } from "@/app/(workspace)/app/actions/policy-actions";
import { Button } from "@/components/ui/button";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";

const POLICY_OPTIONS = [
  { value: "suggest", label: "Suggest" },
  { value: "do_and_log", label: "Do and log" },
] as const;

function Status({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="text-xs text-muted-foreground">
      {message}
    </p>
  ) : null;
}

export function PolicyToggle({ action, label, mode, disabled }: { action: string; label: string; mode: "suggest" | "do_and_log"; disabled: boolean }) {
  const [value, setValue] = useState<string>(mode);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (disabled) return <span className="text-sm text-muted-foreground">{mode === "suggest" ? "Suggest" : "Do and log"}</span>;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <SegmentedRadioGroup
        aria-label={`How ${label.toLowerCase()} runs`}
        size="sm"
        value={value}
        options={POLICY_OPTIONS}
        onValueChange={(next) => {
          if (pending || next === value) return;
          const previous = value;
          setValue(next);
          start(async () => {
            const result = await setPolicyAction(action, next as "suggest" | "do_and_log");
            if (!result.ok) setValue(previous);
            setMessage(result.message ?? null);
          });
        }}
      />
      <Status message={message} />
    </div>
  );
}

export function SuggestionButtons({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const decide = (decision: "confirm" | "dismiss") =>
    start(async () => {
      const result = await decideSuggestionAction(runId, decision);
      setMessage(result.message ?? null);
    });
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide("confirm")}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("dismiss")}>
          Dismiss
        </Button>
      </div>
      <Status message={message} />
    </div>
  );
}

export function UndoButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await undoRunAction(runId);
            setMessage(result.message ?? null);
          })
        }
      >
        Undo
      </Button>
      <Status message={message} />
    </div>
  );
}
