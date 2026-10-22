"use client";

import { useActionState, useState } from "react";

import { requestData } from "@/app/(workspace)/app/settings/privacy/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function DataRequestForm({ openKinds }: { openKinds: string[] }) {
  const [state, action, pending] = useActionState(requestData, initial);
  const [kind, setKind] = useState<"export" | "deletion">(openKinds.includes("export") ? "deletion" : "export");
  useSettingsToast(state, pending, "Your Vistrial team has the request and will reply by email.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Send request</SubmitButton>}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-strong">What do you need?</legend>
        <label className="flex items-start gap-2 text-sm text-strong">
          <input
            type="radio"
            name="kind"
            value="export"
            checked={kind === "export"}
            onChange={() => setKind("export")}
            disabled={openKinds.includes("export")}
            className="mt-1"
          />
          <span>
            A full copy of this workspace&apos;s data
            <span className={`block ${helperClass}`}>
              {openKinds.includes("export") ? "Already requested." : "Your team prepares it and sends you a secure link."}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-strong">
          <input
            type="radio"
            name="kind"
            value="deletion"
            checked={kind === "deletion"}
            onChange={() => setKind("deletion")}
            disabled={openKinds.includes("deletion")}
            className="mt-1"
          />
          <span>
            Delete this workspace&apos;s data
            <span className={`block ${helperClass}`}>
              {openKinds.includes("deletion")
                ? "Already requested."
                : "Your team confirms with you before anything is deleted. Your CRM is not touched."}
            </span>
          </span>
        </label>
      </fieldset>
      {kind === "deletion" ? (
        <label className="flex items-start gap-2 text-sm text-strong">
          <input type="checkbox" name="confirm" value="yes" className="mt-1" required />
          <span>
            I understand that once deleted, case files, results, and history in Vistrial cannot be brought back.
          </span>
        </label>
      ) : null}
      <Field label="Anything your team should know" name="note">
        <Textarea id="note" name="note" maxLength={2000} rows={3} />
      </Field>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}
