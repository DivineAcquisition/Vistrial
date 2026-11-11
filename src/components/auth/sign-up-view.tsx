"use client";

import { useState } from "react";

import {
  AuthFrame,
  AuthInput,
  AuthTextButton,
  CaptchaMount,
  CodeInput,
  EmailLine,
  GoogleButton,
  OrDivider,
  PasswordInput,
  ProblemLine,
  ResendCode,
  Working,
  authLinkClass,
} from "@/components/auth/auth-parts";
import { Button } from "@/components/ui/button";
import type { SignUpDetails } from "@/lib/auth/actions";
import type { AuthProblem } from "@/lib/auth/errors";
import { CODE_LENGTH, cleanCode, looksLikeEmail, type SignUpStep } from "@/lib/auth/flow";
import { CONTACT_EMAIL } from "@/lib/constants";

export type SignUpBusy = null | "submit" | "google" | "resend";

export type SignUpViewProps = {
  step: SignUpStep;
  email: string;
  problem: AuthProblem | null;
  busy: SignUpBusy;
  ready: boolean;
  sentCount: number;
  signInHref: string;
  onEmail: (email: string) => void;
  onGoogle: () => void;
  onDetails: (details: SignUpDetails) => void;
  onCode: (code: string) => void;
  onResend: () => void;
  onStartOver: () => void;
};

const MISSING_WORDS: Record<string, string> = {
  phone_number: "a phone number",
  username: "a username",
  web3_wallet: "a crypto wallet",
  protect_check: "an extra safety check",
};

/** Every sign-up step, drawn from plain props. The Clerk calls live in sign-up.tsx. */
export function SignUpView(props: SignUpViewProps) {
  return (
    <>
      <SignUpStepView key={props.step.kind} {...props} />
      {/* Outside the keyed step so the check Clerk draws here survives moving between steps. */}
      <div className="mx-auto mt-3 w-full max-w-[26rem]">
        <CaptchaMount />
      </div>
    </>
  );
}

function shownField(step: SignUpStep): AuthProblem["field"][] {
  if (step.kind === "email") return ["email"];
  if (step.kind === "details") return ["password", "name"];
  if (step.kind === "verify") return ["code"];
  return [];
}

function SignUpStepView(props: SignUpViewProps) {
  const { step, email, problem, busy, ready, signInHref } = props;
  const [emailText, setEmailText] = useState(email);
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? problem;
  const locked = busy !== null || !ready;

  const fields = shownField(step);
  const fieldProblem = (name: AuthProblem["field"]) => (shown && shown.field === name && fields.includes(name) ? shown : null);
  const formProblem = shown && !fields.includes(shown.field) ? shown : null;

  const action = (current: AuthProblem | null): React.ReactNode => {
    if (!current?.action) return null;
    if (current.action === "sign-in") {
      return (
        <a className={authLinkClass} href={signInHref}>
          Sign in
        </a>
      );
    }
    if (current.action === "new-code") return <AuthTextButton onClick={props.onResend}>Send a new code</AuthTextButton>;
    if (current.action === "start-over") return <AuthTextButton onClick={props.onStartOver}>Start again</AuthTextButton>;
    return null;
  };

  const startOver = <AuthTextButton onClick={props.onStartOver}>Use a different email</AuthTextButton>;

  const footer = (
    <>
      Already have an account?{" "}
      <a className={authLinkClass} href={signInHref}>
        Sign in
      </a>
    </>
  );

  if (step.kind === "email") {
    return (
      <AuthFrame
        title="Create your account"
        detail="Start with Google or your email. Then a few quick questions about your business, and your first research is free."
        footer={footer}
      >
        <GoogleButton loading={busy === "google"} disabled={locked} onClick={props.onGoogle} />
        <OrDivider />
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            const value = emailText.trim();
            if (!value) return setLocal({ field: "email", message: "Enter your email address." });
            if (!looksLikeEmail(value)) return setLocal({ field: "email", message: "That does not look like an email address." });
            setLocal(null);
            props.onEmail(value);
          }}
        >
          <AuthInput
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="you@yourbusiness.com"
            hint="If you were invited, use the email the invite was sent to."
            value={emailText}
            onChange={(event) => {
              setEmailText(event.target.value);
              setLocal(null);
            }}
            problem={fieldProblem("email")}
            problemAction={action(fieldProblem("email"))}
          />
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Checking" disabled={locked}>
            Continue
          </Button>
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "details") {
    const wants = (field: (typeof step.fields)[number]) => step.fields.includes(field);
    const names = wants("first_name") || wants("last_name");
    const title = wants("password") ? "Choose a password" : names ? "Tell us your name" : "One last thing";
    return (
      <AuthFrame
        title={title}
        detail={
          email ? <EmailLine lead="For" email={email} change={startOver} /> : undefined
        }
        footer={footer}
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            if ((wants("first_name") && !firstName.trim()) || (wants("last_name") && !lastName.trim())) {
              return setLocal({ field: "name", message: "Enter your first and last name." });
            }
            if (wants("password") && password.length < 8) return setLocal({ field: "password", message: "Use at least 8 characters." });
            if (wants("legal_accepted") && !agreed) return setLocal({ field: "form", message: "Tick the box to agree to the terms before continuing." });
            setLocal(null);
            props.onDetails({ password, firstName, lastName, legalAccepted: agreed });
          }}
        >
          {email ? <input type="email" name="email" autoComplete="username" value={email} readOnly hidden /> : null}
          {names ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-3">
                {wants("first_name") ? (
                  <AuthInput label="First name" name="given-name" autoComplete="given-name" autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                ) : null}
                {wants("last_name") ? (
                  <AuthInput label="Last name" name="family-name" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                ) : null}
              </div>
              <ProblemLine problem={fieldProblem("name")} />
            </div>
          ) : null}
          {wants("password") ? (
            <PasswordInput
              label="Password"
              name="new-password"
              newPassword
              autoFocus={!names}
              hint="At least 8 characters. Longer is safer."
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setLocal(null);
              }}
              problem={fieldProblem("password")}
            />
          ) : null}
          {wants("legal_accepted") ? (
            <label className="flex items-start gap-3 text-sm leading-5 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-brand-500"
                checked={agreed}
                onChange={(event) => {
                  setAgreed(event.target.checked);
                  setLocal(null);
                }}
              />
              <span>
                I agree to the{" "}
                <a className={authLinkClass} href="/terms" target="_blank" rel="noreferrer">
                  Terms
                </a>{" "}
                and the{" "}
                <a className={authLinkClass} href="/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
          ) : null}
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Creating your account" disabled={locked}>
            Create account
          </Button>
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "verify") {
    return (
      <AuthFrame
        title="Check your email"
        detail={
          email ? <EmailLine lead="We sent a 6-digit code to" email={email} change={startOver} /> : "We sent a 6-digit code to your email address."
        }
        footer={footer}
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            if (!code) return setLocal({ field: "code", message: "Enter the code." });
            if (code.length < CODE_LENGTH) return setLocal({ field: "code", message: `The code has ${CODE_LENGTH} digits.` });
            setLocal(null);
            props.onCode(code);
          }}
        >
          <CodeInput
            label="Code"
            name="code"
            autoFocus
            value={code}
            onChange={(event) => {
              const next = cleanCode(event.target.value);
              setCode(next);
              setLocal(null);
              if (next.length === CODE_LENGTH && next !== code && !locked) props.onCode(next);
            }}
            problem={fieldProblem("code")}
            problemAction={action(fieldProblem("code"))}
          />
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Checking" disabled={locked}>
            Confirm and continue
          </Button>
          <ResendCode sentCount={props.sentCount} busy={busy === "resend"} onResend={props.onResend} />
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "blocked") {
    const needs = step.missing.map((field) => MISSING_WORDS[field] ?? "one more detail");
    return (
      <AuthFrame title="We cannot finish this here" footer={footer}>
        <p className="text-sm leading-6 text-foreground">
          {needs.length > 0
            ? `Creating this account needs ${[...new Set(needs)].join(" and ")}, which this page does not ask for yet.`
            : "Creating this account needs a step this page does not offer yet."}{" "}
          Write to us and we will set you up.
        </p>
        <ProblemLine problem={formProblem} />
        <Button variant="primary" size="lg" className="w-full" onClick={props.onStartOver}>
          Start again
        </Button>
        <p className="text-sm text-muted-foreground">
          Need a hand?{" "}
          <a className={authLinkClass} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Setting up your organization">
      <Working label="One moment." />
      <ProblemLine problem={formProblem} action={action(formProblem)} />
    </AuthFrame>
  );
}
