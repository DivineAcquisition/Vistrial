/**
 * The calls Vistrial makes to a connected provider's sign-in service: finishing a sign-in, renewing a
 * token, and cancelling one on disconnect. Tokens are read and written here on the server and are never
 * returned to a caller outside it. Provider answers become short codes; their own words are not passed on.
 */

import { isAdmin } from "./lib/roles";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { memberAction } from "./lib/builders";
import { notAllowed, userError } from "./lib/errors";
import { idTokenClaims, readTokenResponse, tokenErrorCode, type TokenSet } from "./lib/integrations/oauth";
import { callbackUrl, isProviderKey, OAUTH_APPS, PROVIDERS, type OAuthAppKey, type Provider } from "./lib/integrations/providers";

const TIMEOUT_MS = 20_000;
/** A token this close to its end is renewed before it is used. */
const RENEW_BEFORE_MS = 2 * 60 * 1000;

type TokenResult = { ok: true; tokens: TokenSet } | { ok: false; code: string };

/** Posts to a provider's token address with the app's own id and secret. */
async function tokenRequest(appKey: OAuthAppKey, fields: Record<string, string>): Promise<TokenResult> {
  const app = OAUTH_APPS[appKey];
  const id = process.env[app.idEnv];
  const secret = process.env[app.secretEnv];
  if (!id || !secret) return { ok: false, code: "not_set_up" };
  const body = new URLSearchParams({ ...fields, client_id: id, ...(app.clientAuth === "body" ? { client_secret: secret } : {}) });
  let response: Response;
  try {
    response = await fetch(app.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(app.clientAuth === "basic" ? { Authorization: `Basic ${btoa(`${id}:${secret}`)}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: "connection_failed" };
  }
  const json = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return { ok: false, code: tokenErrorCode(response.status, json) };
  const tokens = readTokenResponse(json, Date.now());
  return tokens ? { ok: true, tokens } : { ok: false, code: "token_failed" };
}

type Identity = { accountId: string; accountLabel: string };

/** Which account signed in, so the connection can name it. */
async function identify(appKey: OAuthAppKey, tokens: TokenSet): Promise<Identity | null> {
  if (appKey === "google") {
    const claims = idTokenClaims(tokens.idToken);
    const sub = typeof claims?.sub === "string" ? claims.sub : null;
    if (!sub) return null;
    return { accountId: sub, accountLabel: typeof claims?.email === "string" ? claims.email.slice(0, 200) : "Google account" };
  }
  try {
    const response = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const resource = ((await response.json().catch(() => null)) as { resource?: { uri?: unknown; name?: unknown; email?: unknown } } | null)?.resource;
    if (typeof resource?.uri !== "string") return null;
    const label = typeof resource.email === "string" ? resource.email : typeof resource.name === "string" ? resource.name : "Calendly account";
    return { accountId: resource.uri, accountLabel: label.slice(0, 200) };
  } catch {
    return null;
  }
}

/** Whether the person granted what the provider needs. Google lets a person untick a permission. */
function grantedEnough(provider: Provider, tokens: TokenSet) {
  if (!provider.oauth || tokens.scopes === null) return true;
  return provider.oauth.scopes.every((scope) => tokens.scopes!.includes(scope));
}

export type ConnectOutcome = {
  outcome: "connected" | "expired" | "cancelled" | "not_set_up" | "missing_permission" | "failed";
  provider: string | null;
  returnOrigin: string | null;
  returnPath: string | null;
  /** Set only when a connection was saved. */
  workspaceId?: Id<"workspaces">;
};

/**
 * Finishes a sign-in that came back to `appKey`'s callback address: uses the state once, swaps the code
 * for tokens (with the PKCE verifier), finds which account it is, and saves the connection.
 */
export async function completeConnect(ctx: ActionCtx, appKey: OAuthAppKey, url: URL): Promise<ConnectOutcome> {
  const state = await ctx.runMutation(internal.integrations.consumeState, { nonce: url.searchParams.get("state") ?? "" });
  if (!state) return { outcome: "expired", provider: null, returnOrigin: null, returnPath: null };
  const where = { provider: state.provider, returnOrigin: state.returnOrigin, returnPath: state.returnPath };
  const provider = isProviderKey(state.provider) ? PROVIDERS[state.provider] : null;
  // A state made for one provider's sign-in is not accepted at another's callback.
  if (!provider?.oauth || provider.oauth.app !== appKey) return { outcome: "failed", ...where };
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return { outcome: "cancelled", ...where };

  const exchanged = await tokenRequest(appKey, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(appKey),
    ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
  });
  if (!exchanged.ok) return { outcome: exchanged.code === "not_set_up" ? "not_set_up" : "failed", ...where };
  if (!grantedEnough(provider, exchanged.tokens)) {
    await revoke(appKey, exchanged.tokens.refreshToken ?? exchanged.tokens.accessToken);
    return { outcome: "missing_permission", ...where };
  }
  const who = await identify(appKey, exchanged.tokens);
  if (!who) return { outcome: "failed", ...where };

  await ctx.runMutation(internal.integrations.saveConnection, {
    workspaceId: state.workspaceId,
    provider: provider.key,
    accessToken: exchanged.tokens.accessToken,
    refreshToken: exchanged.tokens.refreshToken ?? undefined,
    tokenExpiresAt: exchanged.tokens.expiresAt ?? undefined,
    scopes: exchanged.tokens.scopes ?? provider.oauth.scopes,
    accountId: who.accountId,
    accountLabel: who.accountLabel,
    connectedBy: state.userId,
  });
  return { outcome: "connected", ...where, workspaceId: state.workspaceId };
}

/** Asks the provider to cancel a token. Best effort: a failure here never keeps a connection alive. */
async function revoke(appKey: OAuthAppKey, token: string) {
  const app = OAUTH_APPS[appKey];
  const id = process.env[app.idEnv];
  const secret = process.env[app.secretEnv];
  try {
    const body = new URLSearchParams({ token, ...(appKey === "calendly" && id && secret ? { client_id: id, client_secret: secret } : {}) });
    const response = await fetch(app.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type LiveToken = { ok: true; token: string; connection: Doc<"integrationConnections"> } | { ok: false; code: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A token that works now for a workspace's connection, renewed first when it is about to end. For actions
 * that read from the provider. The token it returns must not leave the server.
 */
export async function liveToken(ctx: ActionCtx, workspaceId: Id<"workspaces">, providerKey: string): Promise<LiveToken> {
  const provider = isProviderKey(providerKey) ? PROVIDERS[providerKey] : null;
  if (!provider?.oauth) return { ok: false, code: "not_built" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const connection: Doc<"integrationConnections"> | null = await ctx.runQuery(internal.integrations.connectionFor, { workspaceId, provider: providerKey });
    if (!connection) return { ok: false, code: "not_connected" };
    if (connection.status !== "connected") return { ok: false, code: "token_rejected" };
    if (!connection.tokenExpiresAt || connection.tokenExpiresAt - Date.now() > RENEW_BEFORE_MS) return { ok: true, token: connection.accessToken, connection };

    const claim = await ctx.runMutation(internal.integrations.claimRefresh, { connectionId: connection._id });
    if (claim.state === "gone") return { ok: false, code: "not_connected" };
    if (claim.state === "no_refresh_token") {
      await ctx.runMutation(internal.integrations.refreshFailed, { connectionId: connection._id, rejected: true });
      return { ok: false, code: "token_rejected" };
    }
    if (claim.state === "busy") {
      // Someone else is renewing it. Read again shortly.
      await wait(1500);
      continue;
    }
    const renewed = await tokenRequest(provider.oauth.app, { grant_type: "refresh_token", refresh_token: claim.refreshToken });
    if (!renewed.ok) {
      await ctx.runMutation(internal.integrations.refreshFailed, { connectionId: connection._id, rejected: renewed.code === "token_rejected" });
      return { ok: false, code: renewed.code };
    }
    await ctx.runMutation(internal.integrations.saveTokens, {
      connectionId: connection._id,
      accessToken: renewed.tokens.accessToken,
      refreshToken: renewed.tokens.refreshToken ?? undefined,
      tokenExpiresAt: renewed.tokens.expiresAt ?? undefined,
    });
    return { ok: true, token: renewed.tokens.accessToken, connection: { ...connection, accessToken: renewed.tokens.accessToken } };
  }
  return { ok: false, code: "busy" };
}

/**
 * Removes the connection, its tokens and every saved read, then asks the provider to cancel the token.
 * Owner only. The deletion happens first and does not depend on the provider answering.
 */
export const disconnect = memberAction({
  args: { provider: v.string() },
  handler: async (ctx, args): Promise<{ removed: boolean; revoked: boolean }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!role || !isAdmin(role)) notAllowed();
    if (!isProviderKey(args.provider)) throw userError("That connection does not exist.", "not_found");
    const result: { removed: boolean; token: string | null } = await ctx.runMutation(internal.integrations.removeConnection, {
      workspaceId: ctx.workspaceId,
      provider: args.provider,
      userId: ctx.userId,
    });
    const app = PROVIDERS[args.provider].oauth?.app;
    const revoked = result.token && app ? await revoke(app, result.token) : false;
    return { removed: result.removed, revoked };
  },
});

/**
 * Checks that a connection's token works, renewing it if it is about to end. Returns a short code, never
 * the token. Internal: for the dashboard and for tests.
 */
export const checkToken = internalAction({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const live = await liveToken(ctx, args.workspaceId, args.provider);
    return { code: live.ok ? "ok" : live.code };
  },
});
