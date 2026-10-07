import type { StellarAuthContext } from "@/lib/stellar/types";

export const STELLAR_LOG_PATH = "/stellar/log";
export const STELLAR_PORTAL_PATH = "/stellar/portal";
export const STELLAR_CONSOLE_PATH = "/stellar/console";

/**
 * Where each Stellar identity lands. A placed setter opens their log, other
 * staff the DA console, and a client the portal. Each identity has exactly one
 * landing path.
 */
export function stellarLandingPath(ctx: StellarAuthContext): string {
  if (ctx.kind === "da_operator") return ctx.setter ? STELLAR_LOG_PATH : STELLAR_CONSOLE_PATH;
  return STELLAR_PORTAL_PATH;
}
