"use client";

import { useActionState } from "react";

import { updateOrganization } from "@/app/app/settings/organization/actions";
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
import { errorClass } from "@/lib/ui";

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
  useSettingsToast(state, pending);
  const timezoneOptions = isOrgTimezone(timezone)
    ? ORG_TIMEZONES
    : ([timezone, ...ORG_TIMEZONES] as const);
  const error = state.status === "error" ? state.error : null;
  const policy = surface === "policy";

  return (
    <SettingsFormCard
      action={action}
      footer={<SubmitButton pending={pending}>Save</SubmitButton>}
    >
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
              placeholder="60"
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
              placeholder="365"
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
              placeholder="365"
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
              placeholder="48"
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
                placeholder="10"
              />
            </Field>
          ) : (
            <input type="hidden" name="operator_agent_batch_cap" value={operatorAgentBatchCap} />
          )}
        </>
      ) : (
        <>
          <Field label="Name" name="name" error={error}>
            <Input
              name="name"
              id="name"
              type="text"
              required
              maxLength={120}
              defaultValue={name}
              placeholder="Studio name"
            />
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

          <WorkingHoursFields
            start={workingHoursStart}
            end={workingHoursEnd}
            required
            help="Notifications wait until this time in each person's timezone, except stalled ingestion and a broken CRM."
          />

          <Fieldset className="flex min-w-0 flex-col gap-2">
            <FieldsetLegend>Working days</FieldsetLegend>
            <WeekdayToggleRow selected={workingDays} />
          </Fieldset>

          <Field
            label="CRM location"
            name="ghl_location"
            help="Set when LeadConnector is connected. Change the connection under Advanced → Integrations."
          >
            <Input
              id="ghl_location"
              type="text"
              readOnly
              value={ghlLocationId || "Not connected"}
              tabIndex={-1}
            />
          </Field>
        </>
      )}

      {error ? <p className={errorClass}>{error}</p> : null}
    </SettingsFormCard>
  );
}
