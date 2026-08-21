"use client";

import { useActionState, useState, useTransition } from "react";

import { acknowledgeEmptyVoice, previewVoiceDraft } from "@/app/app/setup/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { btnPrimary, btnSecondary, btnSizeMd, errorClass, helperClass } from "@/lib/ui";

type Preview = {
  body: string;
  usedExamples: number;
  quality: { ok: boolean; failures: Array<{ type: string }> };
};

const idle: SettingsSaveResult = { status: "idle" };

export function VoiceSamplePanel({ exampleCount }: { exampleCount: number }) {
  const [ackState, ackAction, acking] = useActionState(acknowledgeEmptyVoice, idle);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel className="px-6 py-6 space-y-4">
      <h2 className="text-sm font-semibold text-white">Sample draft from this profile</h2>
      <p className={helperClass}>
        Examples matter more than the sliders. A draft generated from a real ingested lead shows
        whether this profile sounds like the client before anyone goes live.
      </p>
      <button
        type="button"
        className={`${btnPrimary} ${btnSizeMd}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await previewVoiceDraft();
            if (result.status === "error") {
              setError(result.error);
              setPreview(null);
            } else {
              const next = result.preview;
              setPreview(
                next
                  ? {
                      body: next.body,
                      usedExamples: next.usedExamples,
                      quality: next.quality.ok
                        ? { ok: true, failures: [] }
                        : { ok: false, failures: next.quality.failures },
                    }
                  : null
              );
            }
          })
        }
      >
        {pending ? "Generating…" : "Generate a sample draft"}
      </button>
      {error ? <p className={errorClass}>{error}</p> : null}
      {preview ? (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm text-silver">{preview.body}</p>
          <p className={helperClass}>
            {preview.quality.ok
              ? `Passed the quality check. Used ${preview.usedExamples} example${preview.usedExamples === 1 ? "" : "s"}.`
              : `Failed quality: ${preview.quality.failures.map((item) => item.type).join(", ")}. Add real sent messages.`}
          </p>
        </div>
      ) : null}
      {exampleCount < 2 ? (
        <form action={ackAction} className="border-t border-white/10 pt-4">
          <p className={helperClass}>
            You can continue without examples, but drafts will read generic. That warning is recorded
            at activation.
          </p>
          <button type="submit" className={`${btnSecondary} ${btnSizeMd} mt-3`} disabled={acking}>
            {acking ? "Recording…" : "Continue without examples"}
          </button>
          {ackState.status === "error" ? <p className={errorClass}>{ackState.error}</p> : null}
          {ackState.status === "saved" ? <p className={helperClass}>Recorded. Review will warn before activation.</p> : null}
        </form>
      ) : null}
    </Panel>
  );
}
