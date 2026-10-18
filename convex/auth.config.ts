import type { AuthConfig } from "convex/server";

/**
 * Supabase Auth stays the identity provider. Convex checks the same access
 * token. The subject is auth.users.id. Role and workspace are loaded from
 * Convex membership records, not from the token.
 */
const productionIssuer = "https://jizzmlvpnykazrsiotqq.supabase.co/auth/v1";
const localIssuer = "http://127.0.0.1:54321/auth/v1";

export default {
  providers: [
    {
      type: "customJwt",
      issuer: productionIssuer,
      jwks: `${productionIssuer}/.well-known/jwks.json`,
      algorithm: "ES256",
      applicationID: "authenticated",
    },
    {
      type: "customJwt",
      issuer: localIssuer,
      jwks: `${localIssuer}/.well-known/jwks.json`,
      algorithm: "ES256",
      applicationID: "authenticated",
    },
  ],
} satisfies AuthConfig;
