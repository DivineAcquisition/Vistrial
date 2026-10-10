"use client";

import { useActionState, useTransition } from "react";
import { useState } from "react";

import { publishUpdate, removeUpdate } from "@/app/(workspace)/app/team/updates/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

const AREAS = [
  { value: "", label: "Everywhere" },
  { value: "home", label: "Home" },
  { value: "results", label: "Results" },
  { value: "leads", label: "Leads" },
  { value: "agents", label: "Agents" },
  { value: "team", label: "Team" },
  { value: "billing", label: "Billing" },
  { value: "general", label: "General" },
];

export function PublishUpdateForm() {
  const [state, action, pending] = useActionState(publishUpdate, initial);
  useSettingsToast(state, pending, "Published. It shows on Help from the time you set.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Publish</SubmitButton>}>
      <Field label="Title" name="title" htmlFor="update-title">
        <Input id="update-title" name="title" maxLength={140} required />
      </Field>
      <Field label="What changed" name="body" htmlFor="update-body">
        <Textarea id="update-body" name="body" rows={4} maxLength={2000} required />
      </Field>
      <Field label="Area" name="area" htmlFor="update-area">
        <Select id="update-area" name="area" defaultValue="">
          {AREAS.map((area) => (
            <option key={area.value} value={area.value}>
              {area.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Show from" name="published_at" htmlFor="update-when" help="Leave blank to show it now. A future time hides it until then.">
        <Input id="update-when" name="published_at" type="datetime-local" />
      </Field>
      <p className={helperClass}>Everyone in every workspace sees this on Help. Write it as something a customer can read.</p>
    </SettingsFormCard>
  );
}

export function RemoveUpdateButton({ id }: { id: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeUpdate(id);
            setMessage(result.status === "error" ? result.error : null);
          })
        }
      >
        Remove
      </Button>
      {message ? <p className={errorClass}>{message}</p> : null}
    </div>
  );
}
