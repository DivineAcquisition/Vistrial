import type { AuthConfig } from "convex/server";

/**
 * Clerk development instance for Vistrial.
 * The session token audience is "convex", and secondFactor comes from
 * Clerk's token settings, never from client input.
 */
const authConfig = {
  providers: [
    {
      domain: "https://safe-mollusk-2369.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

export default authConfig;
