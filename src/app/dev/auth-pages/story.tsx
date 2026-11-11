"use client";

import { AuthFrame, Working } from "@/components/auth/auth-parts";
import { SignInView } from "@/components/auth/sign-in-view";
import { SignUpView } from "@/components/auth/sign-up-view";
import { explainAuthError, type AuthProblem } from "@/lib/auth/errors";
import type { SignInStep, SignUpStep } from "@/lib/auth/flow";

import { StoryTheme } from "../story-theme";

const EMAIL = "jaylen@brookscleaning.com";

const SIGN_IN: Record<string, SignInStep> = {
  email: { kind: "email" },
  password: { kind: "password", canUseCode: true, canReset: true },
  code: { kind: "code", canUsePassword: true },
  "reset-code": { kind: "reset-code" },
  "new-password": { kind: "new-password" },
  "second-app": { kind: "second", method: "totp", methods: ["totp", "phone_code", "backup_code"], sentTo: null, newDevice: false },
  "second-text": { kind: "second", method: "phone_code", methods: ["totp", "phone_code", "backup_code"], sentTo: "+1 *** *** 0142", newDevice: false },
  "second-backup": { kind: "second", method: "backup_code", methods: ["totp", "backup_code"], sentTo: null, newDevice: false },
  "new-device": { kind: "second", method: "email_code", methods: ["email_code"], sentTo: "j*****@brookscleaning.com", newDevice: true },
  "google-only": { kind: "blocked", reason: "google-only" },
  done: { kind: "done" },
};

const SIGN_UP: Record<string, SignUpStep> = {
  email: { kind: "email" },
  password: { kind: "details", fields: ["password"] },
  details: { kind: "details", fields: ["password", "first_name", "last_name", "legal_accepted"] },
  verify: { kind: "verify" },
  blocked: { kind: "blocked", missing: ["phone_number"] },
  done: { kind: "done" },
};

/** Clerk's own codes, run through the same wording the live pages use. */
const PROBLEMS: Record<string, { code: string; field: AuthProblem["field"]; meta?: Record<string, unknown> }> = {
  "wrong-code": { code: "form_code_incorrect", field: "code" },
  "expired-code": { code: "verification_expired", field: "code" },
  "too-many": { code: "too_many_requests", field: "code" },
  "too-many-wrong": { code: "verification_failed", field: "code" },
  "not-found": { code: "form_identifier_not_found", field: "email" },
  "email-used": { code: "form_identifier_exists", field: "email" },
  "google-cancelled": { code: "oauth_access_denied", field: "form" },
  "wrong-password": { code: "form_password_incorrect", field: "password" },
  "weak-password": { code: "form_password_pwned", field: "password" },
  locked: { code: "user_locked", field: "password", meta: { lockoutExpiresInSeconds: 1800 } },
};

const nothing = () => undefined;

export function AuthPagesStory({ screen, step, problem, theme }: { screen: string; step: string; problem: string; theme: string }) {
  const signUp = screen === "sign-up";
  const found = PROBLEMS[problem];
  const shown = found
    ? explainAuthError({ errors: [{ code: found.code, meta: found.meta ?? {} }] }, { flow: signUp ? "sign-up" : "sign-in", field: found.field })
    : null;

  if (!step) {
    return (
      <main className="mx-auto grid max-w-2xl gap-6 p-8 text-sm">
        <StoryTheme theme={theme} />
        <h1 className="font-heading text-xl">Auth pages</h1>
        {(
          [
            ["sign-in", SIGN_IN],
            ["sign-up", SIGN_UP],
          ] as const
        ).map(([name, steps]) => (
          <section key={name} className="grid gap-1">
            <h2 className="font-medium">{name}</h2>
            {Object.keys(steps).map((key) => (
              <a key={key} className="underline" href={`?screen=${name}&step=${key}`}>
                {key}
              </a>
            ))}
          </section>
        ))}
        <p className="text-muted-foreground">Add &problem={Object.keys(PROBLEMS).join(" | ")} and &theme=dark.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <StoryTheme theme={theme} />
      <div className="w-full">
        {screen === "callback" ? (
          <AuthFrame title="Finishing sign-in">
            <Working label="One moment." />
          </AuthFrame>
        ) : signUp ? (
          <SignUpView
            step={SIGN_UP[step] ?? SIGN_UP.email}
            email={step === "email" && !problem ? "" : EMAIL}
            problem={shown}
            busy={null}
            ready
            sentCount={0}
            signInHref="?screen=sign-in&step=email"
            onEmail={nothing}
            onGoogle={nothing}
            onDetails={nothing}
            onCode={nothing}
            onResend={nothing}
            onStartOver={nothing}
          />
        ) : (
          <SignInView
            step={SIGN_IN[step] ?? SIGN_IN.email}
            email={step === "email" && !problem ? "" : EMAIL}
            problem={shown}
            busy={null}
            ready
            sentCount={0}
            signUpHref="?screen=sign-up&step=email"
            onEmail={nothing}
            onGoogle={nothing}
            onPassword={nothing}
            onCode={nothing}
            onResend={nothing}
            onUseCode={nothing}
            onUsePassword={nothing}
            onForgot={nothing}
            onNewPassword={nothing}
            onSecondMethod={nothing}
            onStartOver={nothing}
          />
        )}
      </div>
    </main>
  );
}
