import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { OAUTH_STATE_TTL_SECONDS } from "@/lib/ghl/constants";
import { getTokenEncryptionKey } from "@/lib/ghl/crypto";
import type { ExecutionKind } from "@/lib/execution/kinds";

export type ExecutionOAuthState = {
  /** Keeps a state minted for the read-only sources from being replayed here. */
  purpose: "execution";
  orgId: string;
  memberId: string;
  kind: ExecutionKind;
  nonce: string;
  exp: number;
};

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createExecutionOAuthState(
  orgId: string,
  memberId: string,
  kind: ExecutionKind,
  now = Date.now()
): string {
  const state: ExecutionOAuthState = {
    purpose: "execution",
    orgId,
    memberId,
    kind,
    nonce: randomBytes(16).toString("hex"),
    exp: now + OAUTH_STATE_TTL_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload, getTokenEncryptionKey())}`;
}

export function parseExecutionOAuthState(value: string, now = Date.now()): ExecutionOAuthState | null {
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload, getTokenEncryptionKey());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ExecutionOAuthState;
    if (parsed.purpose !== "execution") return null;
    if (!parsed.orgId || !parsed.memberId || !parsed.kind || !parsed.nonce || !parsed.exp) return null;
    if (parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
