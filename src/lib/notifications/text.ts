import "server-only";

import { createPublicKey, verify, type KeyObject } from "node:crypto";

import { CONTACT_EMAIL } from "@/lib/constants";
import { containsContactDetails } from "@/lib/notifications/copy";
import { isCriticalEvent } from "@/lib/notifications/decisions";

/** Five texts per person per rolling day, until a dollar limit is set. */
export const TEXT_DAILY_CAP = 5;
export const TEXT_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Telnyx published US outbound SMS rate is $0.004 per part. Registered 10DLC
 * carrier fees are passed through: about $0.003 (T-Mobile, AT&T) to $0.005
 * (US Cellular). One Vistrial text is one part.
 */
export const TEXT_COST_USD = {
  telnyxPerPart: 0.004,
  carrierMin: 0.003,
  carrierMax: 0.005,
  estimatedMin: 0.007,
  estimatedMax: 0.009,
} as const;

/** The first build does not page staff after hours. */
export const STAFF_AFTER_HOURS_PAGING = false;

export const TEXT_OPT_IN_WORDING =
  "Text me only when something critical is broken. At most 5 texts a day. Reply STOP to opt out. Reply HELP for help. These texts do not include lead details.";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

type EnvFlag = { [key: string]: string | undefined };

export function textChannelEnabled(env: EnvFlag = process.env): boolean {
  return env.TELNYX_NOTIFICATIONS_ENABLED === "true" && env.TELNYX_REGISTRATION_CONFIRMED === "true";
}

export function telnyxNotificationFrom(env: EnvFlag = process.env): string | null {
  const from = env.TELNYX_NOTIFICATION_FROM?.trim();
  return from || null;
}

export function telnyxNotificationReady(env: EnvFlag = process.env): {
  apiKey: string;
  from: string;
} | null {
  if (!textChannelEnabled(env)) return null;
  const apiKey = env.TELNYX_API_KEY?.trim();
  const from = telnyxNotificationFrom(env);
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function textAllowedForEvent(eventType: string): boolean {
  return isCriticalEvent(eventType) || eventType === "test_send";
}

/** Fixed wording. Callers must not pass lead names into a text. */
export function criticalText(eventType: string): string | null {
  if (eventType === "ingestion_stalled") {
    return "Vistrial: new leads stopped arriving. Open Vistrial to restore them.";
  }
  if (eventType === "crm_broken") {
    return "Vistrial: the CRM connection broke. Open Vistrial to reconnect.";
  }
  if (eventType === "test_send") {
    return "Vistrial: this is a test. No lead details are included.";
  }
  return null;
}

export function withStopHelp(body: string): string {
  return `${body.trim()} Reply STOP to opt out. Reply HELP for help.`;
}

export function textHasLeadContent(value: string): boolean {
  return containsContactDetails(value);
}

export function textOptInAllows(args: { optedInAt: string | null; optedOutAt: string | null }): boolean {
  if (!args.optedInAt) return false;
  if (!args.optedOutAt) return true;
  return Date.parse(args.optedInAt) > Date.parse(args.optedOutAt);
}

export function overTextDailyCap(count: number): boolean {
  return count >= TEXT_DAILY_CAP;
}

export function inboundTextCommand(body: string): "stop" | "help" | null {
  const word = body.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "";
  if (STOP_WORDS.has(word)) return "stop";
  if (word === "help" || word === "info") return "help";
  return null;
}

export const TEXT_STOP_REPLY = "You will no longer get Vistrial texts. Email contact@vistrial.io if this was a mistake.";
export const TEXT_HELP_REPLY = `Vistrial texts you only when something critical is broken. Reply STOP to opt out. Email ${CONTACT_EMAIL} for help.`;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function samePhone(left: string, right: string): boolean {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.slice(-10) === b.slice(-10) && a.slice(-10).length === 10;
}

function ed25519PublicKey(base64: string): KeyObject {
  const raw = Buffer.from(base64, "base64");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

/** Telnyx signs `${timestamp}|${rawBody}` with the account public key. */
export function verifyTelnyxSignature(args: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKeyBase64: string;
  nowSeconds?: number;
}): boolean {
  if (!args.signature || !args.timestamp || !args.publicKeyBase64) return false;
  const stamped = Number(args.timestamp);
  if (!Number.isFinite(stamped)) return false;
  const now = args.nowSeconds ?? Date.now() / 1000;
  if (Math.abs(now - stamped) > 300) return false;
  try {
    const key = ed25519PublicKey(args.publicKeyBase64);
    return verify(null, Buffer.from(`${args.timestamp}|${args.rawBody}`), key, Buffer.from(args.signature, "base64"));
  } catch {
    return false;
  }
}

export async function sendTelnyxText(args: {
  to: string;
  body: string;
  env?: EnvFlag;
}): Promise<{ ok: true; providerId?: string } | { ok: false; error: string; retry: boolean }> {
  const cfg = telnyxNotificationReady(args.env);
  if (!cfg) {
    return { ok: false, error: "Text is off until the notification number is registered.", retry: false };
  }
  if (textHasLeadContent(args.body)) {
    return { ok: false, error: "Text was not sent. It included contact details.", retry: false };
  }
  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.from,
      to: args.to,
      text: args.body,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    data?: { id?: string };
    errors?: Array<{ detail?: string }>;
  };
  if (!response.ok) {
    return {
      ok: false,
      error: json.errors?.[0]?.detail || `Text send failed (${response.status})`,
      retry: response.status >= 500,
    };
  }
  return { ok: true, providerId: json.data?.id };
}
