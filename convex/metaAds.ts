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
import { GROWTH_ARCHITECT } from "./catalog";
import { notAllowed, notFound, userError } from "./lib/errors";
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
  safeReturnPath,
  totalsOf,
  fillDays,
  observe,
  SYNC_STEPS,
  TIER,
  utcDay,
  type CampaignRow,
  type SyncStepKey,
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
    if (!connection) return { configured, canManage: ctx.member.role === "owner", connection: null, snapshot: null, runs: [], usage: null, observations: [] };
    const snapshot = connection.adAccountId
      ? await ctx.db
          .query("metaAdSnapshots")
          .withIndex("by_workspace_account", (q) => q.eq("workspaceId", ctx.workspaceId).eq("adAccountId", connection.adAccountId!))
          .unique()
      : null;
    const total = connection.callsOk + connection.callsFailed;
    const runs = await ctx.db
      .query("metaSyncRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(8);
    const since = utcDay(Date.now() - (TIER.days - 1) * 86_400_000);
    const dayRows = await ctx.db
      .query("metaCallDays")
      .withIndex("by_workspace_day", (q) => q.eq("workspaceId", ctx.workspaceId).gte("day", since))
      .take(TIER.days + 1);
    const days = fillDays(dayRows, Date.now());
    const windowOk = days.reduce((sum, row) => sum + row.ok, 0);
    const windowFailed = days.reduce((sum, row) => sum + row.failed, 0);
    const currency = snapshot?.currency ?? connection.currency ?? "USD";
    return {
      configured,
      canManage: ctx.member.role === "owner",
      connection: {
        source: connection.source,
        status: connection.status,
        agents: grantedAgents(connection),
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
      runs: runs.map((row) => ({
        id: row._id,
        trigger: row.trigger,
        status: row.status,
        code: row.code ?? null,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        steps: row.steps,
        callsOk: row.callsOk,
        callsFailed: row.callsFailed,
      })),
      usage: {
        days,
        ok: windowOk,
        failed: windowFailed,
        successRate: windowOk + windowFailed > 0 ? windowOk / (windowOk + windowFailed) : null,
        target: { calls: TIER.calls, successRate: TIER.successRate, days: TIER.days },
      },
      observations: snapshot ? observe(snapshot.campaigns, snapshot.totals, currency) : [],
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

/** The agents a workspace connection is granted to. Missing means the Growth Architect only. */
export function grantedAgents(connection: Pick<Doc<"metaConnections">, "agents">) {
  return connection.agents ?? [GROWTH_ARCHITECT];
}

/** Grants or withdraws an agent's use of the workspace's Meta connection. Owner only. */
export const setAgentAccess = ownerMutation({
  args: { agentSlug: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
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
      action: args.granted ? "meta.agent_granted" : "meta.agent_withdrawn",
      subject: args.agentSlug,
    });
    return null;
  },
});

// ---------- Facebook Login ----------

/** Starts Facebook Login for this workspace. Owner only. Returns the dialog URL to open. */
export const startConnect = ownerMutation({
  args: { returnOrigin: v.optional(v.string()), returnPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const appId = process.env.META_APP_ID;
    if (!appId || !process.env.META_APP_SECRET) throw new Error("The Meta app is not set up on this deployment yet.");
    const nonce = randomHex(24);
    await ctx.db.insert("metaOauthStates", {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      nonce,
      returnOrigin: safeReturnOrigin(args.returnOrigin) ?? undefined,
      returnPath: safeReturnPath(args.returnPath) ?? undefined,
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
    return { workspaceId: row.workspaceId, userId: row.userId, returnOrigin: row.returnOrigin ?? null, returnPath: row.returnPath ?? null };
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
    if (args.ok + args.failed > 0) {
      const day = utcDay(Date.now());
      const counts = await ctx.db
        .query("metaCallDays")
        .withIndex("by_workspace_day", (q) => q.eq("workspaceId", row.workspaceId).eq("day", day))
        .unique();
      if (counts) await ctx.db.patch(counts._id, { ok: counts.ok + args.ok, failed: counts.failed + args.failed });
      else await ctx.db.insert("metaCallDays", { workspaceId: row.workspaceId, day, ok: args.ok, failed: args.failed });
    }
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
  if (!connection) throw userError("Connect your Meta ads first.");
  return connection;
}

export const startRun = internalMutation({
  args: { workspaceId: v.id("workspaces"), adAccountId: v.string(), trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("connect")) },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("metaSyncRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .first();
    // A read that stopped mid-way (a crash or timeout) is closed so it does not look busy forever.
    if (running?.status === "running") await ctx.db.patch(running._id, { status: "failed", code: "interrupted", finishedAt: Date.now() });
    return ctx.db.insert("metaSyncRuns", {
      ...args,
      startedAt: Date.now(),
      status: "running",
      steps: SYNC_STEPS.map((key, index) => ({ key, status: index === 0 ? ("working" as const) : ("waiting" as const), calls: 0 })),
      callsOk: 0,
      callsFailed: 0,
    });
  },
});

export const stepRun = internalMutation({
  args: { runId: v.id("metaSyncRuns"), key: v.string(), ok: v.boolean(), calls: v.number(), failed: v.number(), rows: v.optional(v.number()), ms: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const at = run.steps.findIndex((step) => step.key === args.key);
    const steps = run.steps.map((step, index) => {
      if (index === at) return { ...step, status: args.ok ? ("done" as const) : ("failed" as const), calls: args.calls, rows: args.rows, ms: args.ms };
      if (index === at + 1 && args.ok) return { ...step, status: "working" as const };
      return step;
    });
    await ctx.db.patch(run._id, { steps, callsOk: run.callsOk + args.calls - args.failed, callsFailed: run.callsFailed + args.failed });
    return null;
  },
});

export const finishRun = internalMutation({
  args: { runId: v.id("metaSyncRuns"), code: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await ctx.db.patch(run._id, { status: args.code === "ok" ? "done" : "failed", code: args.code, finishedAt: Date.now() });
    // Keep the last 30 reads per workspace.
    const old = await ctx.db
      .query("metaSyncRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
      .order("desc")
      .take(60);
    for (const row of old.slice(30)) await ctx.db.delete(row._id);
    return null;
  },
});

type Trigger = "manual" | "schedule" | "connect";

/** Reads the chosen account over its window, one recorded step at a time: access, results, campaigns, trend, save. */
async function syncConnection(ctx: ActionCtx, connection: Doc<"metaConnections">, trigger: Trigger): Promise<{ code: string }> {
  if (!connection.adAccountId) return { code: "no_account" };
  const counter: Counter = { ok: 0, failed: 0, lastCode: null };
  const account = connection.adAccountId;
  const token = connection.accessToken;
  const range = isRange(connection.range) ? connection.range : "last_30d";
  const runId = await ctx.runMutation(internal.metaAds.startRun, { workspaceId: connection.workspaceId, adAccountId: account, trigger });

  const step = async <T>(key: SyncStepKey, work: () => Promise<{ ok: boolean; code: string; rows?: number; value?: T }>) => {
    const before = { ok: counter.ok, failed: counter.failed };
    const started = Date.now();
    const result = await work();
    await ctx.runMutation(internal.metaAds.stepRun, {
      runId,
      key,
      ok: result.ok,
      calls: counter.ok + counter.failed - before.ok - before.failed,
      failed: counter.failed - before.failed,
      rows: result.rows,
      ms: Date.now() - started,
    });
    return result;
  };

  let code = "ok";
  const access = await step("access", async () => {
    const check = await graphGet(token, `${account}?fields=name,currency,account_status`, counter);
    return { ok: check.ok, code: check.code, rows: check.ok ? 1 : 0 };
  });
  if (!access.ok) code = access.code;

  const insights =
    code === "ok"
      ? await step("results", async () => {
          const list = await graphList<InsightRow>(
            token,
            `${account}/insights?level=campaign&date_preset=${range}&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions,date_start,date_stop&limit=100`,
            counter,
          );
          return { ok: list.ok, code: list.code, rows: list.rows.length, value: list.rows };
        })
      : null;
  if (insights && !insights.ok) code = insights.code;

  const campaigns =
    code === "ok"
      ? await step("campaigns", async () => {
          const list = await graphList<CampaignRow>(token, `${account}/campaigns?fields=id,name,status,effective_status,objective&limit=100`, counter);
          return { ok: list.ok, code: list.code, rows: list.rows.length, value: list.rows };
        })
      : null;
  if (campaigns && !campaigns.ok) code = campaigns.code;

  const daily =
    code === "ok"
      ? await step("trend", async () => {
          const list = await graphList<InsightRow>(token, `${account}/insights?date_preset=${range}&time_increment=${RANGES[range].step}&fields=spend,impressions,clicks&limit=100`, counter);
          return { ok: list.ok, code: list.code, rows: list.rows.length, value: list.rows };
        })
      : null;
  if (daily && !daily.ok) code = daily.code;

  if (code === "ok") {
    await step("save", async () => {
      const insightRows = (insights?.value ?? []) as InsightRow[];
      const joined = joinCampaigns((campaigns?.value ?? []) as CampaignRow[], insightRows);
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      await ctx.runMutation(internal.metaAds.saveSnapshot, {
        workspaceId: connection.workspaceId,
        adAccountId: account,
        currency: connection.currency ?? "USD",
        range,
        dateStart: insightRows[0]?.date_start ?? monthAgo,
        dateStop: insightRows[0]?.date_stop ?? today,
        totals: totalsOf(joined),
        daily: dailySeries((daily?.value ?? []) as InsightRow[]),
        campaigns: joined.slice(0, 100),
      });
      return { ok: true, code: "ok", rows: joined.length };
    });
  }
  await ctx.runMutation(internal.metaAds.finishRun, { runId, code });
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
    if (!isAdAccountId(args.adAccountId)) throw userError("That is not an ad account id.");
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
    return syncConnection(ctx, fresh, "connect");
  },
});

/** Reads the chosen account again now, optionally over a new window. Owner or Manager. */
export const syncNow = memberAction({
  args: { range: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ code: string }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, ["owner", "manager"]);
    const connection = await liveConnection(ctx, ctx.workspaceId);
    if (args.range !== undefined) {
      if (!isRange(args.range)) throw userError("Pick last_30d, last_90d or maximum.");
      await ctx.runMutation(internal.metaAds.setRange, { connectionId: connection._id, range: args.range });
      return syncConnection(ctx, { ...connection, range: args.range }, "manual");
    }
    return syncConnection(ctx, connection, "manual");
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
    const runs = await ctx.db
      .query("metaSyncRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(100);
    for (const row of runs) await ctx.db.delete(row._id);
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
      if (connection) await syncConnection(ctx, connection, "schedule");
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
    return { connected: true, synced: (await syncConnection(ctx, await liveConnection(ctx, args.workspaceId), "connect")).code };
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

/**
 * A full read-only pass over every active ad account the workspace's Meta connection reaches: account
 * details, campaigns, ad sets, ads, and insights at each level. Paced to stay well inside Meta's rate
 * limits, and every call is counted on the connection. Internal only; run from the dashboard.
 */
export const readAllAccounts = internalAction({
  args: { workspaceId: v.id("workspaces"), pauseMs: v.optional(v.number()), maxCalls: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ ok: number; failed: number; accounts: { id: string; name: string; ok: number; failed: number; stoppedAt: string | null }[] }> => {
    const connection = await liveConnection(ctx, args.workspaceId);
    const pause = Math.max(300, args.pauseMs ?? 800);
    const budget = Math.min(400, args.maxCalls ?? 300);
    const counter: Counter = { ok: 0, failed: 0, lastCode: null };
    const sleep = () => new Promise((resolve) => setTimeout(resolve, pause));
    const token = connection.accessToken;

    const list = await graphGet(token, "me/adaccounts?fields=id,name,account_status&limit=100", counter);
    const accounts = (((list.body?.data as { id: string; name?: string; account_status?: number }[] | undefined) ?? []) as { id: string; name?: string; account_status?: number }[])
      .filter((row) => isAdAccountId(row.id) && row.account_status === 1);
    const reads = [
      "?fields=name,currency,account_status,amount_spent,timezone_name",
      "/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=100",
      "/adsets?fields=id,name,status,campaign_id,optimization_goal,billing_event&limit=100",
      "/ads?fields=id,name,status,adset_id,campaign_id&limit=100",
      "/insights?level=campaign&date_preset=last_90d&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions&limit=100",
      "/insights?level=adset&date_preset=last_90d&fields=adset_id,adset_name,spend,impressions,clicks,actions&limit=100",
      "/insights?level=ad&date_preset=last_90d&fields=ad_id,ad_name,spend,impressions,clicks,actions&limit=100",
      "/insights?date_preset=maximum&time_increment=monthly&fields=spend,impressions,clicks,reach&limit=100",
    ];
    const results: { id: string; name: string; ok: number; failed: number; stoppedAt: string | null }[] = [];
    for (const account of accounts) {
      const before = { ok: counter.ok, failed: counter.failed };
      let stoppedAt: string | null = null;
      for (const read of reads) {
        if (counter.ok + counter.failed >= budget) break;
        await sleep();
        const result = await graphGet(token, `${account.id}${read}`, counter);
        if (!result.ok) {
          stoppedAt = result.code;
          // Rate limits and access problems end this account's pass; nothing is retried around a block.
          if (result.code === "rate_limited" || result.code === "permission_missing" || result.code.startsWith("token")) break;
        }
      }
      results.push({ id: account.id, name: account.name ?? account.id, ok: counter.ok - before.ok, failed: counter.failed - before.failed, stoppedAt });
      if (counter.ok + counter.failed >= budget || counter.lastCode === "rate_limited") break;
    }
    await ctx.runMutation(internal.metaAds.recordCalls, { connectionId: connection._id, ok: counter.ok, failed: counter.failed, code: counter.lastCode ?? "ok" });
    return { ok: counter.ok, failed: counter.failed, accounts: results };
  },
});
