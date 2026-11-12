"use client";

import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";

import { AuthTextButton, CodeInput, PasswordInput, ProblemLine, ResendCode } from "@/components/auth/auth-parts";
import { Globe, Lock, ShieldCheck } from "@/components/icons";
import { StatusCard } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { groupSecret, type ConfirmSecondMethod, type ConfirmStep, type DeviceRow } from "@/lib/auth/account";
import type { AuthProblem } from "@/lib/auth/errors";
import { CODE_LENGTH, cleanBackupCode, cleanCode } from "@/lib/auth/flow";

/**
 * Password, two-step sign-in and signed-in devices, in Vistrial's own design. Clerk keeps the
 * account underneath; none of its screens are shown. The Clerk calls live in security.tsx.
 */

/** Which form is open. One at a time, so there is always one clear thing to do. */
export type SecurityPanel =
  | null
  | { kind: "password" }
  | { kind: "totp-setup"; uri: string; secret: string }
  | { kind: "backup-codes"; codes: string[]; fresh: boolean }
  | { kind: "totp-off" };

export type SecurityBusy = null | "password" | "totp-start" | "totp-verify" | "totp-off" | "backup" | `device:${string}`;

export type ConfirmState = { step: ConfirmStep; problem: AuthProblem | null; busy: boolean; sentCount: number };

export type SecurityViewProps = {
  /** False until Clerk has the account. The cards show straight away; their buttons wait. */
  ready: boolean;
  hasPassword: boolean;
  twoStepOn: boolean;
  hasBackupCodes: boolean;
  /** null while the list is loading. */
  devices: DeviceRow[] | null;
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
          panel !== null && panel.kind !== "password" ? undefined : props.twoStepOn ? (
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
