import type { AuthConfig } from "convex/server";

/**
 * Clerk issuer for this deployment.
 * Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard.
 * The secondFactor claim is added in Clerk's token settings, not in client code.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

export default authConfig;
