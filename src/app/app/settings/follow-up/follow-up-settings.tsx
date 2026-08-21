"use client";

import { useActionState, useState, useTransition } from "react";

import {
  addVoiceExample,
  refreshVoiceSuggestions,
  removeVoiceExample,
  resolveVoiceSuggestion,
  saveRoutingRules,
  setOrgSequenceHalt,
  updateFollowUpPolicy,
  updateVoiceProfile,
} from "@/app/app/settings/follow-up/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { MIN_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { FOLLOW_UP_BRANCH_LABELS, FOLLOW_UP_CHANNEL_LABELS } from "@/lib/follow-up/labels";
import type { FollowUpSettings, RoutingRule, VoiceExample, VoiceProfile } from "@/lib/follow-up/types";
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

export type VoiceSuggestionRow = {
  id: string;
  kind: "shorter" | "less_formal" | "drop_phrase";
  phrase: string | null;
  evidence: string;
  status: "pending" | "accepted" | "dismissed";
};

export function FollowUpSettingsScreen({
  settings,
  voice,
  rules: initialRules,
  suggestions,
  show: showProp,
}: {
  settings: FollowUpSettings;
  voice: VoiceProfile;
  rules: RoutingRule[];
  suggestions: VoiceSuggestionRow[];
  show?: {
    halt?: boolean;
    examples?: boolean;
    profile?: boolean;
    policy?: boolean;
  };
}) {
  const show = {
    halt: true,
    examples: true,
    profile: true,
    policy: true,
    ...showProp,
  };
  const [policyState, savePolicy, policyPending] = useActionState(updateFollowUpPolicy, idle);
  const [voiceState, saveVoice, voicePending] = useActionState(updateVoiceProfile, idle);
  const [haltStatus, setHaltStatus] = useState<SettingsSaveResult>(idle);
  const [exampleStatus, setExampleStatus] = useState<SettingsSaveResult>(idle);
  const [exampleBody, setExampleBody] = useState("");
  const [exampleChannel, setExampleChannel] = useState<"sms" | "email">("sms");
  const [rules, setRules] = useState(initialRules);
  const [ruleStatus, setRuleStatus] = useState<SettingsSaveResult>(idle);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-10">
      {show.halt ? (
      <section>
        <SectionHeader
          title="Sequence stop"
          hint="This switch exists before any sequence can run. It stops later drafts from being scheduled. It does not send anything."
        />
        <Panel className="px-6 py-5">
          <p className="text-sm text-silver">
            Sequences are {settings.sequencesHalted ? "stopped for the whole workspace." : "allowed."}
          </p>
          {haltStatus.status === "error" ? <p className={errorClass}>{haltStatus.error}</p> : null}
          <button
            type="button"
            className={`${btnPrimary} ${btnSizeSm} mt-4`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setHaltStatus(await setOrgSequenceHalt(!settings.sequencesHalted));
              })
            }
          >
            {settings.sequencesHalted ? "Resume sequences" : "Stop all sequences"}
          </button>
        </Panel>
      </section>
      ) : null}

      {show.examples ? (
      <section>
        <SectionHeader
          title="Real messages you have sent"
          hint="Two to five examples. These matter more than every slider below them. Paste what this business actually sent to prospects."
        />
        <Panel className="px-6 py-5 space-y-4">
          {voice.examples.length < MIN_VOICE_EXAMPLES ? (
            <p className="text-sm text-flag-warning">
              Add at least two real messages so drafts sound like this client, not like a model.
            </p>
          ) : null}
          {voice.examples.length === 0 ? (
            <p className="text-sm text-dim">No examples yet.</p>
          ) : (
            <ol className="space-y-3">
              {voice.examples.map((item: VoiceExample, index) => (
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
            <textarea
              id="example-body"
              className={`${inputClass} min-h-24`}
              value={exampleBody}
              onChange={(event) => setExampleBody(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="example-channel" className={labelClass}>
                  Channel
                </label>
                <select
                  id="example-channel"
                  className={selectClass}
                  value={exampleChannel}
                  onChange={(event) => setExampleChannel(event.target.value as "sms" | "email")}
                >
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
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
            {exampleStatus.status === "error" ? <p className={errorClass}>{exampleStatus.error}</p> : null}
          </div>
        </Panel>
      </section>
      ) : null}

      {show.profile ? (
      <section>
        <SectionHeader title="Voice profile" hint="Used on every generation. Changes never happen from edit data unless you confirm a suggestion below." />
        <Panel className="max-w-xl px-6 py-6">
          <form action={saveVoice} className="space-y-4">
            <div>
              <label htmlFor="formality" className={labelClass}>
                Formality
              </label>
              <select id="formality" name="formality" className={selectClass} defaultValue={voice.formality}>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-silver">
              <input type="checkbox" name="use_contractions" defaultChecked={voice.useContractions} />
              Use contractions
            </label>
            <label className="flex items-center gap-2 text-sm text-silver">
              <input type="checkbox" name="use_greeting" defaultChecked={voice.useGreeting} />
              Use a greeting
            </label>
            <label className="flex items-center gap-2 text-sm text-silver">
              <input type="checkbox" name="use_signoff" defaultChecked={voice.useSignoff} />
              Use a sign-off
            </label>
            <div>
              <label htmlFor="greeting_text" className={labelClass}>
                Greeting text
              </label>
              <input id="greeting_text" name="greeting_text" className={inputClass} defaultValue={voice.greetingText ?? ""} />
            </div>
            <div>
              <label htmlFor="signoff_text" className={labelClass}>
                Sign-off text
              </label>
              <input id="signoff_text" name="signoff_text" className={inputClass} defaultValue={voice.signoffText ?? ""} />
            </div>
            <div>
              <label htmlFor="sms_max_chars" className={labelClass}>
                SMS length target
              </label>
              <input id="sms_max_chars" name="sms_max_chars" type="number" className={inputClass} defaultValue={voice.smsMaxChars} />
            </div>
            <div>
              <label htmlFor="email_max_chars" className={labelClass}>
                Email length target
              </label>
              <input
                id="email_max_chars"
                name="email_max_chars"
                type="number"
                className={inputClass}
                defaultValue={voice.emailMaxChars}
              />
            </div>
            <div>
              <label htmlFor="emoji_usage" className={labelClass}>
                Emoji
              </label>
              <select id="emoji_usage" name="emoji_usage" className={selectClass} defaultValue={voice.emojiUsage}>
                <option value="never">Never</option>
                <option value="sparing">Sparing</option>
                <option value="natural">Natural</option>
              </select>
            </div>
            <div>
              <label htmlFor="banned_words" className={labelClass}>
                Words this business does not use
              </label>
              <textarea
                id="banned_words"
                name="banned_words"
                className={`${inputClass} min-h-20`}
                defaultValue={voice.bannedWords.join("\n")}
              />
            </div>
            {voiceState.status === "error" ? <p className={errorClass}>{voiceState.error}</p> : null}
            {voiceState.status === "saved" ? <p className="text-sm text-flag-good">Saved.</p> : null}
            <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={voicePending}>
              Save voice
            </button>
          </form>
        </Panel>
      </section>
      ) : null}

      {show.policy ? (
        <>
      <section>
        <SectionHeader title="Policy" hint="Quiet hours default on. Sequence caps cannot be removed." />
        <Panel className="max-w-xl px-6 py-6">
          <form action={savePolicy} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-silver">
              <input type="checkbox" name="quiet_hours_enabled" defaultChecked={settings.quietHoursEnabled} />
              Respect quiet hours
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="quiet_hours_start" className={labelClass}>
                  Quiet start
                </label>
                <input
                  id="quiet_hours_start"
                  name="quiet_hours_start"
                  className={inputClass}
                  defaultValue={settings.quietHoursStart}
                />
              </div>
              <div>
                <label htmlFor="quiet_hours_end" className={labelClass}>
                  Quiet end
                </label>
                <input
                  id="quiet_hours_end"
                  name="quiet_hours_end"
                  className={inputClass}
                  defaultValue={settings.quietHoursEnd}
                />
              </div>
            </div>
            <div>
              <label htmlFor="max_sequence_length" className={labelClass}>
                Maximum sequence length
              </label>
              <input
                id="max_sequence_length"
                name="max_sequence_length"
                type="number"
                className={inputClass}
                defaultValue={settings.maxSequenceLength}
              />
            </div>
            <div>
              <label htmlFor="max_sequence_duration_days" className={labelClass}>
                Maximum sequence duration (days)
              </label>
              <input
                id="max_sequence_duration_days"
                name="max_sequence_duration_days"
                type="number"
                className={inputClass}
                defaultValue={settings.maxSequenceDurationDays}
              />
            </div>
            <div>
              <label htmlFor="draft_stale_days" className={labelClass}>
                Drafts go stale after (days)
              </label>
              <input
                id="draft_stale_days"
                name="draft_stale_days"
                type="number"
                className={inputClass}
                defaultValue={settings.draftStaleDays}
              />
            </div>
            {policyState.status === "error" ? <p className={errorClass}>{policyState.error}</p> : null}
            {policyState.status === "saved" ? <p className="text-sm text-flag-good">Saved.</p> : null}
            <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={policyPending}>
              Save policy
            </button>
          </form>
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Routing"
          hint="Rules are evaluated in priority order from next step and call outcome together. Nothing here is hardcoded in app logic."
        />
        <Panel className="px-6 py-5 space-y-4">
          {rules.map((rule, index) => (
            <div key={`${rule.priority}-${index}`} className="border-t border-white/[0.05] pt-4 first:border-t-0 first:pt-0">
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => {
                    const next = [...rules];
                    next[index] = { ...rule, enabled: event.target.checked };
                    setRules(next);
                  }}
                />
                {rule.priority}. {FOLLOW_UP_BRANCH_LABELS[rule.branch]}
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={labelClass}>Channel</p>
                  <select
                    className={selectClass}
                    value={rule.channel}
                    onChange={(event) => {
                      const next = [...rules];
                      next[index] = { ...rule, channel: event.target.value as "sms" | "email" };
                      setRules(next);
                    }}
                  >
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <p className={labelClass}>Sequence delays (hours)</p>
                  <input
                    className={inputClass}
                    value={rule.sequenceSteps.map((step) => step.delayHours).join(",")}
                    onChange={(event) => {
                      const delays = event.target.value
                        .split(",")
                        .map((part) => Number(part.trim()))
                        .filter((value) => Number.isFinite(value) && value >= 0);
                      const next = [...rules];
                      next[index] = {
                        ...rule,
                        sequenceSteps: delays.map((delayHours) => ({ delayHours, channel: rule.channel })),
                      };
                      setRules(next);
                    }}
                  />
                </div>
              </div>
              <p className={`${helperClass} font-mono`}>
                {JSON.stringify(rule.match)}
              </p>
            </div>
          ))}
          {ruleStatus.status === "error" ? <p className={errorClass}>{ruleStatus.error}</p> : null}
          {ruleStatus.status === "saved" ? <p className="text-sm text-flag-good">Saved.</p> : null}
          <button
            type="button"
            className={`${btnPrimary} ${btnSizeSm}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setRuleStatus(await saveRoutingRules(JSON.stringify(rules)));
              })
            }
          >
            Save routing
          </button>
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Edit patterns"
          hint="Suggestions only. The voice profile does not change until you confirm."
        />
        <Panel className="px-6 py-5 space-y-4">
          <button
            type="button"
            className={`${btnSecondary} ${btnSizeSm}`}
            disabled={pending}
            onClick={() => startTransition(async () => { await refreshVoiceSuggestions(); })}
          >
            Scan recent edits
          </button>
          {suggestions.filter((item) => item.status === "pending").length === 0 ? (
            <p className="text-sm text-dim">No pending suggestions. Consistent edits will show up here.</p>
          ) : (
            <ul className="space-y-3">
              {suggestions
                .filter((item) => item.status === "pending")
                .map((item) => (
                  <li key={item.id}>
                    <p className="text-sm text-white">{item.evidence}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`${btnPrimary} ${btnSizeSm}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await resolveVoiceSuggestion({ id: item.id, accept: true });
                          })
                        }
                      >
                        Apply to voice profile
                      </button>
                      <button
                        type="button"
                        className={`${btnSecondary} ${btnSizeSm}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await resolveVoiceSuggestion({ id: item.id, accept: false });
                          })
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </section>
        </>
      ) : null}
    </div>
  );
}
