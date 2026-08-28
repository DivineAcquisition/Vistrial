"use client";

import { useActionState } from "react";

import { savePortalSchedule } from "@/app/portal/source-actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { errorClass, helperClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function PortalScheduleForm({
  cadence,
  enabled,
  lastSentAt,
  lastError,
}: {
  cadence: "weekly" | "monthly";
  enabled: boolean;
  lastSentAt: string | null;
  lastError: string | null;
}) {
  const [state, action, pending] = useActionState(savePortalSchedule, idle);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email cadence" name="cadence" htmlFor="portal-cadence">
        <Select id="portal-cadence" name="cadence" defaultValue={cadence}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </Select>
      </Field>
      <CheckboxField name="enabled" value="1" defaultChecked={enabled} label="Send on this cadence" />
      <SubmitButton variant="secondary" size="sm" pending={pending} loadingLabel="Saving">
        Save schedule
      </SubmitButton>
      <p className={helperClass}>
        Defaults to monthly. An owner who has to remember to log in will not. The email is stamped
        with the range, generation time, and workspace.
      </p>
      {lastSentAt ? <p className={helperClass}>Last sent {lastSentAt}.</p> : null}
      {lastError ? <p className={errorClass}>{lastError}</p> : null}
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      {state.status === "saved" ? <p className="text-sm text-flag-good">Schedule saved.</p> : null}
    </form>
  );
}
