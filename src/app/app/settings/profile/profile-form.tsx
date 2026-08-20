"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/settings/profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Panel } from "@/components/ui/panel";
import {
  btnPrimary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

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

  return (
    <Panel className="max-w-xl px-6 py-6">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className={labelClass}>
            Display name
          </label>
          <input
            id="profile-name"
            name="display_name"
            required
            maxLength={80}
            defaultValue={displayName}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="profile-email" className={labelClass}>
            Email
          </label>
          <input
            id="profile-email"
            name="email"
            type="email"
            required
            defaultValue={email}
            className={inputClass}
          />
          <p className={helperClass}>
            This is the address teammates see on members lists. It does not
            change how you sign in.
          </p>
        </div>

        <div>
          <p className={labelClass}>Sign-in email</p>
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-silver">
            {signInEmail}
          </p>
          <p className={helperClass}>
            The account you log in with. Only you can edit this profile — an
            admin changing another member uses the Members tab.
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
