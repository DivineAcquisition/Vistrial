import type { AuthConfig } from "convex/server";

/**
 * Clerk is the auth provider. Register it after CLERK_JWT_ISSUER_DOMAIN
 * is set on the Convex deployment. Until then there is no issuer.
 * Workspace functions stay closed until a provider is registered here.
 * The secondFactor claim is added in Clerk's token settings, not in client code.
 */
const authConfig = {
  providers: [],
} satisfies AuthConfig;

export default authConfig;
