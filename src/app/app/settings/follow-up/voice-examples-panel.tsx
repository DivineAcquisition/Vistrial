"use client";

import { useState, useTransition } from "react";

import { addVoiceExample, promoteSentDraft, removeVoiceExample } from "@/app/app/settings/follow-up/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MIN_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { FOLLOW_UP_CHANNEL_LABELS } from "@/lib/follow-up/labels";
import type { VoiceExample } from "@/lib/follow-up/types";
import { btnPrimary, btnSecondary, btnSizeSm, errorClass, helperClass, labelClass } from "@/lib/ui";

export function VoiceExamplesPanel({
  examples,
  sent,
}: {
  examples: VoiceExample[];
  sent: Array<{ id: string; body: string; channel: "sms" | "email"; leadName: string }>;
}) {
  const [exampleStatus, setExampleStatus] = useState<SettingsSaveResult>({ status: "idle" });
  const [exampleBody, setExampleBody] = useState("");
  const [exampleChannel, setExampleChannel] = useState<"sms" | "email">("sms");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <p className={helperClass}>
        These examples are the highest-value thing an owner can contribute. They shape every draft
        the system writes.
      </p>
      {examples.length < MIN_VOICE_EXAMPLES ? (
        <p className="text-sm text-flag-warning">
          Add at least two real messages so drafts sound like this client, not like a model.
        </p>
      ) : null}
      {examples.length === 0 ? (
        <p className="text-sm text-dim">No examples yet.</p>
      ) : (
        <ol className="space-y-3">
          {examples.map((item, index) => (
            <li key={`${item.addedAt}-${index}`} className="border-t border-white/[0.05] pt-3 first:border-t-0 first:pt-0">
              <p className="text-xs uppercase tracking-[0.14em] text-dim">
                {FOLLOW_UP_CHANNEL_LABELS[item.channel]}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-silver">{item.body}</p>
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm} mt-2`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setExampleStatus(await removeVoiceExample(index));
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <div>
        <label htmlFor="example-body" className={labelClass}>
          Paste a sent message
        </label>
        <Textarea
          id="example-body"
          className="min-h-24"
          value={exampleBody}
          onChange={(event) => setExampleBody(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="example-channel" className={labelClass}>
              Channel
            </label>
            <Select
              id="example-channel"
              value={exampleChannel}
              onChange={(event) => setExampleChannel(event.target.value as "sms" | "email")}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </Select>
          </div>
          <button
            type="button"
            className={`${btnPrimary} ${btnSizeSm}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setExampleStatus(await addVoiceExample({ body: exampleBody, channel: exampleChannel }));
                setExampleBody("");
              })
            }
          >
            Add example
          </button>
        </div>
      </div>
      {sent.length > 0 ? (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className={labelClass}>Promote a sent message</p>
          <p className={helperClass}>One action copies a message this workspace actually sent into the examples.</p>
          <ul className="space-y-3">
            {sent.map((row) => (
              <li key={row.id} className="space-y-2">
                <p className="text-xs text-dim">
                  {row.leadName} · {FOLLOW_UP_CHANNEL_LABELS[row.channel]}
                </p>
                <p className="whitespace-pre-wrap text-sm text-silver">{row.body}</p>
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setExampleStatus(await promoteSentDraft(row.id));
                    })
                  }
                >
                  Use as example
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {exampleStatus.status === "error" ? <p className={errorClass}>{exampleStatus.error}</p> : null}
    </div>
  );
}
