/** The Clerk production instance for vistrial.io. Every deployment accepts it. */
export const PRODUCTION_ISSUER = "https://clerk.vistrial.io";

/** The only deployment that may also accept a Clerk development instance: the shared dev deployment. */
export const DEV_DEPLOYMENT_URL = "https://calm-spider-678.convex.cloud";

/** Clerk development instances live here. Nothing else is accepted as a second issuer. */
const DEV_ISSUER = /^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev$/;

/**
 * Sign-in issuers for a deployment.
 *
 * Production, previews and every other deployment accept production Clerk only, and never read
 * CLERK_DEV_ISSUER_DOMAIN. Convex refuses an auth config that reads a variable the deployment does
 * not have, so the variable is read lazily, on the dev deployment only. There it must be set: to a
 * Clerk development domain (https://<name>.clerk.accounts.dev), or to "none".
 */
export function authIssuers(deploymentUrl: string | undefined, readDevIssuer: () => string | undefined): string[] {
  if (deploymentUrl !== DEV_DEPLOYMENT_URL) return [PRODUCTION_ISSUER];
  const issuer = readDevIssuer()?.trim().replace(/\/$/, "");
  if (!issuer || issuer === "none") return [PRODUCTION_ISSUER];
  if (!DEV_ISSUER.test(issuer)) {
    throw new Error("CLERK_DEV_ISSUER_DOMAIN must be a Clerk development domain (https://<name>.clerk.accounts.dev) or none.");
  }
  return [PRODUCTION_ISSUER, issuer];
}
