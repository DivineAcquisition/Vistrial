import type { AuthConfig } from "convex/server";

/**
 * Clerk production instance for vistrial.io.
 * The session token audience is "convex", and secondFactor comes from
 * Clerk's token settings, never from client input.
 */
const authConfig = {
  providers: [
    {
      domain: "https://clerk.vistrial.io",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

export default authConfig;
