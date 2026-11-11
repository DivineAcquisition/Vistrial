/**
 * OAuth 2.0 authorization-code helpers shared by every provider: state, PKCE, the authorize URL and
 * reading a token response. Pure, so they can be tested without a provider. Nothing here logs or returns
 * a token to a caller outside the server.
 */

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A PKCE code verifier: 64 characters from the unreserved set (RFC 7636 allows 43 to 128). */
export function codeVerifier() {
  // 66 characters: values at or above 198 are thrown away so every character is equally likely.
  const out: string[] = [];
  while (out.length < 64) {
    for (const byte of crypto.getRandomValues(new Uint8Array(96))) {
      if (byte < 198 && out.length < 64) out.push(UNRESERVED[byte % 66]);
    }
  }
  return out.join("");
}

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The S256 challenge for a verifier. */
export async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function isNonce(value: string) {
  return /^[0-9a-f]{48}$/.test(value);
}

export type AuthorizeInput = {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  scopeSeparator: string;
  state: string;
  challenge?: string;
  extra?: Record<string, string>;
};

export function authorizeUrl(input: AuthorizeInput) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    ...(input.scopes.length ? { scope: input.scopes.join(input.scopeSeparator) } : {}),
    ...(input.challenge ? { code_challenge: input.challenge, code_challenge_method: "S256" } : {}),
    ...(input.extra ?? {}),
  });
  return `${input.authorizeUrl}?${params}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Milliseconds since 1970, or null when the provider gives no lifetime. */
  expiresAt: number | null;
  scopes: string[] | null;
  idToken: string | null;
};

/** Reads a token endpoint's JSON. Null when it holds no access token. */
export function readTokenResponse(body: unknown, now: number): TokenSet | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (typeof row.access_token !== "string" || !row.access_token) return null;
  const seconds = typeof row.expires_in === "number" ? row.expires_in : Number(row.expires_in);
  return {
    accessToken: row.access_token,
    refreshToken: typeof row.refresh_token === "string" && row.refresh_token ? row.refresh_token : null,
    expiresAt: Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null,
    scopes: typeof row.scope === "string" ? row.scope.split(/[\s,]+/).filter(Boolean) : null,
    idToken: typeof row.id_token === "string" ? row.id_token : null,
  };
}

/**
 * The claims of an ID token that came straight from the provider's token endpoint over TLS. The signature
 * is not checked here, which is only safe for a token received that way, never for one a browser sent.
 */
export function idTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const text = new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
    const claims = JSON.parse(text);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A token endpoint's refusal as a short code. Never the provider's own words. */
export function tokenErrorCode(status: number, body: unknown) {
  const error = body && typeof body === "object" ? (body as Record<string, unknown>).error : null;
  if (error === "invalid_grant") return "token_rejected";
  if (error === "invalid_client" || error === "unauthorized_client") return "app_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_down";
  return "token_failed";
}
