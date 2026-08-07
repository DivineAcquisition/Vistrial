"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { signInAction, type SignInState } from "@/lib/actions/auth";
import { btnPrimary, btnSizeMd, inputClass, labelClass } from "@/lib/ui";

const initialState: SignInState = { error: null };

export function LoginForm({
  next,
  lockedMessage,
}: {
  next?: string;
  lockedMessage?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState
  );

  const error = state.error ?? lockedMessage ?? null;

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="password">
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

      {error ? (
        <p role="alert" className="text-sm text-flag-critical">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeMd} w-full`}
      >
        {pending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Signing in
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <p className="text-center text-xs text-dim">
        <Link
          href="/login/reset"
          className="text-brand-300 transition-colors hover:text-brand-200"
        >
          Reset password
        </Link>
      </p>
    </form>
  );
}
