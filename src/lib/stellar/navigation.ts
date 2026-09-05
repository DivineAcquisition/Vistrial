import type { StellarAuthContext } from "@/lib/stellar/types";

export const STELLAR_LOG_PATH = "/stellar/log";
export const STELLAR_PORTAL_PATH = "/stellar/portal";
export const STELLAR_CONSOLE_PATH = "/stellar/console";

/**
 * Where each Stellar identity lands. A setter never sees the portal or
 * console path, a client_viewer never sees the log or console path, and a
 * da_operator never sees the log or portal path — there is no shared
 * landing page that then hides items, each role has exactly one path.
 */
export function stellarLandingPath(ctx: StellarAuthContext): string {
  if (ctx.kind === "da_operator") return STELLAR_CONSOLE_PATH;
  if (ctx.member.role === "client_viewer") return STELLAR_PORTAL_PATH;
  return STELLAR_LOG_PATH;
}
