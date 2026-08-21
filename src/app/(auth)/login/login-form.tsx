"use client";

import { useActionState, useState } from "react";

import {
  sendMagicLink,
  signInPassword,
  type LoginActionState,
} from "@/app/(auth)/login/actions";
import { LOGIN_ERROR_COPY, type LoginError } from "@/lib/auth/errors";
import { btnPrimary, btnSizeMd, errorClass, helperClass, inputClass, labelClass } from "@/lib/ui";

type Mode = "password" | "magic";

const initialState: LoginActionState = { error: null };

export function LoginForm({
  redirectTo,
  callbackError,
}: {
  redirectTo: string;
  callbackError?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInPassword,
    callbackError ? { error: "generic" as LoginError } : initialState
  );
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initialState);

  const pending = mode === "password" ? passwordPending : magicPending;
  const error = mode === "password" ? passwordState.error : magicState.error;
  const action = mode === "password" ? passwordAction : magicAction;

  if (mode === "magic" && magicState.magicSent) {
    return (
      <p className="text-sm leading-relaxed text-silver">
        Check {email || "that address"} for a sign-in link. It expires quickly; request another if it does not arrive.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {error ? <p className={errorClass}>{LOGIN_ERROR_COPY[error]}</p> : null}

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
      </div>

      {mode === "password" ? (
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
        <p className={helperClass}>We will email a one-time sign-in link. No password needed.</p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimary} ${btnSizeMd} w-full`}>
        {pending ? "Working…" : mode === "password" ? "Sign in" : "Send magic link"}
      </button>

      <button
        type="button"
        className="w-full text-center text-sm text-brand-300 hover:text-white"
        onClick={() => setMode((current) => (current === "password" ? "magic" : "password"))}
      >
        {mode === "password" ? "Send me a magic link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
