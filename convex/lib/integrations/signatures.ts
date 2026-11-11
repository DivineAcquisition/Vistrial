/**
 * Checks that a webhook really came from the provider, before anything in its body is read as data.
 * Each scheme is the provider's documented one (links in docs/rebuild/integrations-setup.md). A request
 * that fails is refused and nothing from it is kept.
 */

export type SignatureScheme =
  /** `Calendly-Webhook-Signature: t=<unix seconds>,v1=<hex>`; HMAC-SHA256 of `<t>.<body>`. */
  | "calendly"
  /** Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`; HMAC-SHA256 of `<id>.<timestamp>.<body>` with the base64 part of a `whsec_` secret. */
  | "standardWebhooks"
  /** `x-hub-signature: sha256=<hex>`; HMAC-SHA256 of the body. */
  | "hubSha256";

export const TOLERANCE_SECONDS = 5 * 60;

export type Verdict = { ok: true; deliveryId: string | null } | { ok: false; code: "missing" | "malformed" | "stale" | "mismatch" };

async function hmac(key: Uint8Array, message: string) {
  const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(message)));
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string) {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Compares without stopping at the first difference, so timing does not leak how much matched. */
export function sameText(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function fresh(timestampSeconds: number, nowMs: number) {
  return Number.isFinite(timestampSeconds) && Math.abs(nowMs / 1000 - timestampSeconds) <= TOLERANCE_SECONDS;
}

export async function verifyWebhook(input: {
  scheme: SignatureScheme;
  secret: string;
  headers: Headers;
  body: string;
  now: number;
}): Promise<Verdict> {
  const { scheme, secret, headers, body, now } = input;
  if (!secret) return { ok: false, code: "missing" };

  if (scheme === "calendly") {
    const header = headers.get("calendly-webhook-signature");
    if (!header) return { ok: false, code: "missing" };
    const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=") as [string, string]));
    if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) return { ok: false, code: "malformed" };
    if (!fresh(Number(parts.t), now)) return { ok: false, code: "stale" };
    const expected = hex(await hmac(new TextEncoder().encode(secret), `${parts.t}.${body}`));
    return sameText(expected, parts.v1.toLowerCase()) ? { ok: true, deliveryId: null } : { ok: false, code: "mismatch" };
  }

  if (scheme === "standardWebhooks") {
    const id = headers.get("webhook-id");
    const timestamp = headers.get("webhook-timestamp");
    const header = headers.get("webhook-signature");
    if (!id || !timestamp || !header) return { ok: false, code: "missing" };
    if (!/^\d+$/.test(timestamp)) return { ok: false, code: "malformed" };
    if (!fresh(Number(timestamp), now)) return { ok: false, code: "stale" };
    const key = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
    if (!key) return { ok: false, code: "malformed" };
    const expected = base64(await hmac(key, `${id}.${timestamp}.${body}`));
    // The header may carry several space-separated signatures while a secret is being rotated.
    const offered = header.split(" ").map((part) => part.trim()).filter((part) => part.startsWith("v1,")).map((part) => part.slice(3));
    if (offered.length === 0) return { ok: false, code: "malformed" };
    return offered.some((value) => sameText(expected, value)) ? { ok: true, deliveryId: id } : { ok: false, code: "mismatch" };
  }

  const header = headers.get("x-hub-signature");
  if (!header) return { ok: false, code: "missing" };
  const offered = header.startsWith("sha256=") ? header.slice(7) : header;
  if (!/^[0-9a-fA-F]{64}$/.test(offered)) return { ok: false, code: "malformed" };
  const expected = hex(await hmac(new TextEncoder().encode(secret), body));
  return sameText(expected, offered.toLowerCase()) ? { ok: true, deliveryId: null } : { ok: false, code: "mismatch" };
}

/** A stable id for a delivery that has none of its own, so a repeat is recognised. */
export async function bodyDigest(body: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))).slice(0, 40);
}
