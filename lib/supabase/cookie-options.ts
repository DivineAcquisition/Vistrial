import type { HostSurface } from "@/lib/hosts";
import { cookieNameForSurface, isLocalHost } from "@/lib/hosts";

/**
 * Session cookies are scoped to the exact host that set them — never to
 * `.vistrial.io`. A parent-domain cookie would be readable by every subdomain.
 */
export function authCookieOptions(input: {
  hostHeader: string | null;
  surface: HostSurface;
}) {
  const local = isLocalHost(input.hostHeader);

  return {
    name: cookieNameForSurface(input.surface),
    path: "/",
    sameSite: "lax" as const,
    secure: !local,
    httpOnly: true,
    // Intentionally omit `domain` so the browser treats the cookie as host-only.
  };
}

/**
 * Merge provider cookie options with our host-isolation rules. Strips any
 * `domain` the library might supply so nothing lands on the parent domain.
 */
export function enforceHostOnlyCookieOptions<
  T extends Record<string, unknown> | undefined,
>(
  options: T,
  defaults: ReturnType<typeof authCookieOptions>
): {
  path: string;
  sameSite: "lax";
  secure: boolean;
  httpOnly: boolean;
  name: string;
} & Omit<NonNullable<T>, "domain"> {
  const merged: Record<string, unknown> = { ...(options ?? {}) };
  delete merged.domain;
  return {
    ...merged,
    name: defaults.name,
    path: "/",
    sameSite: "lax",
    secure: defaults.secure,
    httpOnly: true,
  } as {
    path: string;
    sameSite: "lax";
    secure: boolean;
    httpOnly: boolean;
    name: string;
  } & Omit<NonNullable<T>, "domain">;
}
