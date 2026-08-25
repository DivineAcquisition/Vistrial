"use client";

import { useState, useTransition } from "react";

import {
  applyCalibrationSuggestion,
  dismissCalibrationSuggestion,
} from "@/app/app/reporting/calibration/actions";
import { resolveVoiceSuggestion } from "@/app/app/settings/follow-up/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { helperClass, successClass, errorClass } from "@/lib/ui";

export function SuggestionActions({
  suggestionId,
  evidence,
  previewPlain,
}: {
  suggestionId: string;
  evidence: string;
  previewPlain: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ConfirmDialog
        trigger={
          <Button type="button" size="sm" disabled={pending}>
            Apply this change
          </Button>
        }
        title="Apply the suggested weights?"
        description="This updates live scoring for new reads. Existing score history is not rewritten. Queue rank for a lead stays until that lead is scored again."
        confirmLabel="Apply weights"
        confirmVariant="primary"
        onConfirm={() =>
          startTransition(async () => {
            const result = await applyCalibrationSuggestion(suggestionId);
            if (result.status === "error") setError(result.error);
            else {
              setError(null);
              setMessage("Applied. Existing score rows were left untouched.");
            }
          })
        }
      >
        <p className={helperClass}>{evidence}</p>
        {previewPlain ? <p className={`mt-2 ${helperClass}`}>{previewPlain}</p> : null}
      </ConfirmDialog>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await dismissCalibrationSuggestion(suggestionId);
            if (result.status === "error") setError(result.error);
            else {
              setError(null);
              setMessage("Dismissed.");
            }
          })
        }
      >
        Dismiss
      </Button>
      {message ? <p className={successClass}>{message}</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

export function VoiceConfirmActions({ id }: { id: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resolveVoiceSuggestion({ id, accept: true });
            setMessage(result.status === "error" ? result.error : "Voice profile updated.");
          })
        }
      >
        Confirm profile update
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resolveVoiceSuggestion({ id, accept: false });
            setMessage(result.status === "error" ? result.error : "Dismissed.");
          })
        }
      >
        Keep the current profile
      </Button>
      {message ? <p className={helperClass}>{message}</p> : null}
    </div>
  );
}
