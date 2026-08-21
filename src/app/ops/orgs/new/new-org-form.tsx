"use client";

import { useActionState } from "react";

import { createClientOrg, type CreateOrgResult } from "@/app/ops/actions";
import { Panel } from "@/components/ui/panel";
import { ORG_TIMEZONE_LABELS, ORG_TIMEZONES } from "@/lib/timezones";
import {
  btnPrimary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

const idle: CreateOrgResult = { status: "idle" };

export function NewOrgForm() {
  const [state, action, pending] = useActionState(createClientOrg, idle);

  return (
    <Panel className="max-w-xl px-6 py-6">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="ops-org-name" className={labelClass}>
            Name
          </label>
          <input id="ops-org-name" name="name" required maxLength={120} className={inputClass} />
        </div>
        <div>
          <label htmlFor="ops-org-timezone" className={labelClass}>
            Timezone
          </label>
          <select id="ops-org-timezone" name="timezone" required defaultValue="America/New_York" className={selectClass}>
            {ORG_TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {ORG_TIMEZONE_LABELS[zone]}
              </option>
            ))}
          </select>
          <p className={helperClass}>Set first. Every downstream threshold evaluates against it.</p>
        </div>
        <div>
          <label htmlFor="ops-org-slug" className={labelClass}>
            Slug
          </label>
          <input id="ops-org-slug" name="slug" className={inputClass} placeholder="optional" />
        </div>
        <div>
          <label htmlFor="ops-org-owner" className={labelClass}>
            Owner email
          </label>
          <input id="ops-org-owner" name="owner_email" type="email" className={inputClass} />
          <p className={helperClass}>Creates an owner invite. Share the link by hand until email delivery is wired.</p>
        </div>
        <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </button>
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      </form>
    </Panel>
  );
}
