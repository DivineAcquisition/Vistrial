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
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SliderField } from "@/components/ui/slider-field";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionHeader } from "@/components/ui/section-header";
import { AdvancedDoor } from "@/components/settings/advanced-door";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { toastManager } from "@/components/ui/toast";
import { MIN_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { FOLLOW_UP_BRANCH_LABELS, FOLLOW_UP_CHANNEL_LABELS, routingRuleSentence } from "@/lib/follow-up/labels";
import type { FollowUpSettings, RoutingRule, VoiceExample, VoiceProfile } from "@/lib/follow-up/types";
import { errorClass, formMeasure, helperClass, labelClass } from "@/lib/ui";

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
}: {
  settings: FollowUpSettings;
  voice: VoiceProfile;
  rules: RoutingRule[];
  suggestions: VoiceSuggestionRow[];
}) {
  const [policyState, savePolicy, policyPending] = useActionState(updateFollowUpPolicy, idle);
  const [voiceState, saveVoice, voicePending] = useActionState(updateVoiceProfile, idle);
  const [haltStatus, setHaltStatus] = useState<SettingsSaveResult>(idle);
  const [exampleStatus, setExampleStatus] = useState<SettingsSaveResult>(idle);
  const [exampleBody, setExampleBody] = useState("");
  const [exampleChannel, setExampleChannel] = useState<"sms" | "email">("sms");
  const [rules, setRules] = useState(initialRules);
  const [ruleStatus, setRuleStatus] = useState<SettingsSaveResult>(idle);
  const [pending, startTransition] = useTransition();
  const [smsMaxChars, setSmsMaxChars] = useState(voice.smsMaxChars);
  useSettingsToast(voiceState, voicePending);
  useSettingsToast(policyState, policyPending);

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="Sequence stop"
          hint="This switch exists before any sequence can run. It stops later drafts from being scheduled. It does not send anything."
        />
        <Panel className="p-6">
          <Switch
            checked={settings.sequencesHalted}
            disabled={pending}
            label="Stop all sequences for this workspace"
            description={
              settings.sequencesHalted
                ? "Stopped. No further sequence step will be scheduled. Drafts already approved still send."
                : "Allowed. Sequence steps are scheduled as calls are read."
            }
            onChange={(event) => {
              const next = event.target.checked;
              startTransition(async () => {
                setHaltStatus(await setOrgSequenceHalt(next));
              });
            }}
          />
          {haltStatus.status === "error" ? <p className={errorClass}>{haltStatus.error}</p> : null}
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Real messages you have sent"
          hint="Two to five examples. These matter more than every slider below them. Paste what this business actually sent to prospects."
        />
        <Panel className="p-6 space-y-4">
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setExampleStatus(await removeVoiceExample(index));
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <div>
            <Field label="Paste a sent message" name="example-body">
              <Textarea
                id="example-body"
                className="min-h-24"
                value={exampleBody}
                placeholder="Hey, it's Alex — circling back on Thursday."
                onChange={(event) => setExampleBody(event.target.value)}
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Channel" name="example-channel" className="w-auto">
                <Select
                  id="example-channel"
                  value={exampleChannel}
                  onChange={(event) => setExampleChannel(event.target.value as "sms" | "email")}
                >
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </Select>
              </Field>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setExampleStatus(await addVoiceExample({ body: exampleBody, channel: exampleChannel }));
                    setExampleBody("");
                  })
                }
              >
                Add example
              </Button>
            </div>
            {exampleStatus.status === "error" ? <p className={errorClass}>{exampleStatus.error}</p> : null}
          </div>
        </Panel>
      </section>

      <AdvancedDoor closedLabel="Show how drafts sound">
      <section>
        <SectionHeader title="How drafts sound" hint="Used on every generation. Changes never happen from edit data unless you confirm a suggestion below." />
        <Panel className={`${formMeasure} p-6`}>
          <form action={saveVoice} className="space-y-4">
            <Field label="Formality" name="formality">
              <Select id="formality" name="formality" defaultValue={voice.formality}>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
              </Select>
            </Field>
            <CheckboxField
              name="use_contractions"
              defaultChecked={voice.useContractions}
              label="Use contractions"
            />
            <CheckboxField
              name="use_greeting"
              defaultChecked={voice.useGreeting}
              label="Use a greeting"
            />
            <CheckboxField
              name="use_signoff"
              defaultChecked={voice.useSignoff}
              label="Use a sign-off"
            />
            <Field label="Greeting text" name="greeting_text">
              <Input id="greeting_text" name="greeting_text" type="text" defaultValue={voice.greetingText ?? ""} placeholder="Hey {first_name}," />
            </Field>
            <Field label="Sign-off text" name="signoff_text">
              <Input id="signoff_text" name="signoff_text" type="text" defaultValue={voice.signoffText ?? ""} placeholder="Talk soon," />
            </Field>
            <Field label="SMS length target" name="sms_max_chars">
              <input type="hidden" name="sms_max_chars" value={smsMaxChars} />
              <SliderField
                aria-label="SMS length target"
                max={480}
                min={80}
                value={smsMaxChars}
                onValueChange={setSmsMaxChars}
              />
            </Field>
            <Field label="Email length target" name="email_max_chars">
              <Input
                id="email_max_chars"
                name="email_max_chars"
                type="number"
                defaultValue={voice.emailMaxChars}
                placeholder="900"
              />
            </Field>
            <Field label="Emoji" name="emoji_usage">
              <Select id="emoji_usage" name="emoji_usage" defaultValue={voice.emojiUsage}>
                <option value="never">Never</option>
                <option value="sparing">Sparing</option>
                <option value="natural">Natural</option>
              </Select>
            </Field>
            <Field label="Words this business does not use" name="banned_words">
              <Textarea
                id="banned_words"
                name="banned_words"
                className="min-h-20"
                defaultValue={voice.bannedWords.join("\n")}
                placeholder={"unlock\ngame-changer"}
              />
            </Field>
            {voiceState.status === "error" ? <p className={errorClass}>{voiceState.error}</p> : null}
            <Button type="submit" variant="primary" size="lg" disabled={voicePending}>
              Save voice
            </Button>
          </form>
        </Panel>
      </section>
      </AdvancedDoor>

      <section>
        <SectionHeader title="Quiet hours" hint="Quiet hours default on. How long a sequence can run cannot be turned off." />
        <Panel className={`${formMeasure} p-6`}>
          <form action={savePolicy} className="space-y-4">
            <CheckboxField
              name="quiet_hours_enabled"
              defaultChecked={settings.quietHoursEnabled}
              label="Respect quiet hours"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quiet start" name="quiet_hours_start">
                <Input
                  id="quiet_hours_start"
                  name="quiet_hours_start"
                  type="time"
                  defaultValue={settings.quietHoursStart}
                />
              </Field>
              <Field label="Quiet end" name="quiet_hours_end">
                <Input
                  id="quiet_hours_end"
                  name="quiet_hours_end"
                  type="time"
                  defaultValue={settings.quietHoursEnd}
                />
              </Field>
            </div>
            <Field label="Maximum sequence length" name="max_sequence_length">
              <Input
                id="max_sequence_length"
                name="max_sequence_length"
                type="number"
                defaultValue={settings.maxSequenceLength}
                placeholder="4"
              />
            </Field>
            <Field label="Maximum sequence duration (days)" name="max_sequence_duration_days">
              <Input
                id="max_sequence_duration_days"
                name="max_sequence_duration_days"
                type="number"
                defaultValue={settings.maxSequenceDurationDays}
                placeholder="14"
              />
            </Field>
            <Field label="Drafts go stale after (days)" name="draft_stale_days">
              <Input
                id="draft_stale_days"
                name="draft_stale_days"
                type="number"
                defaultValue={settings.draftStaleDays}
                placeholder="7"
              />
            </Field>
            {policyState.status === "error" ? <p className={errorClass}>{policyState.error}</p> : null}
            <Button type="submit" variant="primary" size="lg" disabled={policyPending}>
              Save quiet hours and limits
            </Button>
          </form>
        </Panel>
      </section>

      <AdvancedDoor closedLabel="Show how drafts are written">
      <div className="space-y-10">
      <section>
        <SectionHeader
          title="When we write, and on which channel"
          hint="Rules run in order. Turn one off if this business does not use that situation."
        />
        <Panel className="p-6 space-y-4">
          {rules.map((rule, index) => (
            <div key={`${rule.priority}-${index}`} className="border-t border-white/[0.05] pt-4 first:border-t-0 first:pt-0">
              <label className="flex items-center gap-2 text-sm text-white">
                <Checkbox
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
                  <Select
                    
                    value={rule.channel}
                    onChange={(event) => {
                      const next = [...rules];
                      next[index] = { ...rule, channel: event.target.value as "sms" | "email" };
                      setRules(next);
                    }}
                  >
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </Select>
                </div>
                <div>
                  <Field label="Sequence delays (hours)" name={`delays-${index}`}>
                    <Input
                      id={`delays-${index}`}
                      type="text"
                      value={rule.sequenceSteps.map((step) => step.delayHours).join(",")}
                      placeholder="24, 72, 168"
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
                  </Field>
                </div>
              </div>
              <p className={helperClass}>{routingRuleSentence(rule)}</p>
            </div>
          ))}
          {ruleStatus.status === "error" ? <p className={errorClass}>{ruleStatus.error}</p> : null}
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveRoutingRules(JSON.stringify(rules));
                setRuleStatus(result);
                if (result.status === "saved") {
                  toastManager.add({
                    title: "Saved",
                    description: "Routing rules updated.",
                    type: "success",
                  });
                } else if (result.status === "error") {
                  toastManager.add({
                    title: "Could not save",
                    description: result.error,
                    type: "error",
                  });
                }
              })
            }
          >
            Save routing
          </Button>
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Edit patterns"
          hint="Suggestions only. The voice profile does not change until you confirm."
        />
        <Panel className="p-6 space-y-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(async () => { await refreshVoiceSuggestions(); })}
          >
            Scan recent edits
          </Button>
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
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await resolveVoiceSuggestion({ id: item.id, accept: true });
                          })
                        }
                      >
                        Apply to voice profile
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await resolveVoiceSuggestion({ id: item.id, accept: false });
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </section>
      </div>
      </AdvancedDoor>
    </div>
  );
}
