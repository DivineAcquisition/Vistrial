"use client";

import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createAccountFromInvite,
  type AcceptInviteState,
} from "@/app/(auth)/accept-invite/[token]/actions";
import { sendMagicLink, signInPassword } from "@/app/(auth)/login/actions";
import { AuthField, AuthOrDivider } from "@/components/auth/auth-fields";
import { LOGIN_ERROR_COPY } from "@/lib/auth/errors";
import { Button, SubmitButton } from "@/components/ui/button";
import { errorClass, helperClass } from "@/lib/ui";

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
  const [showPassword, setShowPassword] = useState(false);
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
      <p className="auth-notice">
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
        <AuthField icon={Mail} id="invite-email" value={email} readOnly label="Email" aria-label="Email" placeholder="name@company.com" />
        <AuthField
          icon={Lock}
          id="new-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          placeholder="Create a password"
          label="Password"
          aria-label="Password"
          onChange={(event) => setPassword(event.target.value)}
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
        <SubmitButton
          pending={createPending}
          variant="gradient"
          loadingLabel="Creating"
          className="auth-submit mt-2 w-full"
        >
          Continue
        </SubmitButton>
        <button
          type="button"
          className="w-full pt-1 text-center text-[13px] text-white/40 underline-offset-4 hover:text-white/70 hover:underline"
          onClick={() => {
            setMode("signin");
            setShowPassword(false);
          }}
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
      <AuthField icon={Mail} id="invite-signin-email" value={email} readOnly label="Email" aria-label="Email" placeholder="name@company.com" />
      {mode === "signin" ? (
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
          setMode((current) => (current === "magic" ? "signin" : "magic"));
          setShowPassword(false);
        }}
      >
        {mode === "magic" ? "Continue with a password" : "Continue with a magic link"}
      </Button>
      <button
        type="button"
        className="w-full pt-1 text-center text-[13px] text-white/40 underline-offset-4 hover:text-white/70 hover:underline"
        onClick={() => {
          setMode("create");
          setShowPassword(false);
        }}
      >
        Create an account
      </button>
    </form>
  );
}
