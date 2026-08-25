"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import {
  previewScoringChange,
  updateWorkspaceSensitivity,
} from "@/app/app/settings/scoring/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { ScoringImpactPreview } from "@/app/app/settings/scoring/scoring-impact-preview";
import { SubmitButton } from "@/components/ui/button";
import { SENSITIVITY_EFFECT } from "@/lib/settings/constants";
import { scoringPreviewFingerprint, type ScoringPreviewConfig, type ScoringPreviewResult } from "@/lib/settings/preview";
import { btnSecondary, btnSizeSm, errorClass, helperClass, labelClass, successClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function SensitivityForm({
  config,
  writable,
  managed,
}: {
  config: ScoringPreviewConfig;
  writable: boolean;
  managed: boolean;
}) {
  const [threshold, setThreshold] = useState(config.readyThreshold);
  const [preview, setPreview] = useState<ScoringPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saveState, saveAction, saving] = useActionState(updateWorkspaceSensitivity, idle);

  const proposed: ScoringPreviewConfig = useMemo(
    () => ({ ...config, readyThreshold: threshold }),
    [config, threshold]
  );
  const fingerprint = scoringPreviewFingerprint(proposed);
  const previewMatches = preview?.fingerprint === fingerprint;

  return (
    <div className="space-y-4">
      <p className={helperClass}>{SENSITIVITY_EFFECT}</p>
      {managed && !writable ? (
        <p className={helperClass}>Scoring is managed by your install team. The control stays as they set it.</p>
      ) : null}
      <div>
        <label className={labelClass} htmlFor="sensitivity">
          Ready bar
        </label>
        <input
          id="sensitivity"
          type="range"
          min={40}
          max={90}
          step={1}
          value={threshold}
          disabled={!writable}
          onChange={(event) => {
            setThreshold(Number(event.target.value));
            setPreview(null);
          }}
          className="mt-2 w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-dim">
          <span>More leads flagged ready</span>
          <span>Fewer, higher-confidence</span>
        </div>
        <p className={`mt-2 ${helperClass}`}>Ready at {threshold} or above. Current setting is {config.readyThreshold}.</p>
      </div>
      <button
        type="button"
        className={`${btnSecondary} ${btnSizeSm}`}
        disabled={!writable || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await previewScoringChange(proposed);
            if ("error" in result) {
              setPreviewError(result.error);
              setPreview(null);
            } else {
              setPreviewError(null);
              setPreview(result);
            }
          })
        }
      >
        Preview against current leads
      </button>
      {previewError ? <p className={errorClass}>{previewError}</p> : null}
      <ScoringImpactPreview preview={preview} />
      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="ready_threshold" value={String(threshold)} />
        <input type="hidden" name="preview_fingerprint" value={previewMatches ? fingerprint : ""} />
        {saveState.status === "error" ? <p className={errorClass}>{saveState.error}</p> : null}
        {saveState.status === "saved" ? (
          <p className={successClass}>Saved. Existing score rows were not rewritten.</p>
        ) : null}
        <SubmitButton pending={saving} disabled={!writable || !previewMatches || saving}>
          Save sensitivity
        </SubmitButton>
        {!previewMatches ? (
          <p className={helperClass}>Preview the impact on current leads before saving.</p>
        ) : null}
      </form>
    </div>
  );
}
