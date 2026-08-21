"use client";

import { useActionState } from "react";

import { chooseManualTranscripts } from "@/app/app/setup/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { btnSecondary, btnSizeMd, errorClass, helperClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function UnsupportedRecorderNote({ choice }: { choice: "connected" | "manual" | null }) {
  const [state, action, pending] = useActionState(chooseManualTranscripts, idle);

  return (
    <Panel className="px-6 py-6">
      <h2 className="text-sm font-semibold text-white">Unsupported recorder</h2>
      <p className={helperClass}>
        If the team records on something other than Fathom, Fireflies, Zoom, or GoHighLevel, that is
        not a blocker. Manual paste still works. Extraction, briefs, and grounded follow-up wait
        until a transcript arrives, but the rest of the product runs.
      </p>
      {choice === "manual" ? (
        <p className="mt-3 text-sm text-flag-good">Manual paste is the chosen source.</p>
      ) : choice === "connected" ? (
        <p className="mt-3 text-sm text-flag-good">A supported recorder is connected.</p>
      ) : (
        <form action={action} className="mt-4">
          <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={pending}>
            {pending ? "Saving…" : "We will paste transcripts by hand"}
          </button>
        </form>
      )}
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </Panel>
  );
}
