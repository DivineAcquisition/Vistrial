"use client";

import { useActionState } from "react";

import {
  saveNotificationMute,
  saveNotificationPreferences,
  sendTestNotification,
} from "@/app/app/settings/notifications/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/section-header";
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
  prefs,
  mutedUntil,
}: {
  role: OrgRole;
  prefs: Array<{ event_type: NotificationEventType; channel: NotificationChannel; enabled: boolean }>;
  mutedUntil: string | null;
}) {
  const [prefState, savePrefs, prefPending] = useActionState(saveNotificationPreferences, idle);
  const [muteState, saveMute, mutePending] = useActionState(saveNotificationMute, idle);
  const [testState, sendTest, testPending] = useActionState(sendTestNotification, idle);

  const prefMap = new Map(prefs.map((row) => [`${row.event_type}:${row.channel}`, row.enabled]));

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="Channels per event"
          hint="One event uses one channel. Turning a default off and another on moves it; it does not fire twice. You cannot turn off escalation that reaches an admin."
        />
        <Card className="max-w-3xl">
          <form action={savePrefs} className={cardStack}>
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
                          description={locked ? "Required for admin escalation" : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
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
            <Field label="Mute until" name="muted_until" help="At most seven days from now.">
              <Input name="muted_until" id="muted_until" type="datetime-local" />
            </Field>
            {mutedUntil ? <CheckboxField name="clear_mute" label="End mute now" /> : null}
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
            {testState.status === "saved" ? (
              <p className={successClass}>Sent. Check that device or inbox.</p>
            ) : null}
          </form>
        </Card>
      </section>
    </div>
  );
}
