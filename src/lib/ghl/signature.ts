import { createPublicKey, createVerify, verify as verifySignature } from "node:crypto";

import {
  GHL_ED25519_PUBLIC_KEY_DEFAULT,
  GHL_RSA_PUBLIC_KEY_DEFAULT,
} from "@/lib/ghl/constants";

export type SignatureResult =
  | { ok: true; method: "ed25519" | "rsa" }
  | { ok: false; reason: "missing" | "invalid" };

function pemFromEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw.includes("BEGIN") ? raw : `-----BEGIN PUBLIC KEY-----\n${raw}\n-----END PUBLIC KEY-----`;
}

export function ed25519PublicKeyPem(): string {
  return pemFromEnv("GHL_WEBHOOK_ED25519_PUBLIC_KEY", GHL_ED25519_PUBLIC_KEY_DEFAULT);
}

export function rsaPublicKeyPem(): string {
  return pemFromEnv("GHL_WEBHOOK_RSA_PUBLIC_KEY", GHL_RSA_PUBLIC_KEY_DEFAULT);
}

export function verifyEd25519(rawBody: string, signatureB64: string, pem = ed25519PublicKeyPem()): boolean {
  if (!signatureB64 || signatureB64 === "N/A") return false;
  try {
    const key = createPublicKey(pem);
    return verifySignature(null, Buffer.from(rawBody, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function verifyRsaSha256(rawBody: string, signatureB64: string, pem = rsaPublicKeyPem()): boolean {
  if (!signatureB64 || signatureB64 === "N/A") return false;
  try {
    const verifier = createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(pem, signatureB64, "base64");
  } catch {
    return false;
  }
}

/**
 * Prefer X-GHL-Signature (Ed25519). Fall back to legacy X-WH-Signature (RSA)
 * only when the Ed25519 header is absent.
 */
export function verifyGhlWebhookSignature(args: {
  rawBody: string;
  ghlSignature: string | null;
  legacySignature: string | null;
  ed25519Pem?: string;
  rsaPem?: string;
}): SignatureResult {
  const ghl = args.ghlSignature?.trim() || null;
  const legacy = args.legacySignature?.trim() || null;

  if (ghl) {
    const ok = verifyEd25519(args.rawBody, ghl, args.ed25519Pem ?? ed25519PublicKeyPem());
    return ok ? { ok: true, method: "ed25519" } : { ok: false, reason: "invalid" };
  }
  if (legacy) {
    const ok = verifyRsaSha256(args.rawBody, legacy, args.rsaPem ?? rsaPublicKeyPem());
    return ok ? { ok: true, method: "rsa" } : { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "missing" };
}

export function signatureHeaders(headers: Headers): {
  ghlSignature: string | null;
  legacySignature: string | null;
} {
  return {
    ghlSignature: headers.get("x-ghl-signature"),
    legacySignature: headers.get("x-wh-signature"),
  };
}
