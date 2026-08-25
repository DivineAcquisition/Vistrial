"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WEEKDAY_LABELS } from "@/lib/notifications/labels";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import {
  cardStack,
  errorClass,
  helperClass,
  labelClass,
  readonlyFieldClass,
  successClass,
} from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function ProfileForm({
  displayName,
  email,
  signInEmail,
  phone,
  timezone,
  workingHoursStart,
  workingHoursEnd,
  workingDays,
}: {
  displayName: string;
  email: string;
  signInEmail: string;
  phone: string | null;
  timezone: string | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  workingDays: number[];
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const error = state.status === "error" ? state.error : null;
  const timezoneOptions = timezone && !isOrgTimezone(timezone) ? [timezone, ...ORG_TIMEZONES] : ORG_TIMEZONES;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <Field label="Display name" name="display_name" error={error}>
          <Input
            name="display_name"
            id="display_name"
            required
            maxLength={80}
            defaultValue={displayName}
          />
        </Field>

        <Field
          label="Email"
          name="email"
          help="This is the address teammates see on members lists. It does not change how you sign in."
        >
          <Input name="email" id="email" type="email" required defaultValue={email} />
        </Field>

        <Field
          label="Phone"
          name="phone"
          help="Used only for emergency SMS if the workspace has turned that on. Leave blank to skip SMS."
        >
          <Input name="phone" id="phone" type="tel" defaultValue={phone ?? ""} />
        </Field>

        <Field
          label="Timezone"
          name="timezone"
          help="Working hours are evaluated in this zone. Empty means the organization timezone."
        >
          <Select name="timezone" id="timezone" defaultValue={timezone || ""}>
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
            id="working_hours_start"
            type="time"
            defaultValue={workingHoursStart ?? ""}
          />
        </Field>

        <Field label="Working hours end" name="working_hours_end">
          <Input
            name="working_hours_end"
            id="working_hours_end"
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

        <div>
          <p className={labelClass}>Sign-in email</p>
          <p className={readonlyFieldClass}>{signInEmail}</p>
          <p className={helperClass}>
            The account you log in with. Only you can edit this profile — an admin changing another
            member uses the Members tab.
          </p>
        </div>

        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}

        <CardFooter>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
