import type { AuthConfig } from "convex/server";

import { authIssuers } from "./lib/authIssuers";

/**
 * Clerk production instance for vistrial.io on every deployment. The shared dev deployment also
 * accepts the Clerk development instance named by CLERK_DEV_ISSUER_DOMAIN (see lib/authIssuers.ts).
 * The session token audience is "convex", and secondFactor comes from
 * Clerk's token settings, never from client input.
 */
const authConfig = {
  providers: authIssuers(process.env.CONVEX_CLOUD_URL, () => process.env.CLERK_DEV_ISSUER_DOMAIN).map((domain) => ({
    domain,
    applicationID: "convex",
  })),
} satisfies AuthConfig;

export default authConfig;
