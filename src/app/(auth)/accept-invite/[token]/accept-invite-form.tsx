"use client";

import { useActionState, useState } from "react";

import {
  createAccountFromInvite,
  type AcceptInviteState,
} from "@/app/(auth)/accept-invite/[token]/actions";
import { sendMagicLink, signInPassword } from "@/app/(auth)/login/actions";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const initialCreateState: AcceptInviteState = { error: null };
const initialLoginState = { error: null as null, magicSent: false };

export function AcceptInviteForm({
  token,
  email,
  role,
}: {
  token: string;
  email: string;
  role: string;
}) {
  const [mode, setMode] = useState<"signin" | "create" | "magic">("signin");
  const [password, setPassword] = useState("");
  const [createState, createAction, createPending] = useActionState(
    createAccountFromInvite,
    initialCreateState
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInPassword,
    initialLoginState
  );
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initialLoginState);

  const redirectTo = `/accept-invite/${token}`;
  const signInError = mode === "magic" ? magicState.error : passwordState.error;

  if (mode === "magic" && magicState.magicSent) {
    return (
      <p className="text-sm leading-relaxed text-silver">
        Check {email} for a sign-in link. After you open it, you will join as {role}.
      </p>
    );
  }

  if (mode === "create") {
    return (
      <form action={createAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <p className={helperClass}>
          Public sign-up is closed. Creating an account here is allowed only because this invite is valid.
        </p>
        {createState.error ? <p className={errorClass}>{createState.error}</p> : null}
        <div>
          <label className={labelClass}>Email</label>
          <input className={inputClass} value={email} readOnly />
        </div>
        <div>
          <label htmlFor="new-password" className={labelClass}>
            Password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={createPending} className={`${btnPrimary} ${btnSizeMd} w-full`}>
          {createPending ? "Creating…" : "Create account and join"}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-brand-300 hover:text-white"
          onClick={() => setMode("signin")}
        >
          I already have an account
        </button>
      </form>
    );
  }

  const pending = mode === "magic" ? magicPending : passwordPending;
  const action = mode === "magic" ? magicAction : passwordAction;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {signInError ? <p className={errorClass}>{LOGIN_ERROR_COPY[signInError]}</p> : null}
      <div>
        <label className={labelClass}>Email</label>
        <input className={inputClass} value={email} readOnly />
      </div>
      {mode === "signin" ? (
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>
      ) : (
        <p className={helperClass}>We will email a one-time link to {email}.</p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} ${btnSizeMd} w-full`}>
        {pending ? "Working…" : mode === "magic" ? "Send magic link" : "Sign in and join"}
      </button>
      <button
        type="button"
        className={`${btnSecondary} ${btnSizeMd} w-full`}
        onClick={() => setMode((current) => (current === "magic" ? "signin" : "magic"))}
      >
        {mode === "magic" ? "Use a password instead" : "Send me a magic link instead"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-brand-300 hover:text-white"
        onClick={() => setMode("create")}
      >
        Create an account
      </button>
    </form>
  );
}
