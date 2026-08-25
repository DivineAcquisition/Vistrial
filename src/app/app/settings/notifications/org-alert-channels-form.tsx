"use client";

import { useActionState } from "react";

import { saveOrgNotificationSettings } from "@/app/app/settings/notifications/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cardStack, errorClass, helperClass, successClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function OrgAlertChannelsForm({
  smsEmergenciesEnabled,
  slackSaved,
  teamsSaved,
}: {
  smsEmergenciesEnabled: boolean;
  slackSaved: boolean;
  teamsSaved: boolean;
}) {
  const [orgState, saveOrg, orgPending] = useActionState(saveOrgNotificationSettings, idle);
  return (
    <Card className="max-w-xl">
      <form action={saveOrg} className={cardStack}>
        <p className={helperClass}>
          SMS is off until you turn it on. Slack or Teams is the team channel for a breach seen by
          more than one person.
        </p>
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
  );
}
