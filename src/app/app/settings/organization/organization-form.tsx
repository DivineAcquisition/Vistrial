"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateOrganization } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WEEKDAY_LABELS } from "@/lib/notifications/labels";
import { DEFAULT_WORKING_DAYS } from "@/lib/notifications/constants";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import {
  cardStack,
  cardTitle,
  errorClass,
  helperClass,
  labelClass,
  readonlyFieldClass,
  successClass,
} from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function OrganizationForm({
  name,
  timezone,
  ghlLocationId,
  salesCycleDays,
  baselineLookbackDays,
  workingHoursStart,
  workingHoursEnd,
  workingDays,
}: {
  name: string;
  timezone: string;
  ghlLocationId: string | null;
  salesCycleDays: number;
  baselineLookbackDays: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
}) {
  const [state, action, pending] = useActionState(updateOrganization, initial);
  const timezoneOptions = isOrgTimezone(timezone)
    ? ORG_TIMEZONES
    : ([timezone, ...ORG_TIMEZONES] as const);
  const error = state.status === "error" ? state.error : null;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <Field label="Name" name="name" error={error}>
          <Input name="name" id="name" required maxLength={120} defaultValue={name} />
        </Field>

        <Field label="Timezone" name="timezone">
          <Select name="timezone" id="timezone" required defaultValue={timezone}>
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {isOrgTimezone(zone) ? ORG_TIMEZONE_LABELS[zone] : zone}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Sales cycle (days)"
          name="sales_cycle_days"
          help="A lead cohort enters the headline outcome metric only after this many days. Default 60. Maturing cohorts are shown separately and never blended into that number."
        >
          <Input
            name="sales_cycle_days"
            id="sales_cycle_days"
            type="number"
            min={14}
            max={365}
            required
            defaultValue={salesCycleDays}
          />
        </Field>

        <Field
          label="Baseline lookback (days)"
          name="baseline_lookback_days"
          help="How far the automatic CRM history pull reaches. Default 365. Changing this does not re-run the backfill by itself."
        >
          <Input
            name="baseline_lookback_days"
            id="baseline_lookback_days"
            type="number"
            min={30}
            max={730}
            required
            defaultValue={baselineLookbackDays}
          />
        </Field>

        <Field
          label="Working hours start"
          name="working_hours_start"
          help="Notifications wait until this time in each person's timezone, except stalled ingestion and a broken CRM."
        >
          <Input
            name="working_hours_start"
            id="working_hours_start"
            type="time"
            required
            defaultValue={workingHoursStart}
          />
        </Field>

        <Field label="Working hours end" name="working_hours_end">
          <Input
            name="working_hours_end"
            id="working_hours_end"
            type="time"
            required
            defaultValue={workingHoursEnd}
          />
        </Field>

        <fieldset>
          <legend className={labelClass}>Working days</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

        <div>
          <p className={labelClass}>CRM location id</p>
          <p className={readonlyFieldClass}>{ghlLocationId || "Not connected"}</p>
          <p className={helperClass}>
            Shown here so owners can confirm which GoHighLevel location this workspace maps to. It is
            set when the CRM is connected, and it is not editable on this page.
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

export function FollowUpOnboardingNote() {
  return (
    <Card className="max-w-xl">
      <h2 className={cardTitle}>Voice examples</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-silver">
        Follow-up drafts copy messages this business has actually sent. Paste two to five real
        examples on the Follow-up tab as part of setup — they matter more than formality sliders.
      </p>
      <div className="mt-5">
        <Button asChild variant="secondary" size="sm">
          <Link href="/app/settings/follow-up">Add voice examples</Link>
        </Button>
      </div>
    </Card>
  );
}
