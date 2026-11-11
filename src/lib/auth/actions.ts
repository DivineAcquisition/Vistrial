import type { SignInFutureResource, SignUpFutureResource } from "@clerk/shared/types";

import { explainAuthError, type AuthField, type AuthProblem } from "@/lib/auth/errors";
import {
  secondStep,
  signInStep,
  signUpStep,
  type DetailField,
  type SecondMethod,
  type SignInStep,
  type SignUpStep,
} from "@/lib/auth/flow";

/**
 * Each thing a person can do on the sign-in and sign-up screens, as one call that talks to Clerk and
 * answers with the screen to show next and, when something failed, the words for it. Clerk keeps the
 * account, the codes and the passwords: nothing here stores any of them.
 */
export type SignInClient = Pick<
  SignInFutureResource,
  "status" | "supportedFirstFactors" | "supportedSecondFactors" | "create" | "password" | "emailCode" | "resetPasswordEmailCode" | "mfa"
>;

export type SignUpClient = Pick<
  SignUpFutureResource,
  "status" | "missingFields" | "unverifiedFields" | "create" | "update" | "password" | "verifications"
>;

export type SignInOutcome = { step: SignInStep; problem: AuthProblem | null };
export type SignUpOutcome = { step: SignUpStep; problem: AuthProblem | null };

const inError = (error: unknown, field: AuthField) => explainAuthError(error, { flow: "sign-in", field });
const upError = (error: unknown, field: AuthField) => explainAuthError(error, { flow: "sign-up", field });

/* ------------------------------------------------------------------ sign-in */

async function sendFor(signIn: SignInClient, step: SignInStep): Promise<unknown | null> {
  if (step.kind === "code") return (await signIn.emailCode.sendCode()).error;
  if (step.kind === "reset-code") return (await signIn.resetPasswordEmailCode.sendCode()).error;
  if (step.kind === "second" && step.method === "phone_code") return (await signIn.mfa.sendPhoneCode()).error;
  if (step.kind === "second" && step.method === "email_code") return (await signIn.mfa.sendEmailCode()).error;
  return null;
}

/** Shows a step, sending its code first when it is a step that waits for one. */
async function enter(signIn: SignInClient, step: SignInStep): Promise<SignInOutcome> {
  const error = await sendFor(signIn, step);
  return { step, problem: error ? inError(error, "code") : null };
}

export async function startSignIn(signIn: SignInClient, email: string): Promise<SignInOutcome> {
  const { error } = await signIn.create({ identifier: email.trim() });
  if (error) return { step: { kind: "email" }, problem: inError(error, "email") };
  return enter(signIn, signInStep(signIn));
}

export async function submitPassword(signIn: SignInClient, current: SignInStep, password: string): Promise<SignInOutcome> {
  const { error } = await signIn.password({ password });
  if (error) return { step: current, problem: inError(error, "password") };
  return enter(signIn, signInStep(signIn));
}

/** The person would rather get a code by email than type the password. */
export function switchToCode(signIn: SignInClient): Promise<SignInOutcome> {
  return enter(signIn, signInStep(signIn, "code"));
}

export function switchToPassword(signIn: SignInClient): SignInOutcome {
  return { step: signInStep(signIn, "password"), problem: null };
}

export async function startPasswordReset(signIn: SignInClient, current: SignInStep): Promise<SignInOutcome> {
  const { error } = await signIn.resetPasswordEmailCode.sendCode();
  if (error) return { step: current, problem: inError(error, "form") };
  return { step: { kind: "reset-code" }, problem: null };
}

export async function resendSignInCode(signIn: SignInClient, step: SignInStep): Promise<AuthProblem | null> {
  const error = await sendFor(signIn, step);
  return error ? inError(error, "code") : null;
}

async function verifyFor(signIn: SignInClient, step: SignInStep, code: string): Promise<unknown | null> {
  if (step.kind === "code") return (await signIn.emailCode.verifyCode({ code })).error;
  if (step.kind === "reset-code") return (await signIn.resetPasswordEmailCode.verifyCode({ code })).error;
  if (step.kind !== "second") return null;
  if (step.method === "totp") return (await signIn.mfa.verifyTOTP({ code })).error;
  if (step.method === "phone_code") return (await signIn.mfa.verifyPhoneCode({ code })).error;
  if (step.method === "email_code") return (await signIn.mfa.verifyEmailCode({ code })).error;
  return (await signIn.mfa.verifyBackupCode({ code })).error;
}

export async function verifySignInCode(signIn: SignInClient, step: SignInStep, code: string): Promise<SignInOutcome> {
  const error = await verifyFor(signIn, step, code);
  if (error) return { step, problem: inError(error, "code") };
  return enter(signIn, signInStep(signIn));
}

export async function submitNewPassword(signIn: SignInClient, password: string): Promise<SignInOutcome> {
  // Every other device is signed out: whoever knew the old password should not stay in.
  const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
  if (error) return { step: { kind: "new-password" }, problem: inError(error, "password") };
  return enter(signIn, signInStep(signIn));
}

export function chooseSecondMethod(signIn: SignInClient, method: SecondMethod): Promise<SignInOutcome> {
  return enter(signIn, secondStep(signIn, method));
}

/* ------------------------------------------------------------------ sign-up */

async function enterUp(signUp: SignUpClient, step: SignUpStep): Promise<SignUpOutcome> {
  if (step.kind !== "verify") return { step, problem: null };
  const { error } = await signUp.verifications.sendEmailCode();
  return { step, problem: error ? upError(error, "code") : null };
}

/**
 * Starts the account with the email alone. Clerk answers with what else it needs (a password, a name,
 * a tick for the terms), so the next screen asks only for that.
 */
export async function startSignUp(signUp: SignUpClient, email: string): Promise<SignUpOutcome> {
  const { error } = await signUp.create({ emailAddress: email.trim() });
  if (error) return { step: { kind: "email" }, problem: upError(error, "email") };
  return enterUp(signUp, signUpStep(signUp));
}

export type SignUpDetails = { password?: string; firstName?: string; lastName?: string; legalAccepted?: boolean };

export async function submitSignUpDetails(
  signUp: SignUpClient,
  /** The email typed on this page, or null when the account was started by Google and only needs finishing. */
  email: string | null,
  current: Extract<SignUpStep, { kind: "details" }>,
  details: SignUpDetails,
): Promise<SignUpOutcome> {
  const wants = (field: DetailField) => current.fields.includes(field);
  const extra = {
    ...(wants("first_name") ? { firstName: details.firstName?.trim() } : {}),
    ...(wants("last_name") ? { lastName: details.lastName?.trim() } : {}),
    ...(wants("legal_accepted") ? { legalAccepted: details.legalAccepted === true } : {}),
  };
  if (wants("password")) {
    // Clerk adds the password to the sign-up that is already under way. The email is sent again
    // only when it was typed on this page; a sign-up Google started keeps the address Google gave.
    const password = details.password ?? "";
    const { error } = await signUp.password(email ? { emailAddress: email.trim(), password, ...extra } : { password, ...extra });
    if (error) return { step: current, problem: upError(error, "password") };
  } else {
    const { error } = await signUp.update(extra);
    if (error) return { step: current, problem: upError(error, "name") };
  }
  return enterUp(signUp, signUpStep(signUp));
}

export async function resendSignUpCode(signUp: SignUpClient): Promise<AuthProblem | null> {
  const { error } = await signUp.verifications.sendEmailCode();
  return error ? upError(error, "code") : null;
}

export async function verifySignUpCode(signUp: SignUpClient, code: string): Promise<SignUpOutcome> {
  const { error } = await signUp.verifications.verifyEmailCode({ code });
  if (error) return { step: { kind: "verify" }, problem: upError(error, "code") };
  return enterUp(signUp, signUpStep(signUp));
}
