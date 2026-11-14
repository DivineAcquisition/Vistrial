import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { addIntegrationRoutes } from "./integrationHttp";
import { completeConnect as completeHighLevel } from "./highLevel";
import { HL_CALLBACK_PATH, HL_WEBHOOK_PATH, isHlId, parseTime, verifyWebhook } from "./lib/highLevel";
import { redirectUri } from "./metaAds";
import { graphVersion } from "./lib/metaGraph";

const http = httpRouter();

function back(origin: string | null, outcome: string, path?: string | null) {
  const base = origin ?? process.env.SITE_URL ?? "https://app.vistrial.io";
  const target = path ?? "/app/connections/meta";
  const join = target.includes("?") ? "&" : "?";
  return new Response(null, { status: 302, headers: { Location: `${base.replace(/\/$/, "")}${target}${join}meta=${outcome}`, "Cache-Control": "no-store" } });
}

/**
 * Facebook Login comes back here. The state is checked and used once; the code becomes a long-lived token
 * that is saved on the server and never sent to the browser.
 */
http.route({
  path: "/meta/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const nonce = url.searchParams.get("state") ?? "";
    const state = /^[0-9a-f]{48}$/.test(nonce) ? await ctx.runMutation(internal.metaAds.consumeState, { nonce }) : null;
    if (!state) return back(null, "expired");
    if (url.searchParams.get("error") || !url.searchParams.get("code")) return back(state.returnOrigin, "cancelled", state.returnPath);

    const appId = process.env.META_APP_ID;
    const secret = process.env.META_APP_SECRET;
    if (!appId || !secret) return back(state.returnOrigin, "not_configured", state.returnPath);
    const graph = `https://graph.facebook.com/${graphVersion()}`;
    let calls = 0;
    const getJson = async (target: string, token?: string) => {
      const response = await fetch(target, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20_000) });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (response.ok) calls++;
      return response.ok ? body : null;
    };

    const short = await getJson(
      `${graph}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri(), code: url.searchParams.get("code")! })}`,
    );
    const shortToken = typeof short?.access_token === "string" ? short.access_token : null;
    if (!shortToken) return back(state.returnOrigin, "failed", state.returnPath);
    const long = await getJson(
      `${graph}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: shortToken })}`,
    );
    const token = typeof long?.access_token === "string" ? long.access_token : shortToken;
    const expiresIn = typeof long?.expires_in === "number" ? long.expires_in : typeof short?.expires_in === "number" ? short.expires_in : null;

    const me = await getJson(`${graph}/me?fields=id,name`, token);
    const permissions = await getJson(`${graph}/me/permissions`, token);
    if (!me?.id) return back(state.returnOrigin, "failed", state.returnPath);
    const scopes = ((permissions?.data as { permission: string; status: string }[] | undefined) ?? [])
      .filter((row) => row.status === "granted")
      .map((row) => row.permission);
    if (!scopes.includes("ads_read")) return back(state.returnOrigin, "missing_permission", state.returnPath);

    await ctx.runMutation(internal.metaAds.saveConnection, {
      workspaceId: state.workspaceId,
      source: "oauth",
      accessToken: token,
      tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
      scopes,
      metaUserId: String(me.id),
      metaUserName: String(me.name ?? "Meta user"),
      connectedBy: state.userId,
      calls,
    });
    return back(state.returnOrigin, "connected", state.returnPath);
  }),
});

/**
 * HighLevel's install page comes back here. The state is checked and used once; the code becomes a
 * sub-account token saved on the server and never sent to the browser. The path avoids the word
 * "highlevel", which HighLevel refuses in a redirect address.
 */
http.route({
  path: HL_CALLBACK_PATH,
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const result = await completeHighLevel(ctx, new URL(request.url));
    const base = result.returnOrigin ?? process.env.SITE_URL ?? "https://app.vistrial.io";
    const target = result.returnPath ?? "/app/connections/highlevel";
    const join = target.includes("?") ? "&" : "?";
    return new Response(null, {
      status: 302,
      headers: { Location: `${base.replace(/\/$/, "")}${target}${join}highlevel=${encodeURIComponent(result.outcome)}`, "Cache-Control": "no-store" },
    });
  }),
});

/**
 * HighLevel's app webhook. Only UNINSTALL is acted on: every connection to that sub-account is removed with
 * its data. A delivery whose Ed25519 signature does not verify is refused, and every refusal looks the same.
 */
http.route({
  path: HL_WEBHOOK_PATH,
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    if (raw.length > 64_000 || !(await verifyWebhook(raw, request.headers.get("x-ghl-signature")))) return new Response(null, { status: 401 });
    let event: Record<string, unknown> | null = null;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return new Response(null, { status: 400 });
    }
    if (event?.type === "UNINSTALL" && isHlId(event.locationId)) {
      await ctx.runMutation(internal.highLevel.uninstalled, { locationId: event.locationId, at: parseTime(event.timestamp) ?? undefined });
    }
    return new Response(null, { status: 200 });
  }),
});

// Sign-in returns and webhooks for the other connections (Google, calendars, note takers).
addIntegrationRoutes(http);

export default http;
