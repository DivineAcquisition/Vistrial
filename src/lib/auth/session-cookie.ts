import { SITE_HOST, hostnameFromHostHeader } from "@/lib/marketing/hosts";

/**
 * app, admin, pulse, and forsight are all subdomains of vistrial.io and staff
 * are redirected between them. A host-only session cookie would make every
 * hop look signed out, so production shares one cookie across the domain.
 *
 * The name differs from the Supabase default so a leftover host-only cookie
 * can never shadow the shared one (browsers send the older cookie first).
 */
export const SESSION_COOKIE_NAME = "sb-vistrial-session";

export function sessionCookieDomain(host: string | null | undefined): string | undefined {
  const hostname = hostnameFromHostHeader(host);
  if (hostname === SITE_HOST || hostname.endsWith(`.${SITE_HOST}`)) return `.${SITE_HOST}`;
  return undefined;
}

export function sessionCookieOptions(host: string | null | undefined) {
  const domain = sessionCookieDomain(host);
  return domain ? { name: SESSION_COOKIE_NAME, domain } : { name: SESSION_COOKIE_NAME };
}
