"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { WeekdayToggleRow } from "@/components/settings/weekday-toggle-row";
import { WorkingHoursFields } from "@/components/settings/working-hours-fields";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import { errorClass, helperClass } from "@/lib/ui";

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
  useSettingsToast(state, pending);
  const timezoneOptions = timezone && !isOrgTimezone(timezone) ? [timezone, ...ORG_TIMEZONES] : ORG_TIMEZONES;

  return (
    <SettingsFormCard
      action={action}
      footer={<SubmitButton pending={pending}>Save</SubmitButton>}
    >
      <Field label="Display name" name="display_name" error={error}>
        <Input
          name="display_name"
          id="display_name"
          type="text"
          required
          maxLength={80}
          defaultValue={displayName}
          placeholder="Jordan Blake"
        />
      </Field>

      <Field
        label="Email"
        name="email"
        help="This is the address teammates see on members lists. It does not change how you sign in."
      >
        <Input name="email" id="email" type="email" required defaultValue={email} placeholder="you@company.com" />
      </Field>

      <Field
        label="Phone"
        name="phone"
        help="Used only for emergency SMS if the workspace has turned that on. Leave blank to skip SMS."
      >
        <Input name="phone" id="phone" type="tel" defaultValue={phone ?? ""} placeholder="(555) 201-8890" />
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

      <WorkingHoursFields
        start={workingHoursStart ?? ""}
        end={workingHoursEnd ?? ""}
        help="Empty means the organization hours."
      />

      <Fieldset className="flex min-w-0 flex-col gap-2">
        <FieldsetLegend>Working days</FieldsetLegend>
        <p className={helperClass}>Leave all unchecked to inherit the organization days.</p>
        <WeekdayToggleRow selected={workingDays} />
      </Fieldset>

      <Field
        label="Sign-in email"
        name="sign_in_email"
        help="The account you log in with. Only you can edit this profile — an admin changing another member uses the Members tab."
      >
        <Input id="sign_in_email" type="email" readOnly value={signInEmail} tabIndex={-1} />
      </Field>

      {error ? <p className={errorClass}>{error}</p> : null}
    </SettingsFormCard>
  );
}
