"use client";

import { useActionState } from "react";

import {
  addOnboardingVoiceExample,
  removeOnboardingVoiceExample,
} from "@/app/app/onboarding/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function VoiceExamples({
  examples,
  minimum,
  maximum,
}: {
  examples: Array<{ body: string; channel: string; addedAt: string }>;
  minimum: number;
  maximum: number;
}) {
  const [addState, addAction, adding] = useActionState(addOnboardingVoiceExample, idle);
  const [removeState, removeAction] = useActionState(removeOnboardingVoiceExample, idle);
  const short = examples.length < minimum;

  return (
    <Panel className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Real messages you have sent</h2>
          <p className={helperClass}>
            Two to five messages you have actually sent a prospect. This is the single highest-value
            thing in the whole of onboarding: two real messages beat any description of your tone.
          </p>
        </div>
        <StatusBadge
          label={`${examples.length} of ${maximum}`}
          tone={short ? "warning" : "good"}
        />
      </div>

      {examples.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {examples.map((example, index) => (
            <li key={`${example.addedAt}-${index}`} className="rounded-xl border border-white/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="whitespace-pre-wrap text-sm text-silver">{example.body}</p>
                <form action={removeAction}>
                  <input type="hidden" name="index" value={index} />
                  <button type="submit" className={`${btnSecondary} ${btnSizeSm}`}>
                    Remove
                  </button>
                </form>
              </div>
              <p className={helperClass}>{example.channel === "email" ? "Email" : "Text message"}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {removeState.status === "error" ? <p className={errorClass}>{removeState.error}</p> : null}

      {examples.length < maximum ? (
        <form action={addAction} className="mt-6 space-y-4 border-t border-white/10 pt-6">
          <div>
            <label className={labelClass} htmlFor="voice_example_body">
              Paste one message
            </label>
            <textarea
              id="voice_example_body"
              name="body"
              rows={5}
              required
              className={inputClass}
              placeholder="Paste it exactly as it went out."
            />
            <p className={helperClass}>
              Paste it however it comes to hand. A forwarded email with headers still counts, and a
              screenshot you type back out counts too. Nothing is reformatted.
            </p>
          </div>
          <div className="sm:w-56">
            <label className={labelClass} htmlFor="voice_example_channel">
              Sent as
            </label>
            <select id="voice_example_channel" name="channel" className={selectClass} defaultValue="sms">
              <option value="sms">Text message</option>
              <option value="email">Email</option>
            </select>
          </div>
          <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={adding}>
            {adding ? "Adding…" : "Add this message"}
          </button>
          {addState.status === "error" ? <p className={errorClass}>{addState.error}</p> : null}
        </form>
      ) : (
        <p className={helperClass}>Five is the cap. Remove one to add another.</p>
      )}

      {short ? (
        <p className="mt-4 text-sm text-flag-warning">
          With fewer than {minimum}, drafts fall back to a generic voice and every one of them will
          read like it.
        </p>
      ) : null}
    </Panel>
  );
}
