"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cardStack, errorClass, helperClass, readonlyFieldClass, labelClass, successClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function ProfileForm({
  displayName,
  email,
  signInEmail,
}: {
  displayName: string;
  email: string;
  signInEmail: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const error = state.status === "error" ? state.error : null;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <Field label="Display name" name="display_name" error={error} help="The name teammates see.">
          <Input
            name="display_name"
            id="display_name"
            required
            maxLength={80}
            defaultValue={displayName}
          />
        </Field>

        <Field
          label="Email"
          name="email"
          help="This is the address teammates see. It does not change how you sign in."
        >
          <Input name="email" id="email" type="email" required defaultValue={email} />
        </Field>

        <div>
          <p className={labelClass}>Sign-in email</p>
          <p className={readonlyFieldClass}>{signInEmail}</p>
        </div>

        <Field
          label="New password"
          name="password"
          help="Leave blank to keep the current password. At least 8 characters."
        >
          <Input name="password" id="password" type="password" minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" name="password_confirm">
          <Input
            name="password_confirm"
            id="password_confirm"
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </Field>

        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}

        <CardFooter>
          <SubmitButton pending={pending}>Save profile</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
