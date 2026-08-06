import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque tokens for invitations and share links. Only the hash is stored; the
 * raw value is shown once (in the email or to the admin who created the link).
 */

export function mintToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
