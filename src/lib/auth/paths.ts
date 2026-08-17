/** Relative in-app paths only. Rejects protocol-relative and off-site URLs. */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/app"
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

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/accept-invite/${token}`;
}

export function authCallbackUrl(next?: string): string {
  const url = new URL("/auth/callback", `${appUrl()}/`);
  if (next && next !== "/app") {
    url.searchParams.set("next", next);
  }
  return url.toString();
}
