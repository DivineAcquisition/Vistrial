"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setOwnerHours, type ConfigActionResult } from "@/app/(workspace)/app/settings/configuration/actions";
import { ValueInput } from "@/components/config/value-input";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { describeValue } from "@/lib/config/format";
import { FIELD_BY_KEY } from "@/lib/config/registry";
import type { ConfigValue } from "@/lib/config/types";
import { bodyText, errorClass, helperClass, sectionTitle } from "@/lib/ui";

/** Business hours for the owner: editable only when the Vistrial team allows it. */
export function OwnerHoursForm(props: {
  orgId: string;
  hours: ConfigValue;
  timezone: string;
  canEdit: boolean;
  version: number;
}) {
  const field = FIELD_BY_KEY["identity.business_hours"];
  const router = useRouter();
  const [draft, setDraft] = useState<ConfigValue>(props.hours);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className={sectionTitle}>Business hours</h2>
      <p className={bodyText}>
        When you are open ({props.timezone}). Vistrial uses these for response times and when to alert your team.
      </p>
      {editing ? (
        <div className="mt-3 space-y-3">
          <ValueInput field={field} value={draft} onChange={setDraft} disabled={pending} />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const outcome = await setOwnerHours(props.orgId, draft, props.version);
                  setResult(outcome);
                  if (outcome.ok) {
                    setEditing(false);
                    router.refresh();
                  }
                })
              }
            >
              Save hours
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-card-foreground">{describeValue(field, props.hours)}</p>
          {props.canEdit ? (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
              Change hours
            </Button>
          ) : (
            <p className={helperClass}>Your Vistrial team manages these. Ask them if they need to change.</p>
          )}
        </>
      )}
      {result && !result.ok ? <p className={errorClass}>{result.error}</p> : null}
      {result && result.ok && result.message ? <p className={helperClass}>{result.message}</p> : null}
    </Panel>
  );
}
