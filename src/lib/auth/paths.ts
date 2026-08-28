import { appUrl } from "@/lib/app-url";

/** Relative in-app paths only. Rejects protocol-relative and off-site URLs. */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/app/queue"
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
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
