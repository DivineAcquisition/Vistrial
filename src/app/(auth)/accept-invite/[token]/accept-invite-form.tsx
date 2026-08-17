"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createAccountFromInvite,
  markPendingInvite,
  type AcceptInviteState,
} from "@/app/(auth)/accept-invite/[token]/actions";
import { authCallbackUrl } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/client";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const initialState: AcceptInviteState = { error: null };

export function AcceptInviteForm({
  token,
  email,
  role,
}: {
  token: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "create" | "magic">("signin");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createAccountFromInvite,
    initialState
  );

  async function onSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createClient();

    try {
      await markPendingInvite(token);

      if (mode === "magic") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: authCallbackUrl(`/accept-invite/${token}`),
            shouldCreateUser: false,
          },
        });
        if (otpError) {
          setError(otpError.message);
          return;
        }
        setMagicSent(true);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace(`/accept-invite/${token}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (magicSent) {
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
        {(createState.error || error) && (
          <p className={errorClass}>{createState.error ?? error}</p>
        )}
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

  return (
    <form onSubmit={onSignIn} className="space-y-4">
      {error ? <p className={errorClass}>{error}</p> : null}
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        onClick={() => {
          setMode((current) => (current === "magic" ? "signin" : "magic"));
          setError(null);
        }}
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
