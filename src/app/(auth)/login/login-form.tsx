"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authCallbackUrl } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/client";
import { btnPrimary, btnSizeMd, errorClass, helperClass, inputClass, labelClass } from "@/lib/ui";

type Mode = "password" | "magic";
type LoginError = "credentials" | "unconfirmed" | "no_membership" | "generic" | null;

function classifyAuthError(message: string, code?: string): Exclude<LoginError, "no_membership" | null> {
  const haystack = `${code ?? ""} ${message}`.toLowerCase();
  if (haystack.includes("email_not_confirmed") || haystack.includes("email not confirmed")) {
    return "unconfirmed";
  }
  if (
    haystack.includes("invalid_credentials") ||
    haystack.includes("invalid login credentials") ||
    haystack.includes("invalid email or password")
  ) {
    return "credentials";
  }
  return "generic";
}

const ERROR_COPY: Record<Exclude<LoginError, null>, string> = {
  credentials: "That email or password is not right.",
  unconfirmed: "Confirm your email before signing in. Check the inbox for that address.",
  no_membership: "This account is not a member of any workspace. You need an invite.",
  generic: "Sign-in failed. Try again, or use a magic link.",
};

export function LoginForm({
  redirectTo,
  callbackError,
}: {
  redirectTo: string;
  callbackError?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginError>(callbackError ? "generic" : null);
  const [magicSent, setMagicSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: authCallbackUrl(redirectTo),
            shouldCreateUser: false,
          },
        });

        if (otpError) {
          setError(classifyAuthError(otpError.message, otpError.code));
          return;
        }

        setMagicSent(true);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(classifyAuthError(signInError.message, signInError.code));
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("generic");
        return;
      }

      const { data: memberships } = await supabase
        .from("org_members")
        .select("id")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(1);

      if (!memberships?.length) {
        setError("no_membership");
        return;
      }

      router.replace(redirectTo.startsWith("/app") ? redirectTo : "/app");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (magicSent) {
    return (
      <p className="text-sm leading-relaxed text-silver">
        Check {email || "your inbox"} for a sign-in link. It expires quickly; request another if it does not arrive.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <p className={errorClass}>{ERROR_COPY[error]}</p> : null}

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
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        onClick={() => {
          setMode((current) => (current === "password" ? "magic" : "password"));
          setError(null);
          setMagicSent(false);
        }}
      >
        {mode === "password" ? "Send me a magic link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
