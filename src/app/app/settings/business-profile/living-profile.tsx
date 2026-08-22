"use client";

import { useActionState } from "react";

import {
  dismissContradiction,
  resolveReviewPrompt,
} from "@/app/app/settings/business-profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Contradiction, ReviewPrompt } from "@/lib/profile/types";
import { CONTRADICTION_LABELS, REVIEW_REASON_LABELS } from "@/lib/profile/vocabulary";
import { btnSecondary, btnSizeSm, errorClass, helperClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function ReviewPrompts({ prompts }: { prompts: ReviewPrompt[] }) {
  const [state, action] = useActionState(resolveReviewPrompt, idle);
  if (prompts.length === 0) return null;

  return (
    <Panel className="px-6 py-6">
      <h2 className="text-sm font-semibold text-white">Worth a look</h2>
      <p className={helperClass}>
        Everything downstream reads this profile, so an answer that has gone stale becomes a wrong
        one. Nothing here is urgent and nothing chases you.
      </p>
      <ul className="mt-4 space-y-4">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{REVIEW_REASON_LABELS[prompt.reason]}</p>
              <p className={helperClass}>{prompt.detail}</p>
            </div>
            <form action={action}>
              <input type="hidden" name="id" value={prompt.id} />
              <button type="submit" className={`${btnSecondary} ${btnSizeSm}`}>
                Looked at it
              </button>
            </form>
          </li>
        ))}
      </ul>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </Panel>
  );
}

export function Contradictions({ contradictions }: { contradictions: Contradiction[] }) {
  const [state, action] = useActionState(dismissContradiction, idle);
  if (contradictions.length === 0) return null;

  return (
    <Panel className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">What you said, and what the data says</h2>
          <p className={helperClass}>
            Only visible because both versions live in one place. Neither one is automatically right.
          </p>
        </div>
        <StatusBadge label={`${contradictions.length} open`} tone="warning" />
      </div>
      <ul className="mt-4 space-y-4">
        {contradictions.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{CONTRADICTION_LABELS[item.kind]}</p>
              <p className={helperClass}>
                You said {item.stated}. Across {item.sampleN} of your own records, {item.observed}.
              </p>
            </div>
            <form action={action}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className={`${btnSecondary} ${btnSizeSm}`}>
                Dismiss
              </button>
            </form>
          </li>
        ))}
      </ul>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </Panel>
  );
}
