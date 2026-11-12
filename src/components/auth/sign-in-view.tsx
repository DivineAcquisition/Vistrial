"use client";

import { useState } from "react";

import {
  AuthFrame,
  AuthInput,
  AuthTextButton,
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
import type { AuthProblem } from "@/lib/auth/errors";
import { BLOCKED_WORDS, CODE_LENGTH, cleanBackupCode, cleanCode, looksLikeEmail, type SecondMethod, type SignInStep } from "@/lib/auth/flow";
import { CONTACT_EMAIL } from "@/lib/constants";

export type SignInBusy = null | "submit" | "google" | "resend" | "switch";

export type SignInViewProps = {
  step: SignInStep;
  /** The email the attempt is for, shown back on the later steps. */
  email: string;
  problem: AuthProblem | null;
  busy: SignInBusy;
  /** False until Clerk has loaded. The form shows straight away; its buttons wait. */
  ready: boolean;
  /** Goes up each time a code is sent, to restart the wait before the next one. */
  sentCount: number;
  signUpHref: string;
  onEmail: (email: string) => void;
  onGoogle: () => void;
  onPassword: (password: string) => void;
  onCode: (code: string) => void;
  onResend: () => void;
  onUseCode: () => void;
  onUsePassword: () => void;
  onForgot: () => void;
  onNewPassword: (password: string) => void;
  onSecondMethod: (method: SecondMethod) => void;
  onStartOver: () => void;
};

const SECOND_SWITCH: Record<SecondMethod, string> = {
  totp: "Use your authenticator app",
  phone_code: "Get a code by text message",
  email_code: "Get a code by email",
  backup_code: "Use a backup code",
};

function secondDetail(step: Extract<SignInStep, { kind: "second" }>): string {
  const lead = step.newDevice ? "This device is new to us. " : "";
  if (step.method === "totp") return `${lead}Enter the 6-digit code from your authenticator app.`;
  if (step.method === "phone_code") return `${lead}We texted a 6-digit code to ${step.sentTo ?? "your phone"}.`;
  if (step.method === "email_code") return `${lead}We emailed a 6-digit code to ${step.sentTo ?? "your email address"}.`;
  return `${lead}Enter one of the backup codes you saved when you set up two-step sign-in.`;
}

/** Every sign-in step, drawn from plain props. The Clerk calls live in sign-in.tsx. */
export function SignInView(props: SignInViewProps) {
  // Each step starts with empty boxes: a used code or a wrong password never carries over.
  const { step } = props;
  return <SignInStepView key={step.kind === "second" ? `second-${step.method}` : step.kind} {...props} />;
}

function shownField(step: SignInStep): AuthProblem["field"] | null {
  if (step.kind === "email") return "email";
  if (step.kind === "password" || step.kind === "new-password") return "password";
  if (step.kind === "code" || step.kind === "reset-code" || step.kind === "second") return "code";
  return null;
}

function SignInStepView(props: SignInViewProps) {
  const { step, email, problem, busy, ready, signUpHref } = props;
  const [emailText, setEmailText] = useState(email);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? problem;
  const locked = busy !== null || !ready;

  // A failure with no box of its own on this step is shown above the button instead of being lost.
  const field = shownField(step);
  const fieldProblem = (name: AuthProblem["field"]) => (shown && shown.field === name && name === field ? shown : null);
  const formProblem = shown && shown.field !== field ? shown : null;

  const startOver = (
    <AuthTextButton
      onClick={() => {
        setPassword("");
        setCode("");
        setLocal(null);
        props.onStartOver();
      }}
    >
      Use a different email
    </AuthTextButton>
  );

  const action = (current: AuthProblem | null): React.ReactNode => {
    if (!current?.action) return null;
    if (current.action === "sign-up") {
      return (
        <a className={authLinkClass} href={signUpHref}>
          Create an account
        </a>
      );
    }
    if (current.action === "new-code") return <AuthTextButton onClick={props.onResend}>Send a new code</AuthTextButton>;
    if (current.action === "reset-password" && step.kind === "password" && step.canReset) {
      return <AuthTextButton onClick={props.onForgot}>Reset your password</AuthTextButton>;
    }
    if (current.action === "start-over") return <AuthTextButton onClick={props.onStartOver}>Start again</AuthTextButton>;
    return null;
  };

  const sendCode = (value: string) => {
    setLocal(null);
    props.onCode(value);
  };

  const footer = (
    <>
      New to Vistrial?{" "}
      <a className={authLinkClass} href={signUpHref}>
        Create an account
      </a>
    </>
  );

  if (step.kind === "email") {
    return (
      <AuthFrame title="Open your organization" detail="Sign in with Google or with your email." footer={footer}>
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
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="you@yourbusiness.com"
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

  if (step.kind === "password") {
    return (
      <AuthFrame
        title="Enter your password"
        detail={
          <EmailLine lead="Signing in as" email={email} change={startOver} />
        }
        footer={footer}
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            if (!password) return setLocal({ field: "password", message: "Enter your password." });
            setLocal(null);
            props.onPassword(password);
          }}
        >
          {/* Lets a password manager match the saved login to this email. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordInput
            key="password"
            label="Password"
            name="password"
            autoFocus
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocal(null);
            }}
            problem={fieldProblem("password")}
            problemAction={action(fieldProblem("password"))}
          />
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Signing in" disabled={locked}>
            Sign in
          </Button>
          {step.canReset || step.canUseCode ? (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {step.canReset ? (
                <AuthTextButton disabled={locked} onClick={props.onForgot}>
                  Forgot password?
                </AuthTextButton>
              ) : null}
              {step.canUseCode ? (
                <AuthTextButton disabled={locked} onClick={props.onUseCode}>
                  Email me a code instead
                </AuthTextButton>
              ) : null}
            </div>
          ) : null}
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "code" || step.kind === "reset-code" || step.kind === "second") {
    const backup = step.kind === "second" && step.method === "backup_code";
    const waitsForSend = step.kind !== "second" || step.method === "phone_code" || step.method === "email_code";
    const title = step.kind === "code" ? "Check your email" : step.kind === "reset-code" ? "Reset your password" : step.newDevice ? "Confirm it is you" : "Two-step sign-in";
    const detail =
      step.kind === "second" ? (
        secondDetail(step)
      ) : (
        <EmailLine
          lead="We sent a 6-digit code to"
          email={email}
          after={step.kind === "reset-code" ? "Enter it to choose a new password." : undefined}
          change={startOver}
        />
      );
    const others = step.kind === "second" ? step.methods.filter((method) => method !== step.method) : [];
    return (
      <AuthFrame title={title} detail={detail} footer={footer}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            if (!code) return setLocal({ field: "code", message: "Enter the code." });
            if (!backup && code.length < CODE_LENGTH) return setLocal({ field: "code", message: `The code has ${CODE_LENGTH} digits.` });
            sendCode(code);
          }}
        >
          <CodeInput
            key={step.kind === "second" ? step.method : step.kind}
            label={backup ? "Backup code" : "Code"}
            name="code"
            digits={!backup}
            autoFocus
            value={code}
            onChange={(event) => {
              const next = backup ? cleanBackupCode(event.target.value) : cleanCode(event.target.value);
              setCode(next);
              setLocal(null);
              // A full code goes straight in: nobody should have to find the button after a paste.
              if (!backup && next.length === CODE_LENGTH && next !== code && !locked) sendCode(next);
            }}
            problem={fieldProblem("code")}
            problemAction={action(fieldProblem("code"))}
          />
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Checking" disabled={locked}>
            {step.kind === "reset-code" ? "Continue" : "Sign in"}
          </Button>
          {waitsForSend ? <ResendCode sentCount={props.sentCount} busy={busy === "resend"} onResend={props.onResend} /> : null}
          {step.kind === "code" && step.canUsePassword ? (
            <AuthTextButton
              className="justify-self-start"
              disabled={locked}
              onClick={() => {
                setCode("");
                setLocal(null);
                props.onUsePassword();
              }}
            >
              Use your password instead
            </AuthTextButton>
          ) : null}
          {step.kind === "second" ? (
            <div className="grid justify-items-start gap-2 border-t border-border pt-4">
              {others.map((method) => (
                <AuthTextButton
                  key={method}
                  disabled={locked}
                  onClick={() => {
                    setCode("");
                    setLocal(null);
                    props.onSecondMethod(method);
                  }}
                >
                  {SECOND_SWITCH[method]}
                </AuthTextButton>
              ))}
              {startOver}
            </div>
          ) : null}
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "new-password") {
    return (
      <AuthFrame title="Choose a new password" detail="Saving it signs you in here and signs you out everywhere else." footer={footer}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            if (password.length < 8) return setLocal({ field: "password", message: "Use at least 8 characters." });
            setLocal(null);
            props.onNewPassword(password);
          }}
        >
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordInput
            key="new-password"
            label="New password"
            name="new-password"
            newPassword
            autoFocus
            hint="At least 8 characters. Longer is safer."
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocal(null);
            }}
            problem={fieldProblem("password")}
            problemAction={action(fieldProblem("password"))}
          />
          <ProblemLine problem={formProblem} action={action(formProblem)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "submit"} loadingLabel="Saving" disabled={locked}>
            Save and sign in
          </Button>
        </form>
      </AuthFrame>
    );
  }

  if (step.kind === "blocked") {
    return (
      <AuthFrame title="We cannot sign you in here" footer={footer}>
        <p className="text-sm leading-6 text-foreground">{BLOCKED_WORDS[step.reason]}</p>
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
    <AuthFrame title="Opening your organization">
      <Working label="One moment." />
      <ProblemLine problem={formProblem} action={action(formProblem)} />
    </AuthFrame>
  );
}
