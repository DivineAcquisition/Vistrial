/** Where a signed-in person may land. Anything else stays on the workspace. */
export function safeAppPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://")) {
    return fallback;
  }
  const path = decoded.split("?")[0]?.split("#")[0] ?? "";
  const allowed =
    path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/") || path === "/join";
  return allowed ? decoded : fallback;
}

export function isAuthPath(path: string): boolean {
  return path === "/sign-in" || path.startsWith("/sign-in/") || path === "/sign-up" || path.startsWith("/sign-up/");
}

export function isProtectedAppPath(path: string): boolean {
  return path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/");
}

/** A link to the sign-in or sign-up page that keeps where the person was headed. */
export function authHref(page: "/sign-in" | "/sign-up", redirectTo: string): string {
  return `${page}?redirect_url=${encodeURIComponent(safeAppPath(redirectTo))}`;
}

/** Where Google sends the browser back to. `from` is the page the person started on. */
export function ssoCallbackPath(redirectTo: string, from: "sign-in" | "sign-up"): string {
  return `/sign-in/sso-callback?from=${from}&redirect_url=${encodeURIComponent(safeAppPath(redirectTo))}`;
}
