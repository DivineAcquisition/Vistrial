"use client";

import { useActionState } from "react";

import {
  saveNotificationMute,
  saveNotificationPreferences,
  saveOrgNotificationSettings,
  sendTestNotification,
} from "@/app/app/settings/notifications/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { PushEnable } from "@/components/app/push-enable";
import { AdvancedDoor } from "@/components/settings/advanced-door";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/section-header";
import { Switch } from "@/components/ui/switch";
import { USER_PREF_CHANNELS, USER_PREF_EVENTS } from "@/lib/notifications/constants";
import { defaultChannelEnabled } from "@/lib/notifications/defaults";
import { CHANNEL_LABELS, EVENT_LABELS } from "@/lib/notifications/labels";
import { preferenceLocked } from "@/lib/notifications/policy";
import { errorClass, formMeasure, helperClass } from "@/lib/ui";
import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";
import type { OrgRole } from "@/types/database";

const idle: SettingsSaveResult = { status: "idle" };

export function NotificationSettingsForm({
  role,
  isManager,
  prefs,
  mutedUntil,
  smsEmergenciesEnabled,
  slackSaved,
  teamsSaved,
}: {
  role: OrgRole;
  isManager: boolean;
  prefs: Array<{ event_type: NotificationEventType; channel: NotificationChannel; enabled: boolean }>;
  mutedUntil: string | null;
  smsEmergenciesEnabled: boolean;
  slackSaved: boolean;
  teamsSaved: boolean;
}) {
  const [prefState, savePrefs, prefPending] = useActionState(saveNotificationPreferences, idle);
  const [muteState, saveMute, mutePending] = useActionState(saveNotificationMute, idle);
  const [orgState, saveOrg, orgPending] = useActionState(saveOrgNotificationSettings, idle);
  const [testState, sendTest, testPending] = useActionState(sendTestNotification, idle);
  useSettingsToast(prefState, prefPending);
  useSettingsToast(muteState, mutePending);
  useSettingsToast(orgState, orgPending);
  useSettingsToast(testState, testPending, "Sent. Check that device or inbox.");

  const prefMap = new Map(prefs.map((row) => [`${row.event_type}:${row.channel}`, row.enabled]));

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="This device"
          hint="Push is the default for anything with a clock on it. It never fires for something already on your screen."
        />
        <Card className={formMeasure}>
          <CardPanel>
            <PushEnable />
          </CardPanel>
        </Card>
      </section>

      <AdvancedDoor closedLabel="Change what reaches you">
      <section>
        <SectionHeader
          title="What reaches you"
          hint="One event uses one channel. Turning a default off and another on moves it; it does not fire twice. You cannot turn off alerts that have to reach an admin."
        />
        <SettingsFormCard
          className="max-w-3xl"
          action={savePrefs}
          footer={<SubmitButton pending={prefPending}>Save preferences</SubmitButton>}
        >
          <div className="space-y-5">
            {USER_PREF_EVENTS.map((eventType) => (
              <div
                key={eventType}
                className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0"
              >
                <p className="text-sm text-white">{EVENT_LABELS[eventType]}</p>
                <div className="mt-2 grid gap-2">
                  {USER_PREF_CHANNELS.map((channel) => {
                    const locked = preferenceLocked({ role, eventType, channel });
                    const key = `${eventType}:${channel}`;
                    const checked = prefMap.has(key)
                      ? Boolean(prefMap.get(key))
                      : defaultChannelEnabled(role, eventType, channel);
                    return (
                      <CheckboxField
                        key={channel}
                        name={`pref:${eventType}:${channel}`}
                        defaultChecked={checked}
                        disabled={locked}
                        label={CHANNEL_LABELS[channel]}
                        description={
                          locked ? "Required for admin escalation" : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {prefState.status === "error" ? <p className={errorClass}>{prefState.error}</p> : null}
        </SettingsFormCard>
      </section>
      </AdvancedDoor>

      <section>
        <SectionHeader
          title="Temporary mute"
          hint="Mute always ends. There is no permanent silent mute. Emergencies and admin escalation still send."
        />
        <SettingsFormCard
          action={saveMute}
          footer={<SubmitButton pending={mutePending}>Save mute</SubmitButton>}
        >
          {mutedUntil ? (
            <Notice tone="warning">
              Muted until {new Date(mutedUntil).toLocaleString()}. Visible so nobody is uncovered
              without knowing.
            </Notice>
          ) : (
            <p className={helperClass}>Not muted.</p>
          )}
          <Field
            label="Mute until"
            name="muted_until"
            help="At most seven days from now."
          >
            <Input name="muted_until" id="muted_until" type="datetime-local" placeholder="YYYY-MM-DD HH:MM" />
          </Field>
          {mutedUntil ? (
            <CheckboxField name="clear_mute" label="End mute now" />
          ) : null}
          {muteState.status === "error" ? <p className={errorClass}>{muteState.error}</p> : null}
        </SettingsFormCard>
      </section>

      <section>
        <SectionHeader
          title="Test send"
          hint="Sends on the real channel. A failure here is a configuration problem, not a silent skip."
        />
        <SettingsFormCard action={sendTest}>
          <div className="flex flex-wrap gap-2">
            {(["push", "email", "sms", "team"] as const).map((channel) => (
              <SubmitButton
                key={channel}
                pending={testPending}
                name="channel"
                value={channel}
                variant="secondary"
              >
                Test {CHANNEL_LABELS[channel]}
              </SubmitButton>
            ))}
          </div>
          {testState.status === "error" ? <p className={errorClass}>{testState.error}</p> : null}
        </SettingsFormCard>
      </section>

      {isManager ? (
        <section>
          <SectionHeader
            title="Workspace"
            hint="Text messages stay off until you turn them on. Slack or Teams is the channel when more than one person needs to see that someone waited too long."
          />
          <SettingsFormCard
            action={saveOrg}
            footer={<SubmitButton pending={orgPending}>Save workspace alerts</SubmitButton>}
          >
            <Switch
              name="sms_emergencies_enabled"
              defaultChecked={smsEmergenciesEnabled}
              label="Text me if new leads stop arriving or the CRM breaks"
              description="Off until you turn it on. Fires one hour after the push if the condition still holds, never at the same time."
            />
            <AdvancedDoor closedLabel="Connect Slack or Teams">
              <Field
                label="Slack incoming webhook"
                name="slack_webhook"
                help={slackSaved ? "A webhook is saved. Paste a new URL to replace it." : "Optional. Paste the address Slack gives you."}
              >
                <Input name="slack_webhook" id="slack_webhook" type="url" placeholder="https://hooks.slack.com/services/…" />
              </Field>
              {slackSaved ? <CheckboxField name="clear_slack" label="Remove Slack webhook" /> : null}
              <Field
                label="Teams incoming webhook"
                name="teams_webhook"
                help={teamsSaved ? "A webhook is saved. Paste a new URL to replace it." : "Optional. Paste the address Teams gives you."}
              >
                <Input name="teams_webhook" id="teams_webhook" type="url" placeholder="https://outlook.office.com/webhook/…" />
              </Field>
              {teamsSaved ? <CheckboxField name="clear_teams" label="Remove Teams webhook" /> : null}
            </AdvancedDoor>
            {orgState.status === "error" ? <p className={errorClass}>{orgState.error}</p> : null}
          </SettingsFormCard>
        </section>
      ) : null}
    </div>
  );
}
