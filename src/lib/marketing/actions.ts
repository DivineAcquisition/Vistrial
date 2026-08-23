"use server";

import { cookies } from "next/headers";

import {
  auditGhlWebhookUrl,
  calendarHref,
  PREFILL_COOKIE,
  type TrackingParamKey,
} from "@/lib/marketing/config";
import {
  ghlWebhookBody,
  isHoneypot,
  parseContact,
  parseQualification,
  parseWaitlist,
  QualificationError,
  type ContactInput,
  type QualificationInput,
  type QualificationPayload,
  type WaitlistInput,
} from "@/lib/marketing/qualify";

export type QualifyResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; field?: string };

export type ContactResult = { ok: true } | { ok: false; error: string; field?: string };

export type WaitlistResult = { ok: true } | { ok: false; error: string; field?: string };

function calendarRedirect(tracking: QualificationInput["tracking"]): string {
  return calendarHref(tracking?.from);
}

async function postWebhook(body: Record<string, unknown>): Promise<boolean> {
  const url = auditGhlWebhookUrl();
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function storePrefill(payload: QualificationPayload) {
  const jar = await cookies();
  jar.set(
    PREFILL_COOKIE,
    JSON.stringify({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    }
  );
}

export async function submitQualification(input: QualificationInput): Promise<QualifyResult> {
  if (isHoneypot(input)) {
    return { ok: true, redirectTo: calendarRedirect(input.tracking) };
  }

  let payload: QualificationPayload;
  try {
    payload = parseQualification(input);
  } catch (error) {
    if (error instanceof QualificationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, error: "We could not submit that just now. Try again in a moment." };
  }

  await storePrefill(payload);
  await postWebhook(ghlWebhookBody(payload));
  return { ok: true, redirectTo: calendarRedirect(payload.tracking) };
}

export async function submitContact(input: ContactInput): Promise<ContactResult> {
  if (isHoneypot(input)) return { ok: true };

  try {
    const payload = parseContact(input);
    await postWebhook({
      fullName: payload.fullName,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      message: payload.message,
      source: payload.source,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof QualificationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, error: "We could not send that just now. Try again in a moment." };
  }
}

export async function submitWaitlist(input: WaitlistInput): Promise<WaitlistResult> {
  if (isHoneypot(input)) return { ok: true };

  try {
    const payload = parseWaitlist(input);
    await postWebhook({
      fullName: payload.fullName,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      source: payload.source,
      entryPoint: payload.entryPoint,
      entry_point: payload.entryPoint,
      ctaPosition: payload.ctaPosition,
      cta_position: payload.ctaPosition,
      tags: payload.tags,
      ...payload.tracking,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof QualificationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, error: "We could not join that just now. Try again in a moment." };
  }
}

export type TrackingMap = Partial<Record<TrackingParamKey, string>>;
