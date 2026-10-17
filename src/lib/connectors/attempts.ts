import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type AttemptClaims = {
  orgId: string;
  memberId: string;
  connectorKey: string;
  nonce: string;
  exp: number;
};

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createAttemptState(args: {
  orgId: string;
  memberId: string;
  connectorKey: string;
  secret: string;
  now?: number;
}): string {
  const claims: AttemptClaims = {
    orgId: args.orgId,
    memberId: args.memberId,
    connectorKey: args.connectorKey,
    nonce: randomBytes(16).toString("hex"),
    exp: (args.now ?? Date.now()) + ATTEMPT_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload, args.secret)}`;
}

export function openAttemptState(args: {
  state: string;
  secret: string;
  now?: number;
}): { ok: true; claims: AttemptClaims } | { ok: false; reason: "expired" | "mismatch" } {
  const [payload, mac] = args.state.split(".");
  if (!payload || !mac) return { ok: false, reason: "mismatch" };
  const expected = sign(payload, args.secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };
  let claims: AttemptClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AttemptClaims;
  } catch {
    return { ok: false, reason: "mismatch" };
  }
  if (!claims.orgId || !claims.memberId || !claims.nonce || !claims.exp || !claims.connectorKey) {
    return { ok: false, reason: "mismatch" };
  }
  if (claims.exp < (args.now ?? Date.now())) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export function readAttemptState(args: {
  state: string;
  secret: string;
  orgId: string;
  memberId: string;
  connectorKey: string;
  now?: number;
}): { ok: true; claims: AttemptClaims } | { ok: false; reason: "expired" | "mismatch" } {
  const [payload, mac] = args.state.split(".");
  if (!payload || !mac) return { ok: false, reason: "mismatch" };
  const expected = sign(payload, args.secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };
  let claims: AttemptClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AttemptClaims;
  } catch {
    return { ok: false, reason: "mismatch" };
  }
  if (!claims.orgId || !claims.memberId || !claims.nonce || !claims.exp) return { ok: false, reason: "mismatch" };
  if (claims.exp < (args.now ?? Date.now())) return { ok: false, reason: "expired" };
  if (claims.orgId !== args.orgId || claims.memberId !== args.memberId || claims.connectorKey !== args.connectorKey) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, claims };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newVerifier(): string {
  return randomBytes(32).toString("base64url");
}
