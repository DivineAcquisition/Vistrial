"use client";

import { useActionState } from "react";

import {
  changePassword,
  signOutOtherDevices,
  updateDelivery,
  updatePhoto,
} from "@/app/(workspace)/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { PersonAvatar } from "@/components/app/person-avatar";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorClass, helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function PhotoForm({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [state, action, pending] = useActionState(updatePhoto, initial);
  useSettingsToast(state, pending, "Your photo is updated.");
  return (
    <SettingsFormCard
      action={action}
      footer={
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} loadingLabel="Uploading">
            Save photo
          </SubmitButton>
          {photoUrl ? (
            <Button type="submit" name="remove" value="1" variant="ghost" disabled={pending}>
              Remove photo
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <PersonAvatar name={name} src={photoUrl} size="lg" />
        <Field label="Photo" name="photo" help="PNG, JPG, or WebP, under 2 MB. Your team sees it beside your name.">
          <Input id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
        </Field>
      </div>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}

export function DeliveryForm({ delivery }: { delivery: "instant" | "digest" }) {
  const [state, action, pending] = useActionState(updateDelivery, initial);
  useSettingsToast(state, pending);
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Save</SubmitButton>}>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-white">Emails from Vistrial about your account</legend>
        <p className={helperClass}>
          Replies from your Vistrial team, exports that are ready, and billing notices. Alerts about leads follow your
          notification settings instead.
        </p>
        <label className="flex items-start gap-2 text-sm text-white">
          <input type="radio" name="delivery" value="instant" defaultChecked={delivery === "instant"} className="mt-1" />
          <span>
            As they happen
            <span className={`block ${helperClass}`}>One email for each.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-white">
          <input type="radio" name="delivery" value="digest" defaultChecked={delivery === "digest"} className="mt-1" />
          <span>
            One email each morning
            <span className={`block ${helperClass}`}>Sent at 8am in your time zone, listing what came in.</span>
          </span>
        </label>
      </fieldset>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  useSettingsToast(state, pending, "Your password is changed.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Change password</SubmitButton>}>
      <Field label="New password" name="password" help="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Type it again" name="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}

export function SignOutOthersForm() {
  const [state, action, pending] = useActionState(signOutOtherDevices, initial);
  useSettingsToast(state, pending, "Every other device is signed out.");
  return (
    <SettingsFormCard
      action={action}
      footer={
        <SubmitButton pending={pending} variant="secondary" loadingLabel="Signing out">
          Sign out other devices
        </SubmitButton>
      }
    >
      <p className={helperClass}>
        Signs you out everywhere except this browser. Use it if you lost a phone or signed in on a shared computer.
      </p>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}
