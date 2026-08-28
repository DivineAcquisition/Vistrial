import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const PREFIX = "v1";

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const fromB64 = Buffer.from(trimmed, "base64");
  if (fromB64.length === 32) return fromB64;
  // Deterministic fallback for mis-sized secrets so deploys fail closed only
  // when the env var is missing entirely. A short secret is stretched.
  if (trimmed.length > 0) {
    return scryptSync(trimmed, "vistrial-ghl-token-v1", 32);
  }
  throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not set.");
}

export function getTokenEncryptionKey(env = process.env): Buffer {
  const raw = env.GHL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("GHL_TOKEN_ENCRYPTION_KEY is not set.");
  }
  return parseKey(raw);
}

/**
 * AES-256-GCM. Format: v1.<iv_b64>.<tag_b64>.<cipher_b64>
 * Never log the plaintext or the ciphertext blob.
 */
export function encryptSecret(plaintext: string, key = getTokenEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string, key = getTokenEncryptionKey()): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Unrecognized secret payload.");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const encrypted = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
