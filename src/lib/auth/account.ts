import type { SessionResource } from "@clerk/shared/types";

import { explainAuthError, type AuthProblem } from "@/lib/auth/errors";

/**
 * The account settings a person manages themselves: password, two-step sign-in and the devices that
 * are signed in. Clerk keeps all of it. This file holds the wording and the "confirm it is you"
 * steps Clerk asks for before a sensitive change.
 */

/* ------------------------------------------------------------------ devices */

export type DeviceActivity = {
  browserName?: string;
  deviceType?: string;
  isMobile?: boolean;
  city?: string;
  country?: string;
  ipAddress?: string;
};

/** "Chrome on Macintosh", "Safari on iPhone", or what little is known. */
export function deviceWords(activity: DeviceActivity | null | undefined): string {
  const browser = activity?.browserName?.trim();
  const device = activity?.deviceType?.trim();
  if (browser && device) return `${browser} on ${device}`;
  if (browser) return browser;
  if (device) return device;
  return activity?.isMobile ? "A phone or tablet" : "A browser";
}

/** "Dallas, US", or the network address when the place is not known. */
export function placeWords(activity: DeviceActivity | null | undefined): string {
  const place = [activity?.city, activity?.country].map((part) => part?.trim()).filter(Boolean).join(", ");
  return place || activity?.ipAddress?.trim() || "Place not known";
}

export function lastActiveWords(when: Date | number | null | undefined, now: number): string {
  if (!when) return "Not used recently";
  const minutes = Math.floor((now - new Date(when).getTime()) / 60_000);
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `Active ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "Active an hour ago" : `Active ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}

export type DeviceRow = { id: string; current: boolean; device: string; place: string; lastActive: string };

type SessionLike = { id: string; status?: string; lastActiveAt?: Date | number | null; latestActivity?: DeviceActivity | null };

/** This device first, then the most recently used. Ended sessions are left out. */
export function deviceRows(sessions: readonly SessionLike[], currentId: string | null | undefined, now: number): DeviceRow[] {
  const time = (session: SessionLike) => (session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0);
  return sessions
    .filter((session) => !session.status || session.status === "active")
    .slice()
    .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || time(b) - time(a))
    .map((session) => ({
      id: session.id,
      current: session.id === currentId,
      device: deviceWords(session.latestActivity),
      place: placeWords(session.latestActivity),
      lastActive: session.id === currentId ? "Active now" : lastActiveWords(session.lastActiveAt, now),
    }));
}

/* ------------------------------------------------------------------ two-step */

/** The set-up key in groups of four, the way authenticator apps show it. */
export function groupSecret(secret: string): string {
  return (secret.replace(/\s/g, "").match(/.{1,4}/g) ?? []).join(" ");
}

/* ------------------------------------------------------------------ confirm it is you */

type Factor = { strategy: string; safeIdentifier?: string; emailAddressId?: string; phoneNumberId?: string };

export const CONFIRM_SECOND_METHODS = ["totp", "phone_code", "backup_code"] as const;
export type ConfirmSecondMethod = (typeof CONFIRM_SECOND_METHODS)[number];

export type ConfirmStep =
  | { kind: "password"; canUseCode: boolean }
  | { kind: "code"; sentTo: string | null; emailAddressId: string; canUsePassword: boolean }
  | { kind: "second"; method: ConfirmSecondMethod; methods: ConfirmSecondMethod[]; phone: { id: string; sentTo: string | null } | null }
  | { kind: "done" }
  | { kind: "blocked" };

export type ConfirmSnapshot = {
  status: string;
  supportedFirstFactors?: readonly Factor[] | null;
  supportedSecondFactors?: readonly Factor[] | null;
};

export function confirmStep(snapshot: ConfirmSnapshot, prefer: "password" | "code" | ConfirmSecondMethod = "password"): ConfirmStep {
  if (snapshot.status === "complete") return { kind: "done" };
  if (snapshot.status === "needs_second_factor") {
    const factors = snapshot.supportedSecondFactors ?? [];
    const methods = CONFIRM_SECOND_METHODS.filter((method) => factors.some((factor) => factor.strategy === method));
    const method = methods.find((candidate) => candidate === prefer) ?? methods[0];
    if (!method) return { kind: "blocked" };
    const phone = factors.find((factor) => factor.strategy === "phone_code");
    return { kind: "second", method, methods, phone: phone?.phoneNumberId ? { id: phone.phoneNumberId, sentTo: phone.safeIdentifier ?? null } : null };
  }
  const factors = snapshot.supportedFirstFactors ?? [];
  const password = factors.some((factor) => factor.strategy === "password");
  const email = factors.find((factor) => factor.strategy === "email_code" && factor.emailAddressId);
  if (password && !(email && prefer === "code")) return { kind: "password", canUseCode: Boolean(email) };
  if (email?.emailAddressId) {
    return { kind: "code", sentTo: email.safeIdentifier ?? null, emailAddressId: email.emailAddressId, canUsePassword: password };
  }
  return { kind: "blocked" };
}

export type ConfirmClient = Pick<
  SessionResource,
  | "startVerification"
  | "prepareFirstFactorVerification"
  | "attemptFirstFactorVerification"
  | "prepareSecondFactorVerification"
  | "attemptSecondFactorVerification"
>;

export type ConfirmOutcome = { step: ConfirmStep; problem: AuthProblem | null };

const confirmError = (error: unknown, field: AuthProblem["field"]) => explainAuthError(error, { flow: "sign-in", field });

async function sendConfirmCode(session: ConfirmClient, step: ConfirmStep): Promise<void> {
  if (step.kind === "code") await session.prepareFirstFactorVerification({ strategy: "email_code", emailAddressId: step.emailAddressId });
  if (step.kind === "second" && step.method === "phone_code" && step.phone) {
    await session.prepareSecondFactorVerification({ strategy: "phone_code", phoneNumberId: step.phone.id });
  }
}

async function enterConfirm(session: ConfirmClient, step: ConfirmStep): Promise<ConfirmOutcome> {
  try {
    await sendConfirmCode(session, step);
    return { step, problem: null };
  } catch (error) {
    return { step, problem: confirmError(error, "code") };
  }
}

/** Starts the check Clerk asks for before a sensitive change, and sends a code when that is the way in. */
export async function startConfirm(
  session: ConfirmClient,
  level: "first_factor" | "second_factor" | "multi_factor" | undefined,
  prefer?: "password" | "code" | ConfirmSecondMethod,
): Promise<ConfirmOutcome> {
  try {
    const check = await session.startVerification({ level: level ?? "first_factor" });
    return await enterConfirm(session, confirmStep(check, prefer));
  } catch (error) {
    return { step: { kind: "blocked" }, problem: confirmError(error, "form") };
  }
}

export async function submitConfirm(session: ConfirmClient, step: ConfirmStep, value: string): Promise<ConfirmOutcome> {
  try {
    let check;
    if (step.kind === "password") check = await session.attemptFirstFactorVerification({ strategy: "password", password: value });
    else if (step.kind === "code") check = await session.attemptFirstFactorVerification({ strategy: "email_code", code: value });
    else if (step.kind === "second") check = await session.attemptSecondFactorVerification({ strategy: step.method, code: value });
    else return { step, problem: null };
    return await enterConfirm(session, confirmStep(check));
  } catch (error) {
    return { step, problem: confirmError(error, step.kind === "password" ? "password" : "code") };
  }
}

/** Another second-step method for the same check. The first step is not asked for again. */
export function switchConfirmSecond(session: ConfirmClient, step: Extract<ConfirmStep, { kind: "second" }>, method: ConfirmSecondMethod): Promise<ConfirmOutcome> {
  return enterConfirm(session, step.methods.includes(method) ? { ...step, method } : step);
}

export async function resendConfirmCode(session: ConfirmClient, step: ConfirmStep): Promise<AuthProblem | null> {
  return (await enterConfirm(session, step)).problem;
}

/** True when the person closed the "confirm it is you" window. Nothing went wrong, so nothing is shown. */
export function isConfirmCancelled(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "reverification_cancelled";
}

/** The words for a failed account change. `currentPassword` is set when the old password was part of the request. */
export function explainAccountError(error: unknown, field: AuthProblem["field"], currentPassword = false): AuthProblem {
  const problem = explainAuthError(error, { flow: "sign-up", field });
  if (currentPassword && problem.message === "That password is not right.") {
    return { field: "form", message: "The current password is not right." };
  }
  return { field: problem.field, message: problem.message };
}
