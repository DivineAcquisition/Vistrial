import { postAuthPath } from "@/lib/auth/paths";
import type { ProductHost } from "@/lib/marketing/hosts";
import { FORSIGHT_PATH } from "@/lib/navigation";
import type { SurfaceAccess } from "@/types/database";

/**
 * Fallback after login when the request did not name a destination.
 * The host decides the product; role landing inside that product is separate.
 */
export function defaultInternalPath(product: ProductHost): string {
  if (product === "stellar") return "/stellar";
  if (product === "pulse") return FORSIGHT_PATH;
  return "/app/queue";
}

/**
 * Signed-in destination for this host. Stellar never lands in /app or /portal;
 * those surfaces live on app.vistrial.io. Pulse keeps /app paths because it is
 * a front door into the same operator app.
 */
export function signedInPath(args: {
  product: ProductHost;
  next: string;
  surfaceAccess?: SurfaceAccess;
  /** DA operators have no org membership; they belong on the Stellar host. */
  stellarDaOperator?: boolean;
}): string {
  if (args.stellarDaOperator || args.product === "stellar") {
    if (args.next.startsWith("/stellar") || args.next.startsWith("/accept-invite/")) {
      return args.next;
    }
    return "/stellar";
  }
  return postAuthPath(args.next, args.surfaceAccess);
}
