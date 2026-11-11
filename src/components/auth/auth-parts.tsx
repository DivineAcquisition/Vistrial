"use client";

import { useEffect, useId, useState } from "react";

import Logo from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthProblem } from "@/lib/auth/errors";
import { RESEND_WAIT_SECONDS, waitClock } from "@/lib/auth/flow";
import { cn } from "@/lib/utils";

/**
 * The pieces every sign-in and sign-up step is built from. All of it is Vistrial's own markup on the
 * workspace tokens; Clerk supplies the account underneath and draws nothing here.
 */

/** The card every step sits in. The title changes with the step and is read out when it does. */
export function AuthFrame({
  title,
  detail,
  children,
  footer,
}: {
  title: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[26rem]">
      <div className="animate-rise overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--panel-shadow)]">
        <div className="border-b border-border bg-gradient-to-b from-brand-950 to-card px-6 pt-8 pb-6 text-center">
          <Logo markOnly className="mx-auto size-12" title="" />
          <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">Workspace</p>
          <div aria-live="polite">
            <h1 className="mt-2 font-heading text-2xl text-balance text-strong">{title}</h1>
            {detail ? <div className="mx-auto mt-2 max-w-xs text-sm leading-6 text-pretty text-muted-foreground">{detail}</div> : null}
          </div>
        </div>
        {children ? <div className="grid gap-4 p-6">{children}</div> : null}
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
      <p className="mt-3 text-center text-xs text-muted-foreground/80">
        <a href="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </a>
        {" · "}
        <a href="/terms" className="underline-offset-4 hover:underline">
          Terms
        </a>
      </p>
    </section>
  );
}

export const authLinkClass =
  "rounded-sm font-medium text-brand-300 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/50";

/** A text-weight action inside a step: "Use a different email", "Forgot password?". */
export function AuthTextButton({ className, ...props }: React.ComponentProps<"button">) {
  return <button type="button" className={cn(authLinkClass, "cursor-pointer text-sm disabled:cursor-default disabled:opacity-60", className)} {...props} />;
}

/** "We sent a code to" with the address on its own line, so a long one never breaks mid-word. */
export function EmailLine({ lead, email, after, change }: { lead: string; email: string; after?: string; change?: React.ReactNode }) {
  return (
    <>
      {lead}
      <span className="block truncate font-medium text-strong" title={email}>
        {email}
      </span>
      {after ? <span className="block">{after}</span> : null}
      {change ? <span className="mt-1 block">{change}</span> : null}
    </>
  );
}

/** The words for a failure, announced as soon as they appear, with the way out beside them. */
export function ProblemLine({ id, problem, action }: { id?: string; problem: AuthProblem | null; action?: React.ReactNode }) {
  if (!problem) return null;
  return (
    <p id={id} role="alert" className="text-sm leading-5 text-destructive">
      {problem.message}
      {action ? <> {action}</> : null}
    </p>
  );
}

type AuthInputProps = Omit<React.ComponentProps<"input">, "size" | "id"> & {
  label: string;
  hint?: string;
  /** The failure that belongs to this field. It is tied to the input for screen readers. */
  problem?: AuthProblem | null;
  problemAction?: React.ReactNode;
  /** Sits at the right end of the label row, for example a show/hide switch. */
  labelAside?: React.ReactNode;
  inputClassName?: string;
};

export function AuthInput({ label, hint, problem, problemAction, labelAside, inputClassName, ...props }: AuthInputProps) {
  const id = useId();
  const described = [problem ? `${id}-problem` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <Input
        nativeInput
        id={id}
        size="lg"
        aria-invalid={problem ? true : undefined}
        aria-describedby={described}
        className={inputClassName}
        {...props}
      />
      <ProblemLine id={`${id}-problem`} problem={problem ?? null} action={problemAction} />
      {hint && !problem ? (
        <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordInput({
  label,
  newPassword = false,
  ...props
}: Omit<AuthInputProps, "type" | "label" | "labelAside"> & { label: string; newPassword?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <AuthInput
      label={label}
      type={shown ? "text" : "password"}
      autoComplete={newPassword ? "new-password" : "current-password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      labelAside={
        <AuthTextButton aria-pressed={shown} onClick={() => setShown((now) => !now)} className="text-xs">
          {shown ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </AuthTextButton>
      }
      {...props}
    />
  );
}

/**
 * One box for the whole code, so a paste, the phone's "from Messages" suggestion and a password
 * manager all fill it in one go.
 */
export function CodeInput({ digits = true, ...props }: Omit<AuthInputProps, "type"> & { digits?: boolean }) {
  return (
    <AuthInput
      type="text"
      inputMode={digits ? "numeric" : "text"}
      pattern={digits ? "[0-9]*" : undefined}
      autoComplete="one-time-code"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      inputClassName={
        digits
          ? "[&_input]:text-center [&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.45em] [&_input]:ps-[0.45em] sm:[&_input]:text-lg"
          : "[&_input]:font-mono"
      }
      {...props}
    />
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function GoogleButton({ loading, disabled, onClick }: { loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="lg" className="w-full" loading={loading} loadingLabel="Opening Google" disabled={disabled} onClick={onClick}>
      <GoogleMark />
      Continue with Google
    </Button>
  );
}

export function OrDivider() {
  return (
    <div role="separator" className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * "Send a new code", held back for half a minute after each send so nobody sends themselves a pile of codes.
 * `sentCount` goes up each time a code is sent, which restarts the wait.
 */
export function ResendCode({ sentCount, busy, onResend, wait = RESEND_WAIT_SECONDS }: { sentCount: number; busy: boolean; onResend: () => void; wait?: number }) {
  const [left, setLeft] = useState(wait);
  useEffect(() => {
    const until = Date.now() + wait * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [sentCount, wait]);

  if (left > 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No code yet? You can send a new one in <span className="tabular-nums">{waitClock(left)}</span>.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      No code yet?{" "}
      <AuthTextButton disabled={busy} onClick={onResend}>
        {busy ? "Sending…" : "Send a new code"}
      </AuthTextButton>
    </p>
  );
}

/** Bot protection on sign-up draws its check here when Clerk decides one is needed. Empty otherwise. */
export function CaptchaMount() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const watcher = new MutationObserver(read);
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => watcher.disconnect();
  }, []);
  return <div id="clerk-captcha" data-cl-theme={theme} data-cl-size="flexible" className="empty:hidden" />;
}

/** Shown while the session is being opened, so the last step does not look frozen. */
export function Working({ label }: { label: string }) {
  return (
    <p role="status" className="py-2 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}
