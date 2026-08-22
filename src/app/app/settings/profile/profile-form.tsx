"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cardStack, errorClass, helperClass, labelClass, readonlyFieldClass } from "@/lib/ui";

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
        <Field label="Display name" name="display_name" error={error}>
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
          help="This is the address teammates see on members lists. It does not change how you sign in."
        >
          <Input name="email" id="email" type="email" required defaultValue={email} />
        </Field>

        <div>
          <p className={labelClass}>Sign-in email</p>
          <p className={readonlyFieldClass}>{signInEmail}</p>
          <p className={helperClass}>
            The account you log in with. Only you can edit this profile — an admin changing another
            member uses the Members tab.
          </p>
        </div>

        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={helperClass}>Saved.</p> : null}

        <CardFooter>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}
