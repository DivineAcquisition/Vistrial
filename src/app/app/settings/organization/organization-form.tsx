"use client";

import { useActionState } from "react";

import { updateOrganization } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES, isOrgTimezone } from "@/lib/timezones";
import {
  btnPrimary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function OrganizationForm({
  name,
  timezone,
  ghlLocationId,
}: {
  name: string;
  timezone: string;
  ghlLocationId: string | null;
}) {
  const [state, action, pending] = useActionState(updateOrganization, initial);
  const timezoneOptions = isOrgTimezone(timezone)
    ? ORG_TIMEZONES
    : ([timezone, ...ORG_TIMEZONES] as const);

  return (
    <Panel className="max-w-xl px-6 py-6">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="org-name" className={labelClass}>
            Name
          </label>
          <input
            id="org-name"
            name="name"
            required
            maxLength={120}
            defaultValue={name}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="org-timezone" className={labelClass}>
            Timezone
          </label>
          <select
            id="org-timezone"
            name="timezone"
            required
            defaultValue={timezone}
            className={selectClass}
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {isOrgTimezone(zone) ? ORG_TIMEZONE_LABELS[zone] : zone}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className={labelClass}>CRM location id</p>
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-silver">
            {ghlLocationId || "Not connected"}
          </p>
          <p className={helperClass}>
            Shown here so owners can confirm which GoHighLevel location this
            workspace maps to. It is set when the CRM is connected, and it is
            not editable on this page.
          </p>
        </div>

        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
        {state.status === "saved" ? <p className={helperClass}>Saved.</p> : null}

        <button type="submit" disabled={pending} className={`${btnPrimary} ${btnSizeMd}`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </Panel>
  );
}
