/** How long a password, authenticator code, or recovery code stays "recent". */
export const RECENT_AUTH_MS = 15 * 60 * 1000;

export type RecentAuth = "ok" | "stale" | "needs_totp" | "needs_setup";

export type AuthMethod = { method: string; timestamp: number };

const PASSWORD_METHODS = new Set(["password", "otp", "magiclink", "oauth"]);

function atMillis(timestamp: number): number {
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

/** Methods whose timestamp is inside the recent window. */
export function freshMethods(methods: AuthMethod[], now: number): AuthMethod[] {
  return methods.filter((method) => now - atMillis(method.timestamp) <= RECENT_AUTH_MS && now >= atMillis(method.timestamp));
}

/**
 * Sensitive staff actions need a check from the last 15 minutes.
 * Someone enrolled in an authenticator app must use that app (or a recovery
 * code). Before enforcement, or during the grace period, a recent password
 * sign-in is enough. Once the grace period has passed, they enroll first.
 */
export function evaluateRecentAuth(input: {
  methods: AuthMethod[];
  enrolled: boolean;
  /** When enforcement applies to this person. Null means it is not on. */
  deadline: string | null;
  grantUntil: string | null;
  now: number;
}): RecentAuth {
  const fresh = freshMethods(input.methods, input.now);
  const totp = fresh.some((method) => method.method === "totp");
  const password = fresh.some((method) => PASSWORD_METHODS.has(method.method));
  const grant = input.grantUntil !== null && Date.parse(input.grantUntil) > input.now;
  if (input.enrolled) return totp || grant ? "ok" : "needs_totp";
  const deadline = input.deadline ? Date.parse(input.deadline) : null;
  if (deadline !== null && Number.isFinite(deadline) && deadline <= input.now) return "needs_setup";
  return password || totp || grant ? "ok" : "stale";
}
