"use client";

import { useActionState } from "react";

import { updateContactDetails } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

/** Who the Vistrial team contacts about this business. */
export function ContactDetailsForm({
  name,
  email,
  phone,
}: {
  name: string | null;
  email: string | null;
  phone: string | null;
}) {
  const [state, action, pending] = useActionState(updateContactDetails, initial);
  useSettingsToast(state, pending, "Contact details saved.");

  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Save</SubmitButton>}>
      <Field label="Contact name" name="owner_contact_name">
        <Input id="owner_contact_name" name="owner_contact_name" defaultValue={name ?? ""} autoComplete="name" />
      </Field>
      <Field label="Contact email" name="owner_contact_email">
        <Input
          id="owner_contact_email"
          name="owner_contact_email"
          type="email"
          defaultValue={email ?? ""}
          autoComplete="email"
        />
      </Field>
      <Field label="Contact phone" name="owner_contact_phone">
        <Input id="owner_contact_phone" name="owner_contact_phone" type="tel" defaultValue={phone ?? ""} autoComplete="tel" />
      </Field>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}
