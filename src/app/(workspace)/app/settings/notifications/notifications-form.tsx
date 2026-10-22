"use client";

import { useActionState } from "react";

import {
  saveNotificationMute,
  saveNotificationPreferences,
  saveNotificationQuietHours,
  saveOrgNotificationSettings,
  saveTextOptIn,
  sendTestNotification,
} from "@/app/(workspace)/app/settings/notifications/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
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
  quietStart,
  quietEnd,
  textOptedIn,
  textChannelOpen,
}: {
  role: OrgRole;
  isManager: boolean;
  prefs: Array<{ event_type: NotificationEventType; channel: NotificationChannel; enabled: boolean }>;
  mutedUntil: string | null;
  smsEmergenciesEnabled: boolean;
  slackSaved: boolean;
  teamsSaved: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  textOptedIn: boolean;
  textChannelOpen: boolean;
}) {
  const [prefState, savePrefs, prefPending] = useActionState(saveNotificationPreferences, idle);
  const [muteState, saveMute, mutePending] = useActionState(saveNotificationMute, idle);
  const [quietState, saveQuiet, quietPending] = useActionState(saveNotificationQuietHours, idle);
  const [textState, saveText, textPending] = useActionState(saveTextOptIn, idle);
  const [orgState, saveOrg, orgPending] = useActionState(saveOrgNotificationSettings, idle);
  const [testState, sendTest, testPending] = useActionState(sendTestNotification, idle);
  useSettingsToast(prefState, prefPending);
  useSettingsToast(muteState, mutePending);
  useSettingsToast(quietState, quietPending);
  useSettingsToast(textState, textPending);
  useSettingsToast(orgState, orgPending);
  useSettingsToast(testState, testPending, "Sent. Check that device or your email.");

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
                className="border-t border-overlay/[0.06] pt-4 first:border-t-0 first:pt-0"
              >
                <p className="text-sm text-strong">{EVENT_LABELS[eventType]}</p>
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
          title="Quiet hours"
          hint="Quiet hours are off until you set them. Critical problems, account mail, and billing still come through."
        />
        <SettingsFormCard
          action={saveQuiet}
          footer={<SubmitButton pending={quietPending}>Save quiet hours</SubmitButton>}
        >
          {quietStart && quietEnd ? (
            <p className={helperClass}>
              Non-critical alerts wait from {quietStart} to {quietEnd} in your time zone.
            </p>
          ) : (
            <Notice tone="info">Quiet hours are off. Set a window if you want non-critical alerts to wait.</Notice>
          )}
          <Field label="Start" name="quiet_start">
            <Input name="quiet_start" id="quiet_start" type="time" defaultValue={quietStart ?? ""} />
          </Field>
          <Field label="End" name="quiet_end">
            <Input name="quiet_end" id="quiet_end" type="time" defaultValue={quietEnd ?? ""} />
          </Field>
          {quietStart && quietEnd ? <CheckboxField name="clear_quiet" label="Turn quiet hours off" /> : null}
          {quietState.status === "error" ? <p className={errorClass}>{quietState.error}</p> : null}
        </SettingsFormCard>
      </section>

      <section>
        <SectionHeader
          title="Critical texts"
          hint="Texts use the Vistrial notification number. They are only for a critical problem, at most 5 a day, and they do not include lead details. Reply STOP to opt out."
        />
        <SettingsFormCard
          action={saveText}
          footer={<SubmitButton pending={textPending}>Save text choice</SubmitButton>}
        >
          {textChannelOpen ? (
            <p className={helperClass}>The notification number is registered. Texts send only after you opt in.</p>
          ) : (
            <Notice tone="info">
              Text is off until the notification number is registered with the carrier. You can opt in now. Nothing
              sends before that.
            </Notice>
          )}
          <Switch
            name="text_opt_in"
            defaultChecked={textOptedIn}
            label="Text me when something critical is broken"
            description="Reply STOP to opt out. Reply HELP for help."
          />
          {textState.status === "error" ? <p className={errorClass}>{textState.error}</p> : null}
        </SettingsFormCard>
      </section>

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
              label="Allow critical texts for this workspace"
              description="Off until you turn it on. Each person still has to opt in. Texts wait an hour after the first alert, and only if the problem is still open. The number is Vistrial's, not a lead number."
            />
            <AdvancedDoor closedLabel="Connect Slack or Teams">
              <Field
                label="Slack connection address"
                name="slack_webhook"
                help={slackSaved ? "Slack is connected. Paste a new address to replace it." : "Optional. Paste the address Slack gives you."}
              >
                <Input name="slack_webhook" id="slack_webhook" type="url" placeholder="https://hooks.slack.com/services/…" />
              </Field>
              {slackSaved ? <CheckboxField name="clear_slack" label="Disconnect Slack" /> : null}
              <Field
                label="Teams connection address"
                name="teams_webhook"
                help={teamsSaved ? "Teams is connected. Paste a new address to replace it." : "Optional. Paste the address Teams gives you."}
              >
                <Input name="teams_webhook" id="teams_webhook" type="url" placeholder="https://outlook.office.com/webhook/…" />
              </Field>
              {teamsSaved ? <CheckboxField name="clear_teams" label="Disconnect Teams" /> : null}
            </AdvancedDoor>
            {orgState.status === "error" ? <p className={errorClass}>{orgState.error}</p> : null}
          </SettingsFormCard>
        </section>
      ) : null}
    </div>
  );
}
