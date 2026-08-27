"use client";

import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import {
  sendMagicLink,
  signInPassword,
  type LoginActionState,
} from "@/app/(auth)/login/actions";
import { AuthField, AuthOrDivider } from "@/components/auth/auth-fields";
import { LOGIN_ERROR_COPY, type LoginError } from "@/lib/auth/errors";
import { Button, SubmitButton } from "@/components/ui/button";
import { errorClass } from "@/lib/ui";

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
      <p className="auth-notice">
        Check {email || "that address"} for a sign-in link. It expires quickly; request
        another if it does not arrive.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {error ? <p className={errorClass}>{LOGIN_ERROR_COPY[error]}</p> : null}

      <AuthField
        icon={Mail}
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="name@company.com"
        label="Email"
        aria-label="Email"
      />

      {mode === "password" ? (
        <AuthField
          icon={Lock}
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="Enter your password"
          label="Password"
          aria-label="Password"
          action={
            <button
              type="button"
              className="auth-field-action"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />
      ) : null}

      <SubmitButton
        pending={pending}
        variant="gradient"
        size="lg"
        loadingLabel="Working"
        className="auth-submit mt-2 w-full"
      >
        Continue
      </SubmitButton>

      <AuthOrDivider />

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="auth-alt w-full"
        onClick={() => {
          setMode((current) => (current === "password" ? "magic" : "password"));
          setShowPassword(false);
        }}
      >
        {mode === "password" ? "Continue with a magic link" : "Continue with a password"}
      </Button>
    </form>
  );
}
