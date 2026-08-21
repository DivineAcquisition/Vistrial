"use client";

import { useActionState, useState, useTransition } from "react";

import { changeActivationTimestamp, rerunGoLiveCheck } from "@/app/app/setup/actions";
import { GoliveResults } from "@/app/app/setup/golive-results";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import type { GoliveRunResult } from "@/lib/onboarding/types";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function ActivationSettings({
  activatedAt,
  slug,
  lastGolive,
}: {
  activatedAt: string | null;
  slug: string;
  lastGolive: GoliveRunResult | null;
}) {
  const [changeState, changeAction, changing] = useActionState(changeActivationTimestamp, idle);
  const [pending, startTransition] = useTransition();
  const [golive, setGolive] = useState<GoliveRunResult | null>(lastGolive);
  const [goliveError, setGoliveError] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <Panel className="max-w-xl px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Activation</h2>
        <p className={helperClass}>
          The timestamp that divides baseline from measured. It is captured once. Every outcome
          number this client will ever be shown is measured from here.
        </p>
        <p className="mt-4 text-sm text-white">{activatedAt ?? "Not activated"}</p>
        {activatedAt ? (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-brand-300">
              Move the activation timestamp
            </summary>
            <form action={changeAction} className="mt-4 space-y-4">
              <p className="text-sm text-flag-warning">
                Every historical outcome figure will shift. This is recorded with who changed it and
                why. Type the organization slug ({slug}) to confirm.
              </p>
              <div>
                <label htmlFor="activation-slug" className={labelClass}>
                  Organization slug
                </label>
                <input id="activation-slug" name="slug" required className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="activation-next" className={labelClass}>
                  New timestamp
                </label>
                <input
                  id="activation-next"
                  name="next_at"
                  type="datetime-local"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="activation-reason" className={labelClass}>
                  Why
                </label>
                <textarea
                  id="activation-reason"
                  name="reason"
                  required
                  minLength={8}
                  className={`${inputClass} min-h-20`}
                />
              </div>
              <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={changing}>
                {changing ? "Recording…" : "Change activation timestamp"}
              </button>
              {changeState.status === "error" ? <p className={errorClass}>{changeState.error}</p> : null}
              {changeState.status === "saved" ? <p className={helperClass}>Timestamp moved. Historical figures will shift.</p> : null}
            </form>
          </details>
        ) : null}
      </Panel>

      <Panel className="px-6 py-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Go-live verification</h2>
        <p className={helperClass}>
          Re-run after any significant configuration change. Uses the real ingest, score, queue,
          alarm, brief, and draft paths. The test lead is removed afterward.
        </p>
        <button
          type="button"
          className={`${btnPrimary} ${btnSizeMd}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setGoliveError(null);
              const result = await rerunGoLiveCheck();
              if (result.status === "error") setGoliveError(result.error);
              else setGolive(result.golive ?? null);
            })
          }
        >
          {pending ? "Running…" : "Run go-live check"}
        </button>
        {goliveError ? <p className={errorClass}>{goliveError}</p> : null}
        {golive ? <GoliveResults result={golive} /> : null}
      </Panel>
    </div>
  );
}
