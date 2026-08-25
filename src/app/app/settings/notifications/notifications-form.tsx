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
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/section-header";
import { Switch } from "@/components/ui/switch";
import { USER_PREF_CHANNELS, USER_PREF_EVENTS } from "@/lib/notifications/constants";
import { defaultChannelEnabled } from "@/lib/notifications/defaults";
import { CHANNEL_LABELS, EVENT_LABELS } from "@/lib/notifications/labels";
import { preferenceLocked } from "@/lib/notifications/policy";
import { cardStack, errorClass, helperClass, successClass } from "@/lib/ui";
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

  const prefMap = new Map(prefs.map((row) => [`${row.event_type}:${row.channel}`, row.enabled]));

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="This device"
          hint="Push is the default for anything with a clock on it. It never fires for something already on your screen."
        />
        <Card className="max-w-xl">
          <PushEnable />
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Channels per event"
          hint="One event uses one channel. Turning a default off and another on moves it; it does not fire twice. You cannot turn off escalation that reaches an admin."
        />
        <Card className="max-w-3xl">
          <form action={savePrefs} className={cardStack}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-dim">
                    <th className="py-2 pr-4 font-medium">Event</th>
                    {USER_PREF_CHANNELS.map((channel) => (
                      <th key={channel} className="py-2 pr-4 font-medium">
                        {CHANNEL_LABELS[channel]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {USER_PREF_EVENTS.map((eventType) => (
                    <tr key={eventType} className="border-t border-white/[0.06]">
                      <td className="py-2.5 pr-4 text-white">{EVENT_LABELS[eventType]}</td>
                      {USER_PREF_CHANNELS.map((channel) => {
                        const locked = preferenceLocked({ role, eventType, channel });
                        const key = `${eventType}:${channel}`;
                        const checked = prefMap.has(key)
                          ? Boolean(prefMap.get(key))
                          : defaultChannelEnabled(role, eventType, channel);
                        return (
                          <td key={channel} className="py-2.5 pr-4">
                            <Checkbox
                              name={`pref:${eventType}:${channel}`}
                              defaultChecked={checked}
                              disabled={locked}
                              aria-label={`${EVENT_LABELS[eventType]} ${CHANNEL_LABELS[channel]}`}
                            />
                            {locked ? (
                              <span className="sr-only">Required for admin escalation</span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {prefState.status === "error" ? <p className={errorClass}>{prefState.error}</p> : null}
            {prefState.status === "saved" ? <p className={successClass}>Saved.</p> : null}
            <CardFooter>
              <SubmitButton pending={prefPending}>Save preferences</SubmitButton>
            </CardFooter>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Temporary mute"
          hint="Mute always ends. There is no permanent silent mute. Emergencies and admin escalation still send."
        />
        <Card className="max-w-xl">
          <form action={saveMute} className={cardStack}>
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
              <Input name="muted_until" id="muted_until" type="datetime-local" />
            </Field>
            {mutedUntil ? (
              <CheckboxField name="clear_mute" label="End mute now" />
            ) : null}
            {muteState.status === "error" ? <p className={errorClass}>{muteState.error}</p> : null}
            {muteState.status === "saved" ? <p className={successClass}>Saved.</p> : null}
            <CardFooter>
              <SubmitButton pending={mutePending}>Save mute</SubmitButton>
            </CardFooter>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Test send"
          hint="Sends on the real channel. A failure here is a configuration problem, not a silent skip."
        />
        <Card className="max-w-xl">
          <form action={sendTest} className={cardStack}>
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
            {testState.status === "saved" ? <p className={successClass}>Sent. Check that device or inbox.</p> : null}
          </form>
        </Card>
      </section>

      {isManager ? (
        <section>
          <SectionHeader
            title="Workspace"
            hint="SMS is off until you turn it on. Slack or Teams is the team channel for a breach seen by more than one person."
          />
          <Card className="max-w-xl">
            <form action={saveOrg} className={cardStack}>
              <Switch
                name="sms_emergencies_enabled"
                defaultChecked={smsEmergenciesEnabled}
                label="SMS for stalled ingestion and a broken CRM"
                description="Default off. Fires one hour after the push if the condition still holds, never at the same time."
              />
              <Field
                label="Slack incoming webhook"
                name="slack_webhook"
                help={slackSaved ? "A webhook is saved. Paste a new URL to replace it." : "Optional."}
              >
                <Input name="slack_webhook" id="slack_webhook" type="url" placeholder="https://" />
              </Field>
              {slackSaved ? <CheckboxField name="clear_slack" label="Remove Slack webhook" /> : null}
              <Field
                label="Teams incoming webhook"
                name="teams_webhook"
                help={teamsSaved ? "A webhook is saved. Paste a new URL to replace it." : "Optional."}
              >
                <Input name="teams_webhook" id="teams_webhook" type="url" placeholder="https://" />
              </Field>
              {teamsSaved ? <CheckboxField name="clear_teams" label="Remove Teams webhook" /> : null}
              {orgState.status === "error" ? <p className={errorClass}>{orgState.error}</p> : null}
              {orgState.status === "saved" ? <p className={successClass}>Saved.</p> : null}
              <CardFooter>
                <SubmitButton pending={orgPending}>Save workspace alerts</SubmitButton>
              </CardFooter>
            </form>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
