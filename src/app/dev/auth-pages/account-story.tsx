"use client";

import { SecurityView, type ConfirmState, type SecurityPanel } from "@/components/account/security-view";
import { explainAuthError } from "@/lib/auth/errors";

const nothing = () => undefined;

const PANELS: Record<string, SecurityPanel> = {
  password: { kind: "password" },
  setup: { kind: "totp-setup", uri: "otpauth://totp/Vistrial:jaylen%40brooksconsulting.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Vistrial&algorithm=SHA1&digits=6&period=30", secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" },
  codes: { kind: "backup-codes", fresh: true, codes: ["k3v9x2pm", "7hq4wz8n", "t5b2r9cd", "m8n3f6ya", "p4j7s2ke", "w9d5g3hx", "c6y8v4bt", "z2r7k5qf", "h5m9n3ws", "x8f2c6jp"] },
  off: { kind: "totp-off" },
  email: { kind: "email" },
  "email-code": { kind: "email-code", email: "jaylen@brooksconsult.co" },
  delete: { kind: "delete" },
  "delete-blocked": { kind: "delete" },
  "delete-off": { kind: "delete" },
};

const CONFIRMS: Record<string, ConfirmState> = {
  confirm: { step: { kind: "password", canUseCode: true }, problem: null, busy: false, sentCount: 0 },
  "confirm-code": { step: { kind: "code", sentTo: "j*****@brooksconsulting.com", emailAddressId: "x", canUsePassword: true }, problem: null, busy: false, sentCount: 0 },
  "confirm-wrong": {
    step: { kind: "password", canUseCode: false },
    problem: explainAuthError({ errors: [{ code: "form_password_incorrect" }] }, { flow: "sign-up", field: "password" }),
    busy: false,
    sentCount: 0,
  },
};

/** The account cards with made-up data. `state` picks what is open: password, setup, codes, off, on, confirm, wrong-code. */
export function AccountStory({ state }: { state: string }) {
  const on = state === "on" || state === "off" || state === "codes";
  return (
    <SecurityView
      ready
      hasPassword={state !== "no-password"}
      twoStepOn={on}
      hasBackupCodes={on}
      devices={[
        { id: "a", current: true, device: "Chrome on Macintosh", place: "Dallas, US", lastActive: "Active now" },
        { id: "b", current: false, device: "Safari on iPhone", place: "Dallas, US", lastActive: "Active 3 hours ago" },
        { id: "c", current: false, device: "Edge on Windows", place: "Austin, US", lastActive: "Active 6 days ago" },
      ]}
      email="jaylen@brooksconsulting.com"
      emailSentCount={0}
      canDelete={state !== "delete-off"}
      closing={state === "delete-blocked" ? { leaves: [], blockedBy: ["Brooks Consulting"] } : { leaves: ["Brooks Consulting", "Bay Area Coaching"], blockedBy: [] }}
      onOpenEmail={nothing}
      onEmail={nothing}
      onEmailCode={nothing}
      onEmailResend={nothing}
      onOpenDelete={nothing}
      onDelete={nothing}
      panel={state === "wrong-code" ? PANELS.setup : (PANELS[state] ?? null)}
      busy={null}
      problem={state === "wrong-code" ? explainAuthError({ errors: [{ code: "form_code_incorrect" }] }, { flow: "sign-up", field: "code" }) : null}
      notice={null}
      confirm={CONFIRMS[state] ?? null}
      onOpenPassword={nothing}
      onPassword={nothing}
      onStartTwoStep={nothing}
      onVerifyTwoStep={nothing}
      onNewBackupCodes={nothing}
      onAskTurnOff={nothing}
      onTurnOff={nothing}
      onClosePanel={nothing}
      onSignOutDevice={nothing}
      onConfirmSubmit={nothing}
      onConfirmResend={nothing}
      onConfirmSwitch={nothing}
      onConfirmCancel={nothing}
    />
  );
}
