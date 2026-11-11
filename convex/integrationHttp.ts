/**
 * The addresses providers call: where a sign-in comes back to, and where webhooks arrive. Added to the
 * router in http.ts. Nothing here trusts a request until its state or its signature has been checked.
 */

import type { HttpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { completeConnect } from "./integrationActions";
import { isOAuthAppKey, isProviderKey, OAUTH_APPS, PROVIDERS, type OAuthAppKey } from "./lib/integrations/providers";
import { bodyDigest, verifyWebhook } from "./lib/integrations/signatures";

export const RETURN_PATH = "/app/connections/integrations";
const WEBHOOK_PREFIX = "/integrations/webhook/";
const MAX_WEBHOOK_BYTES = 1_000_000;

/** Sends the person back into the app with what happened. Only to an origin and path already checked. */
function back(origin: string | null, path: string | null, provider: string | null, outcome: string) {
  const base = origin ?? process.env.SITE_URL ?? "https://app.vistrial.io";
  const target = path ?? RETURN_PATH;
  const query = new URLSearchParams({ ...(provider ? { integration: provider } : {}), outcome });
  return new Response(null, {
    status: 302,
    headers: { Location: `${base.replace(/\/$/, "")}${target}${target.includes("?") ? "&" : "?"}${query}`, "Cache-Control": "no-store" },
  });
}

function refused(status = 401) {
  // The same answer whatever was wrong, so the address gives nothing away.
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

/** The kind of event, when the body names one in a plain word. Never anything else from the body. */
function eventType(body: string) {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const named = typeof json.event === "string" ? json.event : typeof json.eventType === "string" ? json.eventType : null;
    return named && /^[A-Za-z0-9_.:-]{1,60}$/.test(named) ? named : "unnamed";
  } catch {
    return "unnamed";
  }
}

export function addIntegrationRoutes(http: HttpRouter) {
  for (const appKey of Object.keys(OAUTH_APPS).filter(isOAuthAppKey) as OAuthAppKey[]) {
    http.route({
      path: OAUTH_APPS[appKey].callbackPath,
      method: "GET",
      handler: httpAction(async (ctx, request) => {
        const result = await completeConnect(ctx, appKey, new URL(request.url));
        return back(result.returnOrigin, result.returnPath, result.provider, result.outcome);
      }),
    });
  }

  /**
   * A provider's webhook: /integrations/webhook/<provider>/<hook id>. The hook id finds the connection,
   * the signature proves the sender, and a repeat delivery is acknowledged without being counted twice.
   * What a delivery leads to (a fresh read of that connection) is added with each provider.
   */
  http.route({
    pathPrefix: WEBHOOK_PREFIX,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const [providerKey, hookId, ...rest] = new URL(request.url).pathname.slice(WEBHOOK_PREFIX.length).split("/");
      if (rest.length > 0 || !providerKey || !hookId || !isProviderKey(providerKey)) return refused();
      const provider = PROVIDERS[providerKey];
      if (!provider.webhook) return refused();
      const length = Number(request.headers.get("content-length") ?? "0");
      if (length > MAX_WEBHOOK_BYTES) return refused(413);
      const body = await request.text();
      if (body.length > MAX_WEBHOOK_BYTES) return refused(413);

      const target = await ctx.runQuery(internal.integrations.hookTarget, { hookId });
      if (!target || target.provider !== providerKey) return refused();
      const secret = (provider.webhook.secretEnv ? process.env[provider.webhook.secretEnv] : target.hookSecret) ?? "";
      const verdict = await verifyWebhook({ scheme: provider.webhook.scheme, secret, headers: request.headers, body, now: Date.now() });
      if (!verdict.ok) return refused();

      await ctx.runMutation(internal.integrations.recordWebhook, {
        workspaceId: target.workspaceId,
        provider: providerKey,
        deliveryId: verdict.deliveryId ?? (await bodyDigest(body)),
        eventType: eventType(body),
      });
      return new Response(null, { status: 204 });
    }),
  });
}
