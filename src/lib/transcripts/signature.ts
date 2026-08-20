import { createHmac, timingSafeEqual } from "node:crypto";

function normalizeSignature(value: string): string {
  return value.trim().replace(/^sha256=/i, "").toLowerCase();
}

export function signatureHeader(headers: Headers): string | null {
  const names = [
    "x-webhook-signature",
    "x-vistrial-signature",
    "x-fathom-signature",
    "x-fireflies-signature",
    "x-hub-signature-256",
    "x-zm-signature",
    "x-zm-signature-256",
  ];
  for (const name of names) {
    const found = headers.get(name);
    if (found?.trim()) return found;
  }
  return null;
}

export function hmacSha256Hex(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function signaturesMatch(secret: string, rawBody: string, provided: string | null): boolean {
  if (!provided) return false;
  const expected = Buffer.from(hmacSha256Hex(secret, rawBody), "utf8");
  const actual = Buffer.from(normalizeSignature(provided), "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
