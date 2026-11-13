"use client";

import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";

import { AuthInput, AuthTextButton, CodeInput, PasswordInput, ProblemLine, ResendCode } from "@/components/auth/auth-parts";
import { Globe, Lock, Mail, ShieldCheck, UserX } from "@/components/icons";
import { StatusCard } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { groupSecret, type ConfirmSecondMethod, type ConfirmStep, type DeviceRow } from "@/lib/auth/account";
import type { AuthProblem } from "@/lib/auth/errors";
import { CODE_LENGTH, cleanBackupCode, cleanCode, looksLikeEmail } from "@/lib/auth/flow";
import { CONTACT_EMAIL } from "@/lib/constants";

/**
 * Password, two-step sign-in and signed-in devices, in Vistrial's own design. Clerk keeps the
 * account underneath; none of its screens are shown. The Clerk calls live in security.tsx.
 */

/** Which form is open. One at a time, so there is always one clear thing to do. */
export type SecurityPanel =
  | null
  | { kind: "password" }
  | { kind: "email" }
  | { kind: "email-code"; email: string }
  | { kind: "delete" }
  | { kind: "totp-setup"; uri: string; secret: string }
  | { kind: "backup-codes"; codes: string[]; fresh: boolean }
  | { kind: "totp-off" };

export type SecurityBusy = null | "password" | "email-start" | "email-verify" | "email-resend" | "delete" | "totp-start" | "totp-verify" | "totp-off" | "backup" | `device:${string}`;

export type ConfirmState = { step: ConfirmStep; problem: AuthProblem | null; busy: boolean; sentCount: number };

export type SecurityViewProps = {
  /** False until Clerk has the account. The cards show straight away; their buttons wait. */
  ready: boolean;
  hasPassword: boolean;
  twoStepOn: boolean;
  hasBackupCodes: boolean;
  /** null while the list is loading. */
  devices: DeviceRow[] | null;
  /** The address the person signs in with. Empty until Clerk has the account. */
  email: string;
  /** Goes up each time an email code is sent, to restart the wait before the next one. */
  emailSentCount: number;
  /** False when the Clerk instance does not let people delete their own account. */
  canDelete: boolean;
  /** What deleting would do to their organizations. null while that is loading. */
  closing: { leaves: string[]; blockedBy: string[] } | null;
  panel: SecurityPanel;
  busy: SecurityBusy;
  problem: AuthProblem | null;
  /** A short line confirming the last change, read out when it appears. */
  notice: string | null;
  confirm: ConfirmState | null;
  onOpenPassword: () => void;
  onPassword: (values: { current: string; next: string }) => void;
  onStartTwoStep: () => void;
  onVerifyTwoStep: (code: string) => void;
  onNewBackupCodes: () => void;
  onAskTurnOff: () => void;
  onTurnOff: () => void;
  onClosePanel: () => void;
  onSignOutDevice: (id: string) => void;
  onOpenEmail: () => void;
  onEmail: (email: string) => void;
  onEmailCode: (code: string) => void;
  onEmailResend: () => void;
  onOpenDelete: () => void;
  onDelete: () => void;
  onConfirmSubmit: (value: string) => void;
  onConfirmResend: () => void;
  onConfirmSwitch: (to: "password" | "code" | ConfirmSecondMethod) => void;
  onConfirmCancel: () => void;
};

/** The set-up code as a picture. Always dark on white: phone cameras read nothing else reliably. */
export function SetupCode({ uri }: { uri: string }) {
  const path = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(uri);
    code.make();
    const size = code.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { d, size: size + 8 };
  }, [uri]);
  return (
    <svg
      role="img"
      aria-label="Set-up code for your authenticator app"
      viewBox={`0 0 ${path.size} ${path.size}`}
      className="size-44 shrink-0 rounded-xl border border-border bg-white"
      shapeRendering="crispEdges"
    >
      <path d={path.d} fill="#07070b" />
    </svg>
  );
}

function EmailForm({ props }: { props: SecurityViewProps }) {
  const [email, setEmail] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? props.problem;
  const working = props.busy === "email-start";
  return (
    <form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        const value = email.trim();
        if (!looksLikeEmail(value)) return setLocal({ field: "email", message: "That does not look like an email address." });
        if (value.toLowerCase() === props.email.toLowerCase()) return setLocal({ field: "email", message: "That is the address you already use." });
        setLocal(null);
        props.onEmail(value);
      }}
    >
      <AuthInput
        label="New email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        hint="We send a code there to check it is yours. Nothing changes until you enter it."
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setLocal(null);
        }}
        problem={shown?.field === "email" ? shown : null}
      />
      <ProblemLine problem={shown && shown.field !== "email" ? shown : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={working} loadingLabel="Sending">
          Send code
        </Button>
        <Button variant="ghost" disabled={working} onClick={props.onClosePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EmailCodeForm({ props, email }: { props: SecurityViewProps; email: string }) {
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? props.problem;
  const working = props.busy === "email-verify";
  return (
    <form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        if (code.length < CODE_LENGTH) return setLocal({ field: "code", message: `The code has ${CODE_LENGTH} digits.` });
        setLocal(null);
        props.onEmailCode(code);
      }}
    >
      <p className="text-sm leading-6 text-foreground">
        We sent a 6-digit code to <span className="font-medium wrap-anywhere text-strong">{email}</span>. Enter it to make that your email.
      </p>
      <CodeInput
        label="Code"
        name="code"
        autoFocus
        value={code}
        onChange={(event) => {
          setCode(cleanCode(event.target.value));
          setLocal(null);
        }}
        problem={shown?.field === "code" ? shown : null}
      />
      <ProblemLine problem={shown && shown.field !== "code" ? shown : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={working} loadingLabel="Checking">
          Use this email
        </Button>
        <Button variant="ghost" disabled={working} onClick={props.onClosePanel}>
          Cancel
        </Button>
      </div>
      <ResendCode sentCount={props.emailSentCount} busy={props.busy === "email-resend"} onResend={props.onEmailResend} />
    </form>
  );
}

/** The word the person types to show they mean it. */
export const DELETE_WORD = "DELETE";

function listWords(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function DeleteForm({ props }: { props: SecurityViewProps }) {
  const [typed, setTyped] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? props.problem;
  const working = props.busy === "delete";
  const mail = (
    <a className="font-medium text-brand-300 underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );
  if (props.closing === null) return <p className="text-sm text-muted-foreground">Checking your organizations.</p>;
  if (props.closing.blockedBy.length > 0) {
    return (
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-foreground">
          You are the only Owner of {listWords(props.closing.blockedBy)}. An organization always needs an Owner, so first make someone else an Owner under People, or write to {mail} and we will close it for you. Then you can delete your account.
        </p>
        <div>
          <Button variant="outline" onClick={props.onClosePanel}>
            Close
          </Button>
        </div>
      </div>
    );
  }
  if (!props.canDelete) {
    return (
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-foreground">Deleting your own account is not switched on yet. Write to {mail} from {props.email || "your sign-in email"} and we will delete it for you.</p>
        <div>
          <Button variant="outline" onClick={props.onClosePanel}>
            Close
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        if (typed.trim().toUpperCase() !== DELETE_WORD) return setLocal({ field: "form", message: `Type ${DELETE_WORD} to confirm.` });
        setLocal(null);
        props.onDelete();
      }}
    >
      <div className="grid gap-2 text-sm leading-6 text-foreground">
        <p>This cannot be undone. Deleting your account:</p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>deletes your sign-in ({props.email}), so you can no longer open Vistrial;</li>
          <li>
            {props.closing.leaves.length > 0
              ? `removes you from ${listWords(props.closing.leaves)};`
              : "removes you from every organization;"}
          </li>
          <li>leaves the work you did there with the organization. It is not deleted.</li>
        </ul>
      </div>
      <AuthInput
        label={`Type ${DELETE_WORD} to confirm`}
        name="confirm-delete"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setLocal(null);
        }}
      />
      <ProblemLine problem={shown} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" loading={working} loadingLabel="Deleting">
          Delete my account
        </Button>
        <Button variant="ghost" disabled={working} onClick={props.onClosePanel}>
          Keep my account
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ props }: { props: SecurityViewProps }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? props.problem;
  const working = props.busy === "password";
  return (
    <form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        if (props.hasPassword && !current) return setLocal({ field: "form", message: "Enter your current password." });
        if (next.length < 8) return setLocal({ field: "password", message: "Use at least 8 characters." });
        if (props.hasPassword && next === current) return setLocal({ field: "password", message: "That is the password you already have. Choose a different one." });
        setLocal(null);
        props.onPassword({ current, next });
      }}
    >
      {props.hasPassword ? (
        <PasswordInput
          label="Current password"
          name="current-password"
          autoFocus
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
            setLocal(null);
          }}
        />
      ) : null}
      <PasswordInput
        label="New password"
        name="new-password"
        newPassword
        autoFocus={!props.hasPassword}
        hint="At least 8 characters. Longer is safer. Saving signs you out on every other device."
        value={next}
        onChange={(event) => {
          setNext(event.target.value);
          setLocal(null);
        }}
        problem={local?.field === "password" ? local : null}
      />
      {/* Clerk's answer is about the whole form: it can mean either box. */}
      <ProblemLine problem={local?.field === "password" ? null : shown} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={working} loadingLabel="Saving">
          {props.hasPassword ? "Change password" : "Set password"}
        </Button>
        <Button variant="ghost" disabled={working} onClick={props.onClosePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TwoStepSetup({ props, uri, secret }: { props: SecurityViewProps; uri: string; secret: string }) {
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? props.problem;
  const working = props.busy === "totp-verify";
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        if (code.length < CODE_LENGTH) return setLocal({ field: "code", message: `Enter the ${CODE_LENGTH}-digit code from the app.` });
        setLocal(null);
        props.onVerifyTwoStep(code);
      }}
    >
      <ol className="grid gap-4 text-sm leading-6 text-foreground">
        <li className="grid gap-3">
          <p>
            <span className="font-medium">1.</span> Open an authenticator app on your phone (Google Authenticator, 1Password, Authy) and scan this code.
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <SetupCode uri={uri} />
            <div className="grid min-w-0 gap-1">
              <p className="text-muted-foreground">Cannot scan it? Type this key into the app instead:</p>
              <code className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm break-all text-strong select-all">{groupSecret(secret)}</code>
            </div>
          </div>
        </li>
        <li className="grid max-w-xs gap-3">
          <p>
            <span className="font-medium">2.</span> Enter the 6-digit code the app shows.
          </p>
          <CodeInput
            label="Code from the app"
            name="code"
            autoFocus
            value={code}
            onChange={(event) => {
              setCode(cleanCode(event.target.value));
              setLocal(null);
            }}
            problem={shown?.field === "code" ? shown : null}
          />
        </li>
      </ol>
      <ProblemLine problem={shown && shown.field !== "code" ? shown : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={working} loadingLabel="Checking">
          Turn on two-step sign-in
        </Button>
        <Button variant="ghost" disabled={working} onClick={props.onClosePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function BackupCodes({ codes, fresh, onDone }: { codes: string[]; fresh: boolean; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-6 text-foreground">
        {fresh ? "Two-step sign-in is on. " : "These replace your old backup codes, which no longer work. "}
        Save these backup codes somewhere safe. Each one signs you in once if you lose your phone. They are not shown again.
      </p>
      <ul aria-label="Backup codes" className="grid max-w-sm grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-border bg-background p-4 font-mono text-sm text-strong">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button variant="primary" onClick={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

const CONFIRM_SWITCH: Record<ConfirmSecondMethod, string> = {
  totp: "Use your authenticator app",
  phone_code: "Get a code by text message",
  backup_code: "Use a backup code",
};

function ConfirmForm({ props, state }: { props: SecurityViewProps; state: ConfirmState }) {
  const { step } = state;
  const [value, setValue] = useState("");
  const [local, setLocal] = useState<AuthProblem | null>(null);
  const shown = local ?? state.problem;
  const backup = step.kind === "second" && step.method === "backup_code";
  if (step.kind === "blocked" || step.kind === "done") {
    return (
      <div className="grid gap-4">
        {step.kind === "blocked" ? (
          <p className="text-sm leading-6 text-foreground">
            We could not check it is you from here. Sign out, sign back in, and make the change straight away.
          </p>
        ) : null}
        <ProblemLine problem={shown} />
        <div>
          <Button variant="outline" onClick={props.onConfirmCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }
  const detail =
    step.kind === "password"
      ? "Enter your password to make this change."
      : step.kind === "code"
        ? `We emailed a 6-digit code to ${step.sentTo ?? "your email address"}.`
        : step.method === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : step.method === "phone_code"
            ? `We texted a 6-digit code to ${step.phone?.sentTo ?? "your phone"}.`
            : "Enter one of your backup codes.";
  const field = step.kind === "password" ? "password" : "code";
  const others = step.kind === "second" ? step.methods.filter((method) => method !== step.method) : [];
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (state.busy) return;
        if (!value) return setLocal({ field, message: step.kind === "password" ? "Enter your password." : "Enter the code." });
        setLocal(null);
        props.onConfirmSubmit(value);
      }}
    >
      <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
      {step.kind === "password" ? (
        <PasswordInput
          label="Password"
          name="password"
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setLocal(null);
          }}
          problem={shown?.field === "password" ? shown : null}
        />
      ) : (
        <CodeInput
          label={backup ? "Backup code" : "Code"}
          name="code"
          digits={!backup}
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(backup ? cleanBackupCode(event.target.value) : cleanCode(event.target.value));
            setLocal(null);
          }}
          problem={shown?.field === "code" ? shown : null}
        />
      )}
      <ProblemLine problem={shown && shown.field !== field ? shown : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={state.busy} loadingLabel="Checking">
          Confirm
        </Button>
        <Button variant="ghost" disabled={state.busy} onClick={props.onConfirmCancel}>
          Cancel
        </Button>
      </div>
      {step.kind === "code" || (step.kind === "second" && step.method === "phone_code") ? (
        <ResendCode sentCount={state.sentCount} busy={state.busy} onResend={props.onConfirmResend} />
      ) : null}
      <div className="grid justify-items-start gap-2 empty:hidden">
        {step.kind === "password" && step.canUseCode ? <AuthTextButton onClick={() => props.onConfirmSwitch("code")}>Email me a code instead</AuthTextButton> : null}
        {step.kind === "code" && step.canUsePassword ? <AuthTextButton onClick={() => props.onConfirmSwitch("password")}>Use your password instead</AuthTextButton> : null}
        {others.map((method) => (
          <AuthTextButton key={method} onClick={() => props.onConfirmSwitch(method)}>
            {CONFIRM_SWITCH[method]}
          </AuthTextButton>
        ))}
      </div>
    </form>
  );
}

export function SecurityView(props: SecurityViewProps) {
  const { panel, busy, ready } = props;
  const idle = ready && busy === null;
  const cardProblem = (kinds: NonNullable<SecurityPanel>["kind"][]) => (panel === null || !kinds.includes(panel.kind) ? null : props.problem);
  // A failure with no form open (a device that would not sign out, a set-up that would not start).
  const looseProblem = panel === null ? props.problem : null;

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {props.notice ?? ""}
      </p>

      <StatusCard
        icon={Mail}
        title="Email"
        sentence={props.email ? <>You sign in with <span className="font-medium wrap-anywhere text-strong">{props.email}</span>. Codes and notices go there.</> : "The address you sign in with."}
        footer={
          panel?.kind === "email" || panel?.kind === "email-code" ? undefined : (
            <Button size="sm" variant="outline" disabled={!idle} onClick={props.onOpenEmail}>
              Change email
            </Button>
          )
        }
      >
        {panel?.kind === "email" ? <EmailForm props={props} /> : null}
        {panel?.kind === "email-code" ? <EmailCodeForm props={props} email={panel.email} /> : null}
        {props.notice && panel === null && props.notice.startsWith("Email") ? <p className="text-sm text-foreground">{props.notice}</p> : null}
      </StatusCard>

      <StatusCard
        icon={Lock}
        title="Password"
        sentence={
          props.hasPassword
            ? "You have a password. Change it here whenever you like."
            : "No password yet. You sign in with Google or a code we email you. You can add a password as well."
        }
        footer={
          panel?.kind === "password" ? undefined : (
            <Button size="sm" variant="outline" disabled={!idle} onClick={props.onOpenPassword}>
              {props.hasPassword ? "Change password" : "Set a password"}
            </Button>
          )
        }
      >
        {panel?.kind === "password" ? <PasswordForm props={props} /> : null}
        {props.notice && panel === null && props.notice.startsWith("Password") ? <p className="text-sm text-foreground">{props.notice}</p> : null}
      </StatusCard>

      <StatusCard
        icon={ShieldCheck}
        title="Two-step sign-in"
        status={ready ? (props.twoStepOn ? "On" : "Off") : undefined}
        tone={props.twoStepOn ? "good" : "neutral"}
        sentence={
          props.twoStepOn
            ? "On. After your password or Google, you are asked for a code from your authenticator app."
            : "Off. With it on, signing in also needs a code from an app on your phone, so a stolen password is not enough."
        }
        footer={
          panel?.kind === "totp-setup" || panel?.kind === "backup-codes" || panel?.kind === "totp-off" ? undefined : props.twoStepOn ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!idle} loading={busy === "backup"} loadingLabel="Making codes" onClick={props.onNewBackupCodes}>
                {props.hasBackupCodes ? "New backup codes" : "Get backup codes"}
              </Button>
              <Button size="sm" variant="ghost" disabled={!idle} onClick={props.onAskTurnOff}>
                Turn off
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={!idle} loading={busy === "totp-start"} loadingLabel="Getting ready" onClick={props.onStartTwoStep}>
              Turn on
            </Button>
          )
        }
      >
        {panel?.kind === "totp-setup" ? <TwoStepSetup props={props} uri={panel.uri} secret={panel.secret} /> : null}
        {panel?.kind === "backup-codes" ? <BackupCodes codes={panel.codes} fresh={panel.fresh} onDone={props.onClosePanel} /> : null}
        {panel?.kind === "totp-off" ? (
          <div className="grid gap-3">
            <p className="text-sm leading-6 text-foreground">Turn off two-step sign-in? Signing in will need only your password or Google again, and your backup codes stop working.</p>
            <ProblemLine problem={cardProblem(["totp-off"])} />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive-outline" loading={busy === "totp-off"} loadingLabel="Turning off" onClick={props.onTurnOff}>
                Turn off
              </Button>
              <Button variant="ghost" disabled={busy === "totp-off"} onClick={props.onClosePanel}>
                Keep it on
              </Button>
            </div>
          </div>
        ) : null}
        {panel === null && looseProblem ? <ProblemLine problem={looseProblem} /> : null}
      </StatusCard>

      <StatusCard icon={Globe} title="Where you are signed in" sentence="Every browser and phone signed in to your account. Sign out any you do not recognise, then change your password.">
        {props.devices === null ? (
          <p className="text-sm text-muted-foreground">Loading your devices.</p>
        ) : props.devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Only this device.</p>
        ) : (
          <ul className="grid divide-y divide-border/70">
            {props.devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-sm font-medium text-strong">
                    {device.device}
                    {device.current ? <span className="ms-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">This device</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {device.place} · {device.lastActive}
                  </p>
                </div>
                {device.current ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!idle}
                    loading={busy === `device:${device.id}`}
                    loadingLabel="Signing out"
                    aria-label={`Sign out ${device.device}, ${device.place}`}
                    onClick={() => props.onSignOutDevice(device.id)}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </StatusCard>

      <StatusCard
        icon={UserX}
        title="Delete account"
        sentence="Removes you from every organization and deletes your sign-in for good."
        footer={
          panel?.kind === "delete" ? undefined : (
            <Button size="sm" variant="destructive-outline" disabled={!idle} onClick={props.onOpenDelete}>
              Delete account
            </Button>
          )
        }
      >
        {panel?.kind === "delete" ? <DeleteForm props={props} /> : null}
      </StatusCard>

      <Dialog
        open={props.confirm !== null}
        onOpenChange={(open) => {
          if (!open) props.onConfirmCancel();
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm it is you</DialogTitle>
            <DialogDescription>A quick check before a change to how you sign in.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {props.confirm ? (
              <ConfirmForm
                key={props.confirm.step.kind === "second" ? `second-${props.confirm.step.method}` : props.confirm.step.kind}
                props={props}
                state={props.confirm}
              />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
