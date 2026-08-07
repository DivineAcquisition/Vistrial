"use client";

import { Loader2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  onboardingCompleteAction,
  onboardingConfirmMfaAction,
  onboardingProfileAction,
  onboardingSetPasswordAction,
  onboardingSkipMfaAction,
  onboardingStartMfaAction,
} from "@/lib/actions/team";
import { passwordStrength } from "@/lib/team/password";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import type { TeamOnboardingStep, TeamRole } from "@/types/database";

const STEPS: TeamOnboardingStep[] = [
  "password",
  "profile",
  "mfa",
  "orientation",
];

function stepIndex(step: TeamOnboardingStep): number {
  if (step === "done") return STEPS.length;
  return Math.max(0, STEPS.indexOf(step));
}

export function OnboardingWizard({
  token,
  initialStep,
  role,
  email,
  skipPassword,
  defaultTimezone,
  resumeOnly = false,
}: {
  token?: string;
  initialStep: TeamOnboardingStep;
  role: TeamRole;
  email: string;
  skipPassword: boolean;
  defaultTimezone: string;
  /** Migrated Owner / MFA re-prompt — not a fresh invite. */
  resumeOnly?: boolean;
}) {
  const [step, setStep] = useState<TeamOnboardingStep>(
    skipPassword && initialStep === "password" ? "profile" : initialStep
  );
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const strength = useMemo(() => passwordStrength(password), [password]);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const [recoverySaved, setRecoverySaved] = useState(false);

  const index = stepIndex(step);
  const mfaRequired = role === "owner" || role === "admin";

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-8">
      <div>
        <p className="text-xs text-dim">{email}</p>
        <h1 className="mt-1 text-xl font-semibold text-white">
          Set up your team account
        </h1>
        <ol className="mt-4 flex gap-2">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                i <= index ? "bg-brand-500" : "bg-white/10"
              }`}
              aria-current={i === index ? "step" : undefined}
            />
          ))}
        </ol>
        <p className="mt-2 text-xs text-dim">
          Step {Math.min(index + 1, 4)} of 4
        </p>
      </div>

      {step === "password" ? (
        <section className="space-y-4">
          <p className={helperClass}>
            Minimum twelve characters. Strength feedback updates as you type.
          </p>
          <div>
            <label className={labelClass} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
            />
            <p className={helperClass}>
              Strength: {strength.level}
              {strength.hints[0] ? ` — ${strength.hints[0]}` : ""}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeMd}`}
            onClick={() =>
              run(async () => {
                const result = await onboardingSetPasswordAction({
                  token,
                  password,
                  confirm,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setStep("profile");
              })
            }
          >
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Continue
          </button>
        </section>
      ) : null}

      {step === "profile" ? (
        <section className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="job_title">
              Job title (optional)
            </label>
            <input
              id="job_title"
              className={inputClass}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone (optional)
            </label>
            <input
              id="phone"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="timezone">
              Time zone
            </label>
            <input
              id="timezone"
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeMd}`}
            onClick={() =>
              run(async () => {
                const result = await onboardingProfileAction({
                  token,
                  full_name: fullName,
                  job_title: jobTitle,
                  phone,
                  timezone,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setStep("mfa");
              })
            }
          >
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Continue
          </button>
        </section>
      ) : null}

      {step === "mfa" ? (
        <section className="space-y-4">
          <p className={helperClass}>
            Two-factor authentication is recommended
            {mfaRequired ? " and required for your role" : ""}.
          </p>

          {!factorId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className={`${btnPrimary} ${btnSizeMd}`}
                onClick={() =>
                  run(async () => {
                    const result = await onboardingStartMfaAction({ token });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    setFactorId(result.data.factorId);
                    setQr(result.data.qr);
                    setSecret(result.data.secret);
                    setRecoveryCodes(result.data.recoveryCodes);
                  })
                }
              >
                Set up authenticator
              </button>
              {!mfaRequired ? (
                <button
                  type="button"
                  disabled={pending}
                  className={`${btnSecondary} ${btnSizeMd}`}
                  onClick={() =>
                    run(async () => {
                      const result = await onboardingSkipMfaAction({ token });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      if (resumeOnly) {
                        window.location.href = "/attention";
                        return;
                      }
                      setStep("orientation");
                    })
                  }
                >
                  Skip for now
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="Authenticator QR code"
                  className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
                />
              ) : null}
              {secret ? (
                <p className="text-center text-xs text-dim">
                  Manual key: <span className="text-silver">{secret}</span>
                </p>
              ) : null}
              <div className="rounded-xl border border-border bg-white/[0.03] p-4">
                <p className="text-xs font-semibold text-white">
                  Recovery codes — save these now. Shown once.
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-silver">
                  {recoveryCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-center gap-2 text-xs text-dim">
                  <input
                    type="checkbox"
                    checked={recoverySaved}
                    onChange={(e) => setRecoverySaved(e.target.checked)}
                  />
                  I have saved these recovery codes
                </label>
              </div>
              <div>
                <label className={labelClass} htmlFor="mfa_code">
                  Authenticator code
                </label>
                <input
                  id="mfa_code"
                  className={inputClass}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={pending || !recoverySaved}
                className={`${btnPrimary} ${btnSizeMd}`}
                onClick={() =>
                  run(async () => {
                    if (!factorId) return;
                    const result = await onboardingConfirmMfaAction({
                      token,
                      factor_id: factorId,
                      code: mfaCode,
                      recovery_saved: recoverySaved,
                    });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    if (resumeOnly) {
                      window.location.href = "/attention";
                      return;
                    }
                    setStep("orientation");
                  })
                }
              >
                Confirm and continue
              </button>
            </div>
          )}
        </section>
      ) : null}

      {step === "orientation" ? (
        <section className="space-y-4">
          <ul className="space-y-3 text-sm text-silver">
            <li>Confirm appointments against each client&apos;s definition.</li>
            <li>Watch response times on every lead that comes in.</li>
            <li>Resolve disputes before they become chargebacks.</li>
            <li>Keep the attention view clear — that is the daily work.</li>
          </ul>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeMd}`}
            onClick={() =>
              run(async () => {
                const result = await onboardingCompleteAction({ token });
                if (result && !result.ok) {
                  toast.error(result.error);
                }
              })
            }
          >
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Enter Vistrial
          </button>
        </section>
      ) : null}
    </div>
  );
}
