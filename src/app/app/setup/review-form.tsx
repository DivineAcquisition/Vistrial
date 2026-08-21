"use client";

import { useActionState, useState } from "react";

import { activateWorkspace, type ActivateResult } from "@/app/app/setup/actions";
import { GoliveResults } from "@/app/app/setup/golive-results";
import { Panel } from "@/components/ui/panel";
import { ACTIVATION_OVERRIDE_PHRASE } from "@/lib/onboarding/constants";
import { applicableWarnings, unmetHard } from "@/lib/onboarding/gate";
import type { ActivationGate } from "@/lib/onboarding/types";
import {
  btnPrimary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const idle: ActivateResult = { status: "idle" };

export function ReviewActivateForm({ gate }: { gate: ActivationGate }) {
  const [state, action, pending] = useActionState(activateWorkspace, idle);
  const [override, setOverride] = useState(false);
  const hard = unmetHard(gate);
  const warnings = applicableWarnings(gate);
  const already = Boolean(gate.activatedAt);

  if (already) {
    return (
      <Panel className="px-6 py-6 space-y-4">
        <p className="text-sm text-white">
          This workspace went live at {gate.activatedAt}. That timestamp is the start of every
          outcome number shown to this client.
        </p>
        {state.status === "saved" ? <GoliveResults result={state.golive} /> : null}
      </Panel>
    );
  }

  return (
    <Panel className="px-6 py-6">
      <form action={action} className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white">Hard requirements</h2>
          <p className={helperClass}>Activation is impossible until each of these is true.</p>
          <ul className="mt-3 space-y-3">
            {gate.hard.map((item) => (
              <li key={item.id}>
                <p className={item.ok ? "text-sm text-flag-good" : "text-sm text-flag-critical"}>
                  {item.ok ? "Met" : "Blocked"} — {item.label}
                </p>
                {!item.ok && item.detail ? <p className={helperClass}>{item.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>

        {warnings.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-white">Warnings that must be acknowledged</h2>
            <p className={helperClass}>
              Activation is possible, but each consequence is named and recorded with who activated.
            </p>
            <ul className="mt-3 space-y-3">
              {warnings.map((warning) => (
                <li key={warning.id}>
                  <label className="flex items-start gap-3 text-sm text-silver">
                    <input type="checkbox" name="ack" value={warning.id} required className="mt-1" />
                    <span>
                      <span className="block text-white">{warning.label}</span>
                      {warning.consequence}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hard.length > 0 ? (
          <div className="border-t border-white/10 pt-4">
            <label className="flex items-start gap-3 text-sm text-silver">
              <input
                type="checkbox"
                name="override"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
                className="mt-1"
              />
              <span>
                Override unmet requirements. This is deliberate. It is recorded. It is never silent.
              </span>
            </label>
            {override ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-flag-warning">
                  Going live now means the product cannot do what it promises for this workspace.
                  {hard.map((item) => ` ${item.label}.`)} There will be no recoverable baseline if
                  backfill has not resolved. Unscored leads will sort to the bottom of a queue nobody
                  trusts if mapping is missing.
                </p>
                <div>
                  <label htmlFor="override_phrase" className={labelClass}>
                    Type {ACTIVATION_OVERRIDE_PHRASE} to confirm
                  </label>
                  <input id="override_phrase" name="override_phrase" className={inputClass} required={override} />
                </div>
                <div>
                  <label htmlFor="override_reason" className={labelClass}>
                    Why
                  </label>
                  <textarea
                    id="override_reason"
                    name="override_reason"
                    required={override}
                    minLength={8}
                    className={`${inputClass} min-h-20`}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={pending || (hard.length > 0 && !override)}>
          {pending ? "Activating…" : "Activate"}
        </button>
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      </form>
      {state.status === "saved" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-flag-good">Activated at {state.activatedAt}.</p>
          <GoliveResults result={state.golive} />
        </div>
      ) : null}
    </Panel>
  );
}
