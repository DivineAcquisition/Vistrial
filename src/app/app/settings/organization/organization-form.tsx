"use client";

import { useActionState } from "react";

import { updateOrganization } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
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
  transcriptRetentionDays,
  callCoachingEmbargoHours,
  operatorAgentBatchCap,
  showOperatorAgentBatchCap = false,
  surface = "workspace",
}: {
  name: string;
  timezone: string;
  ghlLocationId: string | null;
  salesCycleDays: number;
  baselineLookbackDays: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
  transcriptRetentionDays: number;
  callCoachingEmbargoHours: number;
  operatorAgentBatchCap: number;
  showOperatorAgentBatchCap?: boolean;
  surface?: "workspace" | "policy";
}) {
  const [state, action, pending] = useActionState(updateOrganization, initial);
  const timezoneOptions = isOrgTimezone(timezone)
    ? ORG_TIMEZONES
    : ([timezone, ...ORG_TIMEZONES] as const);
  const error = state.status === "error" ? state.error : null;
  const policy = surface === "policy";

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <input type="hidden" name="surface" value={policy ? "policy" : "workspace"} />

        {policy ? (
          <>
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
              label="Transcript retention (days)"
              name="transcript_retention_days"
              help="Raw transcript text is cleared after this many days. Extractions and objections stay. Default 365. Range 30–1095."
            >
              <Input
                name="transcript_retention_days"
                id="transcript_retention_days"
                type="number"
                min={30}
                max={1095}
                defaultValue={transcriptRetentionDays}
              />
            </Field>

            <Field
              label="Coaching delay (hours)"
              name="call_coaching_embargo_hours"
              help="A rep sees their own call analysis immediately. Owner and admin see it after this many hours. Default 48. Range 0–168. 0 means they see it immediately — the cost is that the rep does not get a private window first."
            >
              <Input
                name="call_coaching_embargo_hours"
                id="call_coaching_embargo_hours"
                type="number"
                min={0}
                max={168}
                required
                defaultValue={callCoachingEmbargoHours}
              />
            </Field>

            {showOperatorAgentBatchCap ? (
              <Field
                label="Operator-agent batch cap"
                name="operator_agent_batch_cap"
                help="A confirmed agent write may touch this many records. Above it, the agent must narrow or split. Nothing is truncated. Default 10. Range 1–40."
              >
                <Input
                  name="operator_agent_batch_cap"
                  id="operator_agent_batch_cap"
                  type="number"
                  min={1}
                  max={40}
                  required
                  defaultValue={operatorAgentBatchCap}
                />
              </Field>
            ) : (
              <input type="hidden" name="operator_agent_batch_cap" value={operatorAgentBatchCap} />
            )}
          </>
        ) : (
          <>
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
              <p className={labelClass}>CRM location</p>
              <p className={readonlyFieldClass}>{ghlLocationId || "Not connected"}</p>
              <p className={helperClass}>
                Set when GoHighLevel is connected. Change the connection under Advanced →
                Integrations.
              </p>
            </div>
          </>
        )}

        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}

        <CardFooter>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
