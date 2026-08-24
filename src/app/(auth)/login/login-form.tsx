"use client";

import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import {
  sendMagicLink,
  signInPassword,
  type LoginActionState,
} from "@/app/(auth)/login/actions";
import { LOGIN_ERROR_COPY, type LoginError } from "@/lib/auth/errors";
import { SubmitButton } from "@/components/ui/button";
import { errorClass, helperClass, inputClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Mode = "password" | "magic";

const initialState: LoginActionState = { error: null };

const authInputClass = cn(inputClass, "min-h-11 rounded-lg py-2.5 pl-11 text-[14px] font-normal");

export function LoginForm({
  redirectTo,
  callbackError,
}: {
  redirectTo: string;
  callbackError?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <p className="text-sm leading-relaxed text-white/55">
        Check {email || "that address"} for a sign-in link. It expires quickly; request
        another if it does not arrive.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3.5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {error ? <p className={errorClass}>{LOGIN_ERROR_COPY[error]}</p> : null}

      <div className="auth-field">
        <Mail className="auth-field-icon" aria-hidden />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your.email@example.com"
          className={authInputClass}
        />
      </div>

      {mode === "password" ? (
        <div className="auth-field">
          <Lock className="auth-field-icon" aria-hidden />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className={cn(authInputClass, "pr-11")}
          />
          <button
            type="button"
            className="auth-field-action"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      ) : (
        <p className={helperClass}>We will email a one-time sign-in link. No password needed.</p>
      )}

      <SubmitButton
        pending={pending}
        variant="primary"
        size="lg"
        loadingLabel="Working"
        className="mt-2 w-full rounded-lg"
      >
        Continue
      </SubmitButton>

      <button
        type="button"
        className="w-full pt-1 text-center text-[13px] text-white/40 underline-offset-4 hover:text-white/70 hover:underline"
        onClick={() => {
          setMode((current) => (current === "password" ? "magic" : "password"));
          setShowPassword(false);
        }}
      >
        {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
      </button>
    </form>
  );
}
