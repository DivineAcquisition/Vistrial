"use client";

import { useActionState } from "react";

import { updateWorkingHours } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WEEKDAY_LABELS } from "@/lib/notifications/labels";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import { cardStack, errorClass, helperClass, labelClass, successClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function WorkingHoursForm({
  phone,
  timezone,
  workingHoursStart,
  workingHoursEnd,
  workingDays,
}: {
  phone: string | null;
  timezone: string | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  workingDays: number[];
}) {
  const [state, action, pending] = useActionState(updateWorkingHours, initial);
  const timezoneOptions = timezone && !isOrgTimezone(timezone) ? [timezone, ...ORG_TIMEZONES] : ORG_TIMEZONES;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <p className={helperClass}>
          Notifications wait until these hours in your timezone, except stalled ingestion and a broken
          CRM.
        </p>
        <Field
          label="Phone"
          name="phone"
          help="Used only for emergency SMS if the workspace has turned that on."
        >
          <Input name="phone" id="phone" type="tel" defaultValue={phone ?? ""} />
        </Field>
        <Field label="Timezone" name="timezone" help="Empty means the organization timezone.">
          <Select name="timezone" id="notify-timezone" defaultValue={timezone || ""}>
            <option value="">Organization default</option>
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {isOrgTimezone(zone) ? ORG_TIMEZONE_LABELS[zone] : zone}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Working hours start" name="working_hours_start" help="Empty means the organization hours.">
          <Input
            name="working_hours_start"
            id="notify-hours-start"
            type="time"
            defaultValue={workingHoursStart ?? ""}
          />
        </Field>
        <Field label="Working hours end" name="working_hours_end">
          <Input
            name="working_hours_end"
            id="notify-hours-end"
            type="time"
            defaultValue={workingHoursEnd ?? ""}
          />
        </Field>
        <fieldset>
          <legend className={labelClass}>Working days</legend>
          <p className={helperClass}>Leave all unchecked to inherit the organization days.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
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
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}
        <CardFooter>
          <SubmitButton pending={pending}>Save hours</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
