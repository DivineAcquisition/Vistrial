import { appUrl } from "@/lib/app-url";

/**
 * Relative in-app paths only. Rejects protocol-relative and off-site URLs.
 *
 * This gates the `redirect` query param on /login and the `next` carried through
 * the magic-link callback, both of which an attacker can set by sending someone
 * a link to our own domain. Anything that escapes this ends up as a redirect
 * that happens after the victim authenticates.
 *
 * Prefix checks alone are not enough, because the value is re-parsed as a URL
 * before the browser follows it:
 *   - backslashes count as "/" in http(s) URLs, so "/\evil.com" is
 *     protocol-relative by the time it is resolved
 *   - tabs and newlines are stripped during parsing, so "/\t/evil.com" becomes
 *     "//evil.com"
 * So resolve the value the way a browser would and keep it only if it stayed on
 * our own origin.
 */
const INTERNAL_BASE = "https://internal.invalid";

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/app/queue"
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // C0 controls and DEL: stripped by URL parsers, so they can smuggle a "//".
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (value.includes("://")) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(value, INTERNAL_BASE);
  } catch {
    return fallback;
  }
  if (resolved.origin !== INTERNAL_BASE) return fallback;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function isAcceptInvitePath(path: string): boolean {
  return path.startsWith("/accept-invite/");
}

export function inviteTokenFromPath(path: string): string | null {
  const match = path.match(/^\/accept-invite\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export { appUrl };

export function inviteUrl(token: string): string {
  return `${appUrl()}/accept-invite/${token}`;
}

export function authCallbackUrl(next?: string, origin = appUrl()): string {
  const url = new URL("/auth/callback", `${origin.replace(/\/$/, "")}/`);
  if (next && next !== "/app") {
    url.searchParams.set("next", next);
  }
  return url.toString();
}

export function postAuthPath(next: string, surfaceAccess?: "operator" | "portal"): string {
  if (isAcceptInvitePath(next)) return next;
  if (surfaceAccess === "portal") {
    return next.startsWith("/portal") ? next : "/portal";
  }
  if (next.startsWith("/portal") || next.startsWith("/app")) return next;
  return "/app/queue";
}

/** Paths that must refresh the Auth session so PostgREST calls are not anonymous. */
export function pathRefreshesAuthSession(path: string): boolean {
  return (
    path.startsWith("/app") ||
    path.startsWith("/portal") ||
    path === "/login" ||
    path === "/no-access" ||
    path.startsWith("/auth/") ||
    path.startsWith("/accept-invite/")
  );
}
