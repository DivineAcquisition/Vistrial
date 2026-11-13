"use server";

import {
  auditGhlWebhookUrl,
  type TrackingParamKey,
} from "@/lib/marketing/config";
import {
  isHoneypot,
  parseContact,
  parseWaitlist,
  QualificationError,
  type ContactInput,
  type WaitlistInput,
} from "@/lib/marketing/qualify";

export type ContactResult = { ok: true } | { ok: false; error: string; field?: string };

export type WaitlistResult = { ok: true } | { ok: false; error: string; field?: string };

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
