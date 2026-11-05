/**
 * Connect your Meta ads: a workspace's read-only link to its own ad account through the Marketing API.
 * Vistrial reads campaigns and results; it never creates, edits, pauses or funds anything on Meta.
 * The access token stays on the server: no public function returns it.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { memberAction, ownerMutation, workspaceQuery } from "./lib/builders";
import { notAllowed } from "./lib/errors";
import {
  ACCOUNT_STATUS,
  dailySeries,
  graphErrorCode,
  graphVersion,
  isAdAccountId,
  isRange,
  RANGES,
  joinCampaigns,
  oauthScopes,
  safeReturnOrigin,
  totalsOf,
  type CampaignRow,
  type InsightRow,
} from "./lib/metaGraph";

const STATE_MS = 10 * 60 * 1000;
const PAGES = 3;

function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function redirectUri() {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new Error("This deployment has no site URL.");
  return `${site.replace(/\/$/, "")}/meta/callback`;
}

// ---------- What screens read ----------

/** The connection without its token, and the last read of the chosen ad account. */
export const status = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const configured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    if (!connection) return { configured, canManage: ctx.member.role === "owner", connection: null, snapshot: null };
    const snapshot = connection.adAccountId
      ? await ctx.db
          .query("metaAdSnapshots")
          .withIndex("by_workspace_account", (q) => q.eq("workspaceId", ctx.workspaceId).eq("adAccountId", connection.adAccountId!))
          .unique()
      : null;
    const total = connection.callsOk + connection.callsFailed;
    return {
      configured,
      canManage: ctx.member.role === "owner",
      connection: {
        source: connection.source,
        status: connection.status,
        metaUserName: connection.metaUserName,
        connectedAt: connection.connectedAt,
        tokenExpiresAt: connection.tokenExpiresAt ?? null,
        scopes: connection.scopes,
        adAccountId: connection.adAccountId ?? null,
        adAccountName: connection.adAccountName ?? null,
        currency: connection.currency ?? null,
        range: connection.range ?? "last_30d",
        lastSyncAt: connection.lastSyncAt ?? null,
        lastSyncCode: connection.lastSyncCode ?? null,
        calls: { ok: connection.callsOk, failed: connection.callsFailed, successRate: total > 0 ? connection.callsOk / total : null },
      },
      snapshot: snapshot
        ? {
            currency: snapshot.currency,
            range: snapshot.range ?? "last_30d",
            dateStart: snapshot.dateStart,
            dateStop: snapshot.dateStop,
            syncedAt: snapshot.syncedAt,
            totals: snapshot.totals,
            daily: snapshot.daily,
            campaigns: snapshot.campaigns,
          }
        : null,
    };
  },
});

// ---------- Facebook Login ----------

/** Starts Facebook Login for this workspace. Owner only. Returns the dialog URL to open. */
export const startConnect = ownerMutation({
  args: { returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const appId = process.env.META_APP_ID;
    if (!appId || !process.env.META_APP_SECRET) throw new Error("The Meta app is not set up on this deployment yet.");
    const nonce = randomHex(24);
    await ctx.db.insert("metaOauthStates", {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      nonce,
      returnOrigin: safeReturnOrigin(args.returnOrigin) ?? undefined,
      createdAt: Date.now(),
    });
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri(),
      state: nonce,
      response_type: "code",
      scope: oauthScopes().join(","),
    });
    return { url: `https://www.facebook.com/${graphVersion()}/dialog/oauth?${params}` };
  },
});

/** Uses a login attempt once. Null when it is unknown, used or older than ten minutes. */
export const consumeState = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("metaOauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!row || row.usedAt || Date.now() - row.createdAt > STATE_MS) return null;
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", row.userId))
      .unique();
    if (!member?.active || member.role !== "owner") return null;
    return { workspaceId: row.workspaceId, userId: row.userId, returnOrigin: row.returnOrigin ?? null };
  },
});

export const saveConnection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    source: v.union(v.literal("oauth"), v.literal("serverToken")),
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    metaUserId: v.string(),
    metaUserName: v.string(),
    connectedBy: v.string(),
    calls: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
    const { calls, ...fields } = args;
    if (existing) {
      const sameUser = existing.metaUserId === args.metaUserId;
      await ctx.db.patch(existing._id, {
        ...fields,
        connectedAt: Date.now(),
        status: "connected",
        callsOk: existing.callsOk + calls,
        // A different Meta person may not reach the account the last one chose.
        ...(sameUser ? {} : { adAccountId: undefined, adAccountName: undefined, currency: undefined, lastSyncAt: undefined, lastSyncCode: undefined }),
      });
    } else {
      await ctx.db.insert("metaConnections", { ...fields, connectedAt: Date.now(), status: "connected", callsOk: calls, callsFailed: 0 });
    }
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.connectedBy, action: "meta.connected", subject: args.metaUserId });
    return null;
  },
});

// ---------- Graph, read-only ----------

type Counter = { ok: number; failed: number; lastCode: string | null };

async function graphGet(token: string, pathOrUrl: string, counter: Counter) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://graph.facebook.com/${graphVersion()}/${pathOrUrl}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  } catch {
    counter.failed++;
    counter.lastCode = "connection_failed";
    return { ok: false as const, code: "connection_failed", body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    counter.failed++;
    counter.lastCode = graphErrorCode(body);
    return { ok: false as const, code: counter.lastCode, body };
  }
  counter.ok++;
  return { ok: true as const, code: "ok", body };
}

/** Every row of a Graph list, following `paging.next` for a few pages. */
async function graphList<T>(token: string, path: string, counter: Counter) {
  const rows: T[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < PAGES; page++) {
    const result = await graphGet(token, next, counter);
    if (!result.ok) return { ok: false as const, code: result.code, rows };
    rows.push(...(((result.body?.data as T[] | undefined) ?? []) as T[]));
    next = ((result.body?.paging as { next?: string } | undefined)?.next ?? null) as string | null;
    if (next && !next.startsWith("https://graph.facebook.com/")) next = null;
  }
  return { ok: true as const, code: "ok", rows };
}

export const connectionFor = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) =>
    ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique(),
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

export const recordCalls = internalMutation({
  args: {
    connectionId: v.id("metaConnections"),
    ok: v.number(),
    failed: v.number(),
    code: v.optional(v.string()),
    synced: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    const expired = args.code === "token_expired" || args.code === "token_rejected";
    await ctx.db.patch(row._id, {
      callsOk: row.callsOk + args.ok,
      callsFailed: row.callsFailed + args.failed,
      ...(args.synced !== undefined ? { lastSyncAt: Date.now(), lastSyncCode: args.code ?? "ok" } : {}),
      ...(expired ? { status: "needsReconnect" as const } : {}),
    });
    return null;
  },
});

export const setAccount = internalMutation({
  args: { connectionId: v.id("metaConnections"), adAccountId: v.string(), adAccountName: v.string(), currency: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    await ctx.db.patch(row._id, { adAccountId: args.adAccountId, adAccountName: args.adAccountName, currency: args.currency, lastSyncAt: undefined, lastSyncCode: undefined });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "user", actorId: args.userId, action: "meta.account_chosen", subject: args.adAccountId });
    return null;
  },
});

export const saveSnapshot = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    adAccountId: v.string(),
    currency: v.string(),
    range: v.string(),
    dateStart: v.string(),
    dateStop: v.string(),
    totals: v.any(),
    daily: v.any(),
    campaigns: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("metaAdSnapshots")
      .withIndex("by_workspace_account", (q) => q.eq("workspaceId", args.workspaceId).eq("adAccountId", args.adAccountId))
      .unique();
    const row = { ...args, syncedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("metaAdSnapshots", row);
    return null;
  },
});

async function requireRole(ctx: ActionCtx, workspaceId: Id<"workspaces">, userId: string, roles: string[]): Promise<string> {
  const role: string | null = await ctx.runQuery(internal.metaAds.roleOf, { workspaceId, userId });
  if (!role || !roles.includes(role)) notAllowed();
  return role;
}

async function liveConnection(ctx: ActionCtx, workspaceId: Id<"workspaces">): Promise<Doc<"metaConnections">> {
  const connection: Doc<"metaConnections"> | null = await ctx.runQuery(internal.metaAds.connectionFor, { workspaceId });
  if (!connection) throw new Error("Connect your Meta ads first.");
  return connection;
}

/** Reads the chosen account over its window: campaigns, their results, and a series. */
async function syncConnection(ctx: ActionCtx, connection: Doc<"metaConnections">): Promise<{ code: string }> {
  if (!connection.adAccountId) return { code: "no_account" };
  const counter: Counter = { ok: 0, failed: 0, lastCode: null };
  const account = connection.adAccountId;
  const token = connection.accessToken;
  const range = isRange(connection.range) ? connection.range : "last_30d";
  const insights = await graphList<InsightRow>(
    token,
    `${account}/insights?level=campaign&date_preset=${range}&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions,date_start,date_stop&limit=100`,
    counter,
  );
  const campaigns = insights.ok
    ? await graphList<CampaignRow>(token, `${account}/campaigns?fields=id,name,status,effective_status,objective&limit=100`, counter)
    : { ok: false as const, code: insights.code, rows: [] };
  const daily = campaigns.ok
    ? await graphList<InsightRow>(token, `${account}/insights?date_preset=${range}&time_increment=${RANGES[range].step}&fields=spend,impressions,clicks&limit=100`, counter)
    : { ok: false as const, code: campaigns.code, rows: [] };
  const code = !insights.ok ? insights.code : !campaigns.ok ? campaigns.code : !daily.ok ? daily.code : "ok";
  if (code === "ok") {
    const joined = joinCampaigns(campaigns.rows, insights.rows);
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    await ctx.runMutation(internal.metaAds.saveSnapshot, {
      workspaceId: connection.workspaceId,
      adAccountId: account,
      currency: connection.currency ?? "USD",
      range,
      dateStart: insights.rows[0]?.date_start ?? monthAgo,
      dateStop: insights.rows[0]?.date_stop ?? today,
      totals: totalsOf(joined),
      daily: dailySeries(daily.rows),
      campaigns: joined.slice(0, 100),
    });
  }
  await ctx.runMutation(internal.metaAds.recordCalls, { connectionId: connection._id, ok: counter.ok, failed: counter.failed, code, synced: true });
  return { code };
}

// ---------- What people do ----------

/** The ad accounts the connected Meta person can reach. Owner or Manager. */
type AccountChoice = {
  id: string;
  name: string;
  currency: string;
  business: string | null;
  status: { label: string; tone: "good" | "warning" | "critical" | "neutral" };
  usable: boolean;
};

export const adAccounts = memberAction({
  args: {},
  handler: async (ctx): Promise<{ code: string; accounts: AccountChoice[] }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, ["owner", "manager"]);
    const connection = await liveConnection(ctx, ctx.workspaceId);
    const counter: Counter = { ok: 0, failed: 0, lastCode: null };
    const list = await graphList<{ id: string; name?: string; account_status?: number; currency?: string; business?: { name?: string } }>(
      connection.accessToken,
      "me/adaccounts?fields=id,name,account_status,currency,business{name}&limit=100",
      counter,
    );
    await ctx.runMutation(internal.metaAds.recordCalls, { connectionId: connection._id, ok: counter.ok, failed: counter.failed, code: list.code });
    if (!list.ok) return { code: list.code, accounts: [] };
    return {
      code: "ok",
      accounts: list.rows
        .filter((row) => isAdAccountId(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name ?? row.id,
          currency: row.currency ?? "USD",
          business: row.business?.name ?? null,
          status: ACCOUNT_STATUS[row.account_status ?? 0] ?? { label: "Unknown", tone: "neutral" as const },
          usable: row.account_status === 1 || row.account_status === 9,
        }))
        .sort((a, b) => Number(b.usable) - Number(a.usable) || a.name.localeCompare(b.name)),
    };
  },
});

/** Chooses the ad account to read, checks Vistrial can reach it, and reads it. Owner only. */
export const chooseAccount = memberAction({
  args: { adAccountId: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, ["owner"]);
    if (!isAdAccountId(args.adAccountId)) throw new Error("That is not an ad account id.");
    const connection = await liveConnection(ctx, ctx.workspaceId);
    const counter: Counter = { ok: 0, failed: 0, lastCode: null };
    const check = await graphGet(connection.accessToken, `${args.adAccountId}?fields=name,currency,account_status`, counter);
    await ctx.runMutation(internal.metaAds.recordCalls, { connectionId: connection._id, ok: counter.ok, failed: counter.failed, code: check.code });
    if (!check.ok) return { code: check.code };
    await ctx.runMutation(internal.metaAds.setAccount, {
      connectionId: connection._id,
      adAccountId: args.adAccountId,
      adAccountName: String(check.body?.name ?? args.adAccountId),
      currency: String(check.body?.currency ?? "USD"),
      userId: ctx.userId,
    });
    const fresh = await liveConnection(ctx, ctx.workspaceId);
    return syncConnection(ctx, fresh);
  },
});

/** Reads the chosen account again now, optionally over a new window. Owner or Manager. */
export const syncNow = memberAction({
  args: { range: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ code: string }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, ["owner", "manager"]);
    const connection = await liveConnection(ctx, ctx.workspaceId);
    if (args.range !== undefined) {
      if (!isRange(args.range)) throw new Error("Pick last_30d, last_90d or maximum.");
      await ctx.runMutation(internal.metaAds.setRange, { connectionId: connection._id, range: args.range });
      return syncConnection(ctx, { ...connection, range: args.range });
    }
    return syncConnection(ctx, connection);
  },
});

export const setRange = internalMutation({
  args: { connectionId: v.id("metaConnections"), range: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, { range: args.range });
    return null;
  },
});

/** Removes the connection, its token and every saved read. Owner only. Nothing on Meta changes. */
export const disconnect = ownerMutation({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!connection) return null;
    const snapshots = await ctx.db
      .query("metaAdSnapshots")
      .withIndex("by_workspace_account", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(20);
    for (const row of snapshots) await ctx.db.delete(row._id);
    await ctx.db.delete(connection._id);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "meta.disconnected", subject: connection.metaUserId });
    return null;
  },
});

// ---------- Background and development ----------

export const connectionsToSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("metaConnections").take(200);
    return rows.filter((row) => row.status === "connected" && row.adAccountId).map((row) => row.workspaceId);
  },
});

/** Keeps each connected account's results fresh. Runs on a schedule. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ synced: number }> => {
    const workspaces: Id<"workspaces">[] = await ctx.runQuery(internal.metaAds.connectionsToSync, {});
    for (const workspaceId of workspaces) {
      const connection: Doc<"metaConnections"> | null = await ctx.runQuery(internal.metaAds.connectionFor, { workspaceId });
      if (connection) await syncConnection(ctx, connection);
    }
    return { synced: workspaces.length };
  },
});

/**
 * Development and testing: connects a workspace with the operator's own token (META_AD_ACCESS_TOKEN)
 * instead of Facebook Login. Internal only; run from the dashboard.
 */
export const connectWithServerToken = internalAction({
  args: { workspaceId: v.id("workspaces"), adAccountId: v.optional(v.string()), range: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ connected: boolean; synced: string | null }> => {
    const token = process.env.META_AD_ACCESS_TOKEN;
    if (!token) throw new Error("Add META_AD_ACCESS_TOKEN to this deployment first.");
    const counter: Counter = { ok: 0, failed: 0, lastCode: null };
    const me = await graphGet(token, "me?fields=id,name", counter);
    if (!me.ok) throw new Error(`Meta refused the token: ${me.code}`);
    const permissions = await graphGet(token, "me/permissions", counter);
    const scopes = ((permissions.body?.data as { permission: string; status: string }[] | undefined) ?? [])
      .filter((row) => row.status === "granted")
      .map((row) => row.permission);
    const owner: string | null = await ctx.runQuery(internal.metaAds.ownerOf, { workspaceId: args.workspaceId });
    await ctx.runMutation(internal.metaAds.saveConnection, {
      workspaceId: args.workspaceId,
      source: "serverToken",
      accessToken: token,
      scopes,
      metaUserId: String(me.body?.id ?? "unknown"),
      metaUserName: String(me.body?.name ?? "Meta user"),
      connectedBy: owner ?? "system",
      calls: counter.ok,
    });
    if (!args.adAccountId) return { connected: true, synced: null };
    const connection = await liveConnection(ctx, args.workspaceId);
    const check = await graphGet(token, `${args.adAccountId}?fields=name,currency`, counter);
    if (!check.ok) return { connected: true, synced: check.code };
    await ctx.runMutation(internal.metaAds.setAccount, {
      connectionId: connection._id,
      adAccountId: args.adAccountId,
      adAccountName: String(check.body?.name ?? args.adAccountId),
      currency: String(check.body?.currency ?? "USD"),
      userId: owner ?? "system",
    });
    if (isRange(args.range)) await ctx.runMutation(internal.metaAds.setRange, { connectionId: connection._id, range: args.range });
    return { connected: true, synced: (await syncConnection(ctx, await liveConnection(ctx, args.workspaceId))).code };
  },
});

export const ownerOf = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    return members.find((row) => row.active && row.role === "owner")?.userId ?? null;
  },
});
