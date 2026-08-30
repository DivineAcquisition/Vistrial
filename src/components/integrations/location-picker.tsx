"use client";

import { useActionState } from "react";

import { selectGhlLocation } from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { cardTitle, errorClass, helperClass, labelClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

/** Shown only mid-connect, when an agency grant returned more than one location. */
export function LocationPicker({ locations }: { locations: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(selectGhlLocation, idle);

  return (
    <Panel className="p-6">
      <h2 className={cardTitle}>Choose a location</h2>
      <p className={helperClass}>Link exactly one location to this workspace.</p>
      <form action={action} className="mt-4 space-y-4">
        <div>
          <label className={labelClass} htmlFor="location_id">
            Location
          </label>
          <Select id="location_id" name="location_id" required defaultValue="">
            <option value="" disabled>
              Select a location
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton variant="gradient" pending={pending} loadingLabel="Linking">
          Link location
        </SubmitButton>
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      </form>
    </Panel>
  );
}
