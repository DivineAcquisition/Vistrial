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
  const allowed = path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/");
  return allowed ? decoded : fallback;
}

export function isAuthPath(path: string): boolean {
  return path === "/sign-in" || path.startsWith("/sign-in/") || path === "/sign-up" || path.startsWith("/sign-up/");
}

export function isProtectedAppPath(path: string): boolean {
  return path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/");
}
