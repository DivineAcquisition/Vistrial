import { describe, expect, it } from "vitest";

import { authorizeUrl, codeChallenge, codeVerifier, idTokenClaims, readTokenResponse, tokenErrorCode } from "./oauth";
import { callbackUrl, missingEnv, PROVIDERS, providerList, readiness, requiredEnv, scopesFor, webhookUrl } from "./providers";
import { sameText, verifyWebhook } from "./signatures";

async function hmac(key: Uint8Array, message: string) {
  const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(message)));
}
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const text = (value: string) => new TextEncoder().encode(value);

describe("sign-in helpers", () => {
  it("makes the S256 challenge from RFC 7636's own example", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes verifiers of the allowed length and characters, never the same twice", () => {
    const a = codeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    expect(codeVerifier()).not.toBe(a);
  });

  it("builds the address to open with state, PKCE and the provider's extras", () => {
    const url = new URL(
      authorizeUrl({
        authorizeUrl: "https://accounts.example/auth",
        clientId: "client",
        redirectUri: "https://x.convex.site/integrations/google/callback",
        scopes: ["openid", "email"],
        scopeSeparator: " ",
        state: "abc",
        challenge: "chal",
        extra: { access_type: "offline" },
      }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client",
      redirect_uri: "https://x.convex.site/integrations/google/callback",
      state: "abc",
      scope: "openid email",
      code_challenge: "chal",
      code_challenge_method: "S256",
      access_type: "offline",
    });
  });

  it("reads a token answer and refuses one without an access token", () => {
    expect(readTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "x y" }, 1000)).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 3_601_000,
      scopes: ["x", "y"],
      idToken: null,
    });
    expect(readTokenResponse({ error: "invalid_grant" }, 0)).toBeNull();
    expect(readTokenResponse(null, 0)).toBeNull();
  });

  it("turns a refusal into a short code, never the provider's words", () => {
    expect(tokenErrorCode(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })).toBe("token_rejected");
    expect(tokenErrorCode(401, { error: "invalid_client" })).toBe("app_rejected");
    expect(tokenErrorCode(429, null)).toBe("rate_limited");
    expect(tokenErrorCode(503, "<html>")).toBe("provider_down");
  });

  it("reads who signed in from an ID token, and nothing from a broken one", () => {
    const payload = btoa(JSON.stringify({ sub: "123", email: "owner@northpeak.agency" })).replace(/=+$/, "");
    expect(idTokenClaims(`h.${payload}.s`)).toMatchObject({ sub: "123", email: "owner@northpeak.agency" });
    expect(idTokenClaims("nonsense")).toBeNull();
    expect(idTokenClaims(null)).toBeNull();
  });
});

describe("providers", () => {
  it("lists every provider as not set up when the deployment has no settings", () => {
    for (const provider of providerList()) {
      const expected = requiredEnv(provider).length === 0 ? "not_built" : "not_set_up";
      expect(readiness(provider, {})).toBe(expected);
    }
  });

  it("offers Connect only for a provider that is both set up and built", () => {
    const google = { GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s" };
    expect(readiness(PROVIDERS.google_calendar, google)).toBe("ready");
    expect(readiness(PROVIDERS.google_ads, google)).toBe("not_built");
    expect(readiness(PROVIDERS.calendly, google)).toBe("not_set_up");
    expect(missingEnv(PROVIDERS.calendly, { CALENDLY_CLIENT_ID: "id" })).toEqual(["CALENDLY_CLIENT_SECRET"]);
  });

  it("asks only for read permissions where the provider has them", () => {
    expect(scopesFor(PROVIDERS.google_calendar)).toEqual(["openid", "email", "https://www.googleapis.com/auth/calendar.events.owned.readonly"]);
    expect(scopesFor(PROVIDERS.calendly)).toEqual(["users:read", "scheduled_events:read"]);
    for (const provider of providerList()) {
      for (const scope of scopesFor(provider)) expect(scope).not.toMatch(/:write$|calendar\.events$|\/calendar$/);
    }
  });

  it("builds callback and webhook addresses on the deployment, or on the owner's domain when one is set", () => {
    expect(callbackUrl("google", { CONVEX_SITE_URL: "https://x.convex.site/" })).toBe("https://x.convex.site/integrations/google/callback");
    expect(callbackUrl("google", { CONVEX_SITE_URL: "https://x.convex.site", INTEGRATIONS_CALLBACK_ORIGIN: "https://connect.vistrial.io" })).toBe(
      "https://connect.vistrial.io/integrations/google/callback",
    );
    expect(webhookUrl("calendly", "abc", "https://x.convex.site")).toBe("https://x.convex.site/integrations/webhook/calendly/abc");
    expect(() => callbackUrl("calendly", {})).toThrow();
  });
});

describe("webhook signatures", () => {
  const now = 1_800_000_000_000;
  const seconds = String(now / 1000);
  const body = JSON.stringify({ event: "invitee.created", payload: { name: "kept nowhere" } });

  it("accepts a Calendly signature and refuses a wrong, stale, malformed or missing one", async () => {
    const good = hex(await hmac(text("key"), `${seconds}.${body}`));
    const check = (header: string | null, at = now, secret = "key") =>
      verifyWebhook({ scheme: "calendly", secret, headers: new Headers(header ? { "Calendly-Webhook-Signature": header } : {}), body, now: at });
    expect(await check(`t=${seconds},v1=${good}`)).toEqual({ ok: true, deliveryId: null });
    expect(await check(`t=${seconds},v1=${good.replace(/^./, good[0] === "a" ? "b" : "a")}`)).toEqual({ ok: false, code: "mismatch" });
    expect(await check(`t=${seconds},v1=${good}`, now + 6 * 60_000)).toEqual({ ok: false, code: "stale" });
    expect(await check(`t=${seconds},v1=${good}`, now, "other")).toEqual({ ok: false, code: "mismatch" });
    expect(await check("v1=abc")).toEqual({ ok: false, code: "malformed" });
    expect(await check(null)).toEqual({ ok: false, code: "missing" });
    expect(await check(`t=${seconds},v1=${good}`, now, "")).toEqual({ ok: false, code: "missing" });
  });

  it("refuses a Calendly body that was changed after signing", async () => {
    const good = hex(await hmac(text("key"), `${seconds}.${body}`));
    const verdict = await verifyWebhook({
      scheme: "calendly",
      secret: "key",
      headers: new Headers({ "Calendly-Webhook-Signature": `t=${seconds},v1=${good}` }),
      body: body.replace("created", "canceled"),
      now,
    });
    expect(verdict).toEqual({ ok: false, code: "mismatch" });
  });

  it("accepts a Standard Webhooks signature, also during a secret rotation, and returns its delivery id", async () => {
    const key = text("0123456789abcdef0123456789abcdef");
    const secret = `whsec_${b64(key)}`;
    const good = b64(await hmac(key, `msg_1.${seconds}.${body}`));
    const check = (signature: string, at = now) =>
      verifyWebhook({
        scheme: "standardWebhooks",
        secret,
        headers: new Headers({ "webhook-id": "msg_1", "webhook-timestamp": seconds, "webhook-signature": signature }),
        body,
        now: at,
      });
    expect(await check(`v1,${good}`)).toEqual({ ok: true, deliveryId: "msg_1" });
    expect(await check(`v1,AAAA v1,${good}`)).toEqual({ ok: true, deliveryId: "msg_1" });
    expect(await check("v1,AAAA")).toEqual({ ok: false, code: "mismatch" });
    expect(await check(`v1,${good}`, now - 10 * 60_000)).toEqual({ ok: false, code: "stale" });
    expect(await check(`v2,${good}`)).toEqual({ ok: false, code: "malformed" });
  });

  it("accepts an X-Hub-Signature and refuses a wrong one", async () => {
    const good = hex(await hmac(text("shh"), body));
    const check = (header: string) => verifyWebhook({ scheme: "hubSha256", secret: "shh", headers: new Headers({ "X-Hub-Signature": header }), body, now });
    expect(await check(`sha256=${good}`)).toEqual({ ok: true, deliveryId: null });
    expect(await check(`sha256=${"0".repeat(64)}`)).toEqual({ ok: false, code: "mismatch" });
    expect(await check("sha256=short")).toEqual({ ok: false, code: "malformed" });
  });

  it("compares text without stopping early", () => {
    expect(sameText("abc", "abc")).toBe(true);
    expect(sameText("abc", "abd")).toBe(false);
    expect(sameText("abc", "abcd")).toBe(false);
  });
});
