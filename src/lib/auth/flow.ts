/**
 * Which screen comes next in sign-in and sign-up, worked out from what Clerk reports about the attempt.
 * Nothing here knows which methods the Clerk instance has switched on: it reads the attempt's own
 * supported factors and missing fields, so the screens only offer what will work.
 */

type Factor = { strategy: string; safeIdentifier?: string };

/** The second-step methods these screens can complete, in the order they are offered. */
export const SECOND_METHODS = ["totp", "phone_code", "email_code", "backup_code"] as const;
export type SecondMethod = (typeof SECOND_METHODS)[number];

export type SignInStep =
  | { kind: "email" }
  | { kind: "password"; canUseCode: boolean; canReset: boolean }
  | { kind: "code"; canUsePassword: boolean }
  | { kind: "reset-code" }
  | { kind: "new-password" }
  | { kind: "second"; method: SecondMethod; methods: SecondMethod[]; sentTo: string | null; newDevice: boolean }
  | { kind: "done" }
  | { kind: "blocked"; reason: "google-only" | "no-method" | "extra-check" | "task" };

export type SignInSnapshot = {
  status: string | null | undefined;
  supportedFirstFactors?: readonly Factor[] | null;
  supportedSecondFactors?: readonly Factor[] | null;
};

function has(factors: readonly Factor[] | null | undefined, strategy: string) {
  return Boolean(factors?.some((factor) => factor.strategy === strategy));
}

export function secondMethods(factors: readonly Factor[] | null | undefined): SecondMethod[] {
  return SECOND_METHODS.filter((method) => has(factors, method));
}

function sentTo(factors: readonly Factor[] | null | undefined, method: SecondMethod): string | null {
  if (method !== "phone_code" && method !== "email_code") return null;
  return factors?.find((factor) => factor.strategy === method)?.safeIdentifier ?? null;
}

export function secondStep(snapshot: SignInSnapshot, prefer?: SecondMethod): SignInStep {
  const methods = secondMethods(snapshot.supportedSecondFactors);
  const method = prefer && methods.includes(prefer) ? prefer : methods[0];
  if (!method) return { kind: "blocked", reason: "no-method" };
  return {
    kind: "second",
    method,
    methods,
    sentTo: sentTo(snapshot.supportedSecondFactors, method),
    newDevice: snapshot.status === "needs_client_trust",
  };
}

/**
 * The step for a sign-in attempt. `prefer` is the person's own choice between a password and an
 * emailed code when the account allows both; it is ignored when the account allows only one.
 */
export function signInStep(snapshot: SignInSnapshot, prefer: "password" | "code" = "password"): SignInStep {
  switch (snapshot.status) {
    case "complete":
      return { kind: "done" };
    case "needs_new_password":
      return { kind: "new-password" };
    case "needs_second_factor":
    case "needs_client_trust":
      return secondStep(snapshot);
    case "needs_protect_check":
      return { kind: "blocked", reason: "extra-check" };
    case "needs_first_factor": {
      const factors = snapshot.supportedFirstFactors;
      const password = has(factors, "password");
      const code = has(factors, "email_code");
      const reset = has(factors, "reset_password_email_code");
      if (password && !(code && prefer === "code")) return { kind: "password", canUseCode: code, canReset: reset };
      if (code) return { kind: "code", canUsePassword: password };
      if (factors?.some((factor) => factor.strategy.startsWith("oauth_"))) return { kind: "blocked", reason: "google-only" };
      return { kind: "blocked", reason: "no-method" };
    }
    default:
      return { kind: "email" };
  }
}

/** Where to pick up when the person lands on the sign-in page with an attempt already under way. */
export function resumeSignInStep(snapshot: SignInSnapshot): SignInStep {
  const step = signInStep(snapshot);
  // A half-entered email or password attempt is stale by now. Only the later steps are worth resuming.
  return step.kind === "second" || step.kind === "new-password" ? step : { kind: "email" };
}

export const BLOCKED_WORDS: Record<Extract<SignInStep, { kind: "blocked" }>["reason"], string> = {
  "google-only": "This account signs in with Google. Go back and choose Continue with Google.",
  "no-method": "This account uses a sign-in method this page does not offer yet. Write to us and we will help you in.",
  task: "Your account needs one more step before it can open, such as a new password or setting up two-step sign-in. This page cannot do that step yet. Write to us and we will sort it out.",
  "extra-check": "This sign-in needs an extra safety check that did not finish. Start again, and turn off any ad blocker for this page.",
};

/* ------------------------------------------------------------------ sign-up */

/** The extra answers the sign-up screen can collect when the Clerk instance asks for them. */
export const DETAIL_FIELDS = ["password", "first_name", "last_name", "legal_accepted"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

export type SignUpStep =
  | { kind: "email" }
  | { kind: "details"; fields: DetailField[] }
  | { kind: "verify" }
  | { kind: "done" }
  | { kind: "blocked"; missing: string[] };

export type SignUpSnapshot = {
  status: string | null | undefined;
  missingFields?: readonly string[] | null;
  unverifiedFields?: readonly string[] | null;
};

export function signUpStep(snapshot: SignUpSnapshot): SignUpStep {
  if (snapshot.status === "complete") return { kind: "done" };
  if (snapshot.status !== "missing_requirements") return { kind: "email" };
  const missing = [...(snapshot.missingFields ?? [])];
  const known = DETAIL_FIELDS.filter((field) => missing.includes(field));
  const unknown = missing.filter((field) => !(DETAIL_FIELDS as readonly string[]).includes(field) && field !== "email_address");
  if (unknown.length > 0) return { kind: "blocked", missing: unknown };
  if (known.length > 0) return { kind: "details", fields: known };
  if (snapshot.unverifiedFields?.includes("email_address")) return { kind: "verify" };
  if (missing.includes("email_address")) return { kind: "email" };
  return { kind: "blocked", missing: [...(snapshot.unverifiedFields ?? [])] };
}

/* ------------------------------------------------------------------ codes */

export const CODE_LENGTH = 6;
/** How long the "send a new code" button waits after each send. */
export const RESEND_WAIT_SECONDS = 30;

/** Digits only, trimmed to the code length. Pasting "123 456" or "Your code is 123456." both work. */
export function cleanCode(raw: string, length = CODE_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, length);
}

/** Backup codes are letters and digits. Spaces and dashes from a printed list are dropped. */
export function cleanBackupCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32).toLowerCase();
}

/** "0:24" for the wait before a new code can be sent. */
export function waitClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Session tasks Clerk can demand after sign-in. These screens cannot complete them, so they say so. */
export const TASK_WORDS: Record<string, string> = {
  "choose-organization": "choosing an organization",
  "reset-password": "setting a new password",
  "setup-mfa": "setting up two-step sign-in",
};
