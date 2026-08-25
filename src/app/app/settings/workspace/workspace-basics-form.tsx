"use client";

import { useActionState } from "react";

import { updateWorkspaceBasics } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BUSINESS_HOURS_EFFECT } from "@/lib/settings/constants";
import { WEEKDAY_LABELS } from "@/lib/notifications/labels";
import { DEFAULT_WORKING_DAYS } from "@/lib/notifications/constants";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import { cardStack, errorClass, helperClass, labelClass, successClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function WorkspaceBasicsForm({
  name,
  timezone,
  workingHoursStart,
  workingHoursEnd,
  workingDays,
}: {
  name: string;
  timezone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
}) {
  const [state, action, pending] = useActionState(updateWorkspaceBasics, initial);
  const timezoneOptions = isOrgTimezone(timezone) ? ORG_TIMEZONES : ([timezone, ...ORG_TIMEZONES] as const);
  const error = state.status === "error" ? state.error : null;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <p className={helperClass}>{BUSINESS_HOURS_EFFECT}</p>
        <Field label="Business name" name="name" error={error}>
          <Input name="name" id="workspace-name" required maxLength={120} defaultValue={name} />
        </Field>
        <Field label="Timezone" name="timezone">
          <Select name="timezone" id="workspace-timezone" required defaultValue={timezone}>
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {isOrgTimezone(zone) ? ORG_TIMEZONE_LABELS[zone] : zone}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Working hours start"
          name="working_hours_start"
          help="Notifications, follow-up send windows, and response-time measurement all use this clock."
        >
          <Input
            name="working_hours_start"
            id="workspace-hours-start"
            type="time"
            required
            defaultValue={workingHoursStart}
          />
        </Field>
        <Field label="Working hours end" name="working_hours_end">
          <Input
            name="working_hours_end"
            id="workspace-hours-end"
            type="time"
            required
            defaultValue={workingHoursEnd}
          />
        </Field>
        <fieldset>
          <legend className={labelClass}>Working days</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(DEFAULT_WORKING_DAYS as readonly number[]).concat([6, 7]).map((day) => (
              <CheckboxField
                key={day}
                name="working_days"
                value={String(day)}
                defaultChecked={workingDays.includes(day)}
                label={WEEKDAY_LABELS[day]}
              />
            ))}
          </div>
        </fieldset>
        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}
        <CardFooter>
          <SubmitButton pending={pending}>Save business basics</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
