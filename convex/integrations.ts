/**
 * Connections to outside accounts besides Meta: Google products, calendars and note takers. This file
 * holds what screens read and what the database keeps; the calls to providers are in
 * integrationActions.ts. Rules, the same as the Meta connection: an Owner connects and disconnects,
 * everything is read-only, no public function returns a token, every read checks the workspace, and
 * disconnecting deletes the tokens and every saved read.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { ownerMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { authorizeUrl, codeChallenge, codeVerifier, isNonce, randomHex } from "./lib/integrations/oauth";
import {
  callbackUrl,
  GROUPS,
  isProviderKey,
  OAUTH_APPS,
  PROVIDERS,
  providerList,
  readiness,
  scopesFor,
  type ProviderKey,
} from "./lib/integrations/providers";
import { safeReturnOrigin, safeReturnPath } from "./lib/metaGraph";

const STATE_MS = 10 * 60 * 1000;
/** A renewal that has not finished in this long is taken to have died, and another may start. */
const REFRESH_LOCK_MS = 30 * 1000;

function provider(key: string) {
  if (!isProviderKey(key)) throw userError("That connection does not exist.", "not_found");
  return PROVIDERS[key];
}

/** The agents a connection is granted to. Missing means the Growth Architect only. */
export function grantedAgents(connection: Pick<Doc<"integrationConnections">, "agents">) {
  return connection.agents ?? [GROWTH_ARCHITECT];
}

async function connectionOf(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">, key: string) {
  return ctx.db
    .query("integrationConnections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId).eq("provider", key))
    .unique();
}

// ---------- What screens read ----------

export type ConnectionView = {
  status: "connected" | "needsReconnect";
  accountLabel: string;
  connectedAt: number;
  lastSyncAt: number | null;
  lastSyncCode: string | null;
  agents: string[];
};

export type ProviderView = {
  key: ProviderKey;
  group: keyof typeof GROUPS;
  name: string;
  kind: string;
  reads: string;
  never: string;
  /** not_set_up: Vistrial has not finished setting this up. not_built: set up, reading not built yet. ready: an Owner can connect. */
  readiness: "not_set_up" | "not_built" | "ready";
  connection: ConnectionView | null;
};

/** Every provider with how far it is set up, and this workspace's connection to it without its tokens. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx): Promise<{ canManage: boolean; canRefresh: boolean; providers: ProviderView[] }> => {
    const rows = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(50);
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return {
      canManage: ctx.member.role === "owner",
      // Owners and Managers may ask for a fresh read of a connection that supports one.
      canRefresh: ctx.member.role !== "rep",
      providers: providerList().map((row) => {
        const connection = byProvider.get(row.key);
        return {
          key: row.key,
          group: row.group,
          name: row.name,
          kind: row.kind,
          reads: row.reads,
          never: row.never,
          readiness: readiness(row),
          connection: connection
            ? {
                status: connection.status,
                accountLabel: connection.accountLabel,
                connectedAt: connection.connectedAt,
                lastSyncAt: connection.lastSyncAt ?? null,
                lastSyncCode: connection.lastSyncCode ?? null,
                agents: grantedAgents(connection),
              }
            : null,
        };
      }),
    };
  },
});

// ---------- Sign-in ----------

/** Starts a provider's sign-in for this workspace. Owner only. Returns the address to open. */
export const startConnect = ownerMutation({
  args: { provider: v.string(), returnOrigin: v.optional(v.string()), returnPath: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const row = provider(args.provider);
    const state = readiness(row);
    if (state === "not_set_up") throw userError(`${row.name} is not set up on Vistrial yet.`);
    if (state === "not_built" || !row.oauth) throw userError(`${row.name} cannot be connected yet.`);
    const app = OAUTH_APPS[row.oauth.app];
    const nonce = randomHex(24);
    const verifier = app.pkce ? codeVerifier() : undefined;
    await ctx.db.insert("integrationOauthStates", {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      provider: row.key,
      nonce,
      codeVerifier: verifier,
      returnOrigin: safeReturnOrigin(args.returnOrigin) ?? undefined,
      returnPath: safeReturnPath(args.returnPath) ?? undefined,
      createdAt: Date.now(),
    });
    return {
      url: authorizeUrl({
        authorizeUrl: app.authorizeUrl,
        clientId: process.env[app.idEnv]!,
        redirectUri: callbackUrl(row.oauth.app),
        scopes: scopesFor(row),
        scopeSeparator: app.scopeSeparator,
        state: nonce,
        challenge: verifier ? await codeChallenge(verifier) : undefined,
        extra: app.extra,
      }),
    };
  },
});

/** Uses a sign-in attempt once. Null when it is unknown, used, older than ten minutes, or its Owner is no longer one. */
export const consumeState = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    if (!isNonce(args.nonce)) return null;
    const row = await ctx.db
      .query("integrationOauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!row || row.usedAt || Date.now() - row.createdAt > STATE_MS) return null;
    // The verifier has done its job once it is handed to the callback; it is not kept.
    await ctx.db.patch(row._id, { usedAt: Date.now(), codeVerifier: undefined });
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", row.userId))
      .unique();
    if (!member?.active || member.role !== "owner") return null;
    return {
      workspaceId: row.workspaceId,
      userId: row.userId,
      provider: row.provider,
      codeVerifier: row.codeVerifier ?? null,
      returnOrigin: row.returnOrigin ?? null,
      returnPath: row.returnPath ?? null,
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    accountId: v.string(),
    accountLabel: v.string(),
    connectedBy: v.string(),
  },
  handler: async (ctx, args) => {
    provider(args.provider);
    const existing = await connectionOf(ctx, args.workspaceId, args.provider);
    const fields = { ...args, status: "connected" as const, connectedAt: Date.now(), refreshingSince: undefined };
    if (existing) {
      // A different account's reads do not belong beside this one's.
      if (existing.accountId !== args.accountId) await deleteReads(ctx, args.workspaceId, args.provider);
      await ctx.db.patch(existing._id, {
        ...fields,
        // A provider that sends no new renewal token on a reconnect keeps the one it gave before.
        refreshToken: args.refreshToken ?? (existing.accountId === args.accountId ? existing.refreshToken : undefined),
        ...(existing.accountId === args.accountId ? {} : { lastSyncAt: undefined, lastSyncCode: undefined }),
      });
    } else {
      await ctx.db.insert("integrationConnections", fields);
    }
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.connectedBy, action: "integration.connected", subject: args.provider });
    return null;
  },
});

/** Grants or withdraws an agent's use of a connection. Owner only. */
export const setAgentAccess = ownerMutation({
  args: { provider: v.string(), agentSlug: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    provider(args.provider);
    const connection = await connectionOf(ctx, ctx.workspaceId, args.provider);
    if (!connection) notFound();
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.agentSlug))
      .unique();
    if (!agent || agent.retired) notFound();
    const current = new Set(grantedAgents(connection));
    if (args.granted) current.add(args.agentSlug);
    else current.delete(args.agentSlug);
    await ctx.db.patch(connection._id, { agents: [...current] });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.granted ? "integration.agent_granted" : "integration.agent_withdrawn",
      subject: `${args.provider}:${args.agentSlug}`,
    });
    return null;
  },
});

// ---------- For the server only ----------

/** The whole connection, tokens included. Internal: only actions that call the provider read this. */
export const connectionFor = internalQuery({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args) => connectionOf(ctx, args.workspaceId, args.provider),
});

export const roleOf = internalQuery({
  args: { workspaceId: v.id("workspaces"), userId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", args.userId))
      .unique();
    return member?.active ? member.role : null;
  },
});

/**
 * Takes the right to renew a connection's token. Renewal tokens are often one-use, so only one caller may
 * spend it; the others wait and read the new token. Returns the renewal token, or why there is none.
 */
export const claimRefresh = internalMutation({
  args: { connectionId: v.id("integrationConnections") },
  handler: async (ctx, args): Promise<{ state: "claimed"; refreshToken: string } | { state: "busy" } | { state: "gone" } | { state: "no_refresh_token" }> => {
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.status !== "connected") return { state: "gone" };
    if (!row.refreshToken) return { state: "no_refresh_token" };
    if (row.refreshingSince && Date.now() - row.refreshingSince < REFRESH_LOCK_MS) return { state: "busy" };
    await ctx.db.patch(row._id, { refreshingSince: Date.now() });
    return { state: "claimed", refreshToken: row.refreshToken };
  },
});

export const saveTokens = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      accessToken: args.accessToken,
      tokenExpiresAt: args.tokenExpiresAt,
      // A rotated renewal token replaces the old one; a provider that sends none keeps it.
      ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
      refreshingSince: undefined,
    });
    return null;
  },
});

/** Ends a renewal that failed. `rejected` means the provider signed Vistrial out: the person must reconnect. */
export const refreshFailed = internalMutation({
  args: { connectionId: v.id("integrationConnections"), rejected: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    await ctx.db.patch(row._id, { refreshingSince: undefined, ...(args.rejected ? { status: "needsReconnect" as const } : {}) });
    return null;
  },
});

export const recordSync = internalMutation({
  args: { connectionId: v.id("integrationConnections"), code: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    const rejected = args.code === "token_rejected";
    await ctx.db.patch(row._id, { lastSyncAt: Date.now(), lastSyncCode: args.code, ...(rejected ? { status: "needsReconnect" as const } : {}) });
    return null;
  },
});

/** Replaces what was last read through a connection. Refused when the connection has gone meanwhile. */
export const saveSnapshot = internalMutation({
  args: { workspaceId: v.id("workspaces"), provider: v.string(), kind: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    // A read that finishes after a disconnect must not bring the data back.
    if (!(await connectionOf(ctx, args.workspaceId, args.provider))) return null;
    const existing = await ctx.db
      .query("integrationSnapshots")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider).eq("kind", args.kind))
      .unique();
    const row = { ...args, syncedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("integrationSnapshots", row);
    return null;
  },
});

const DELETE_BATCH = 200;

/** Deletes everything read through a provider for a workspace. Returns false when more remains. */
async function deleteReads(ctx: MutationCtx, workspaceId: Id<"workspaces">, key: string) {
  const snapshots = await ctx.db
    .query("integrationSnapshots")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId).eq("provider", key))
    .take(DELETE_BATCH);
  for (const row of snapshots) await ctx.db.delete(row._id);
  const events = await ctx.db
    .query("integrationWebhookEvents")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId).eq("provider", key))
    .take(DELETE_BATCH);
  for (const row of events) await ctx.db.delete(row._id);
  return snapshots.length < DELETE_BATCH && events.length < DELETE_BATCH;
}

/**
 * Removes a connection, its tokens and every saved read, in one step. Returns the token so the caller
 * can ask the provider to cancel it; the token is not kept anywhere after this.
 */
export const removeConnection = internalMutation({
  args: { workspaceId: v.id("workspaces"), provider: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<{ removed: boolean; token: string | null }> => {
    const connection = await connectionOf(ctx, args.workspaceId, args.provider);
    if (!connection) return { removed: false, token: null };
    // The token goes first and in this same transaction; a very large pile of reads is finished by sweepReads.
    await ctx.db.delete(connection._id);
    const done = await deleteReads(ctx, args.workspaceId, args.provider);
    if (!done) await ctx.scheduler.runAfter(0, internal.integrations.sweepReads, { workspaceId: args.workspaceId, provider: args.provider });
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.userId, action: "integration.disconnected", subject: args.provider });
    return { removed: true, token: connection.refreshToken ?? connection.accessToken };
  },
});

/** Finishes deleting a disconnected provider's reads when there were too many for one step. */
export const sweepReads = internalMutation({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args): Promise<null> => {
    // Reconnected in the meantime: what is there now belongs to the new connection.
    if (await connectionOf(ctx, args.workspaceId, args.provider)) return null;
    const done = await deleteReads(ctx, args.workspaceId, args.provider);
    if (!done) await ctx.scheduler.runAfter(0, internal.integrations.sweepReads, args);
    return null;
  },
});

// ---------- Webhooks ----------

/** The connection a webhook address belongs to, with what is needed to check its signature. Internal. */
export const hookTarget = internalQuery({
  args: { hookId: v.string() },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{32,64}$/.test(args.hookId)) return null;
    const row = await ctx.db
      .query("integrationConnections")
      .withIndex("by_hook", (q) => q.eq("hookId", args.hookId))
      .unique();
    if (!row) return null;
    return { workspaceId: row.workspaceId, provider: row.provider, hookSecret: row.hookSecret ?? null };
  },
});

/** Records a delivery that passed its signature check. Returns false for one already seen. */
export const recordWebhook = internalMutation({
  args: { workspaceId: v.id("workspaces"), provider: v.string(), deliveryId: v.string(), eventType: v.string() },
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("integrationWebhookEvents")
      .withIndex("by_provider_delivery", (q) => q.eq("provider", args.provider).eq("deliveryId", args.deliveryId))
      .first();
    if (seen) return false;
    await ctx.db.insert("integrationWebhookEvents", { ...args, receivedAt: Date.now() });
    // Keep the last 200 per connection.
    const old = await ctx.db
      .query("integrationWebhookEvents")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider))
      .order("desc")
      .take(260);
    for (const row of old.slice(200)) await ctx.db.delete(row._id);
    return true;
  },
});
