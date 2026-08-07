/**
 * Hostname surfaces for the single deployment.
 *
 * admin.vistrial.io → staff workspace
 * app.vistrial.io   → client portal
 *
 * Isolation is structural: session cookies are host-scoped, and a route that
 * belongs to one surface returns not found on the other.
 */

export const STAFF_HOST = "admin.vistrial.io";
export const CLIENT_HOST = "app.vistrial.io";

export type HostSurface = "staff" | "client" | "local" | "unknown";

/** Strip port and lowercase. */
export function normalisedHost(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function hostSurface(hostHeader: string | null): HostSurface {
  const host = normalisedHost(hostHeader);
  if (host === STAFF_HOST) return "staff";
  if (host === CLIENT_HOST) return "client";
  // GAP: local development has no dual-host setup. Path-based surface
  // separation still applies; cookie isolation across populations is not
  // structurally enforced on a single localhost host.
  if (host === "localhost" || host === "127.0.0.1") return "local";
  return "unknown";
}

/** Paths that belong to the client portal population. */
export function isClientPath(pathname: string): boolean {
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return true;
  if (pathname.startsWith("/invite/")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
}

/** Paths that belong to the staff workspace population. */
export function isStaffPath(pathname: string): boolean {
  if (isClientPath(pathname)) return false;
  // Root is resolved per host in the proxy (redirect), not treated as either
  // surface's private route for cross-host 404 purposes.
  if (pathname === "/") return false;
  return true;
}

/**
 * Whether this pathname may be served on the given host surface.
 * Unknown hosts never match. Local allows both surfaces.
 */
export function pathAllowedOnHost(surface: HostSurface, pathname: string): boolean {
  if (surface === "unknown") return false;
  if (surface === "local") return true;
  if (pathname === "/") return true;
  if (surface === "client") return isClientPath(pathname);
  return isStaffPath(pathname);
}

export function cookieNameForSurface(surface: HostSurface): string {
  if (surface === "client") return "sb-vistrial-client-auth";
  return "sb-vistrial-staff-auth";
}

export function isLocalHost(hostHeader: string | null): boolean {
  const host = normalisedHost(hostHeader);
  return host === "localhost" || host === "127.0.0.1";
}
