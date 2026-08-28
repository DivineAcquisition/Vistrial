import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { OAUTH_STATE_TTL_SECONDS } from "@/lib/ghl/constants";
import { getTokenEncryptionKey } from "@/lib/ghl/crypto";
import type { SourceKind } from "@/types/database";

export type SourceOAuthState = {
  orgId: string;
  memberId: string;
  kind: SourceKind;
  nonce: string;
  exp: number;
};

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSourceOAuthState(
  orgId: string,
  memberId: string,
  kind: SourceKind,
  now = Date.now()
): string {
  const state: SourceOAuthState = {
    orgId,
    memberId,
    kind,
    nonce: randomBytes(16).toString("hex"),
    exp: now + OAUTH_STATE_TTL_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const mac = sign(payload, getTokenEncryptionKey());
  return `${payload}.${mac}`;
}

export function parseSourceOAuthState(value: string, now = Date.now()): SourceOAuthState | null {
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload, getTokenEncryptionKey());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SourceOAuthState;
    if (!parsed.orgId || !parsed.memberId || !parsed.kind || !parsed.nonce || !parsed.exp) return null;
    if (parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
