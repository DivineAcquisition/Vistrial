/**
 * Connect HighLevel: a read-only link from one client (or the organization itself) to one HighLevel
 * sub-account. Vistrial reads pipelines, deals, leads and their activity; it never creates, edits, messages,
 * books or deletes anything in HighLevel. Tokens stay on the server: no public function returns one.
 * docs/rebuild/crm-highlevel.md.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { closeOpenActions } from "./crmActions";
import { writeAudit } from "./lib/audit";
import { memberAction, ownerMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { isNonce, randomHex, tokenErrorCode } from "./lib/integrations/oauth";
import { fillDays, safeReturnOrigin, safeReturnPath, utcDay } from "./lib/metaGraph";
import {
  changesSince,
  HL_API,
  HL_CALLBACK_PATH,
  HL_KEEP,
  HL_LIMITS,
  HL_SCOPES,
  HL_STEPS,
  apiVersion,
  hlErrorCode,
  installUrl,
  isConfigured,
  isHlId,
  keepDeal,
  messagesOf,
  parseContact,
  parseDeal,
  parseEvent,
  parseLocation,
  parseMessage,
  parsePipelines,
  pauseAfter,
  stopsRead,
  summarize,
  type Activity,
  type Contact,
  type Deal,
  type HlStepKey,
  type Pipeline,
  type Summary,
} from "./lib/highLevel";
import { isAllowedWrite } from "./lib/crmActions";
import { isAdmin, isOwner } from "./lib/roles";

const STATE_MS = 10 * 60 * 1000;
const DAY = 86_400_000;
/** A token this close to its end is renewed before it is used. */
const RENEW_BEFORE_MS = 10 * 60 * 1000;
/** A renewal that has not finished in this long is treated as abandoned. */
const REFRESH_LOCK_MS = 60 * 1000;
const TIMEOUT_MS = 20_000;
/** Rows written or deleted per mutation, well inside Convex's limits. */
const BATCH = 400;

const clientArg = { clientId: v.optional(v.id("clients")) };
type Trigger = "manual" | "schedule" | "connect";

export function redirectUri() {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new Error("This deployment has no site URL.");
  return `${site.replace(/\/$/, "")}${HL_CALLBACK_PATH}`;
}

/** The pause between calls. Tests set HIGHLEVEL_CALL_GAP_MS=0; production keeps the default. */
function callGap() {
  const value = Number(process.env.HIGHLEVEL_CALL_GAP_MS);
  return Number.isFinite(value) && value >= 0 ? value : 150;
}

const wait = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

// ---------- What screens read ----------

/**
 * The connection for a client (or the organization) without its token, and what the last read added up to.
 * Any member who may see that client. What Vistrial did (each read, calls per day) is for the Owner only.
 */
export const status = workspaceQuery({
  args: clientArg,
  handler: async (ctx, args) => {
    if (args.clientId) {
      // Through the guarded database: a client this member may not see reads as missing.
      const client = await ctx.db.get(args.clientId);
      if (!client || client.workspaceId !== ctx.workspaceId) notFound();
    }
    const owner = isOwner(ctx.member.role);
    const base = { configured: isConfigured(), canConnect: owner, canRefresh: isAdmin(ctx.member.role), isOwner: owner };
    const connection = await ctx.db
      .query("crmConnections")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", args.clientId))
      .unique();
    if (!connection) return { ...base, connection: null, summary: null, runs: [], usage: null };
    const summary = await ctx.db
      .query("crmSummaries")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();
    const total = connection.callsOk + connection.callsFailed;
    // Everyone who sees the card sees that a read is running; only the Owner sees what it did.
    const latest = await ctx.db
      .query("crmSyncRuns")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .order("desc")
      .first();
    const runs = owner
      ? await ctx.db
          .query("crmSyncRuns")
          .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
          .order("desc")
          .take(8)
      : [];
    let usage = null;
    if (owner) {
      const since = utcDay(Date.now() - 14 * DAY);
      const rows = await ctx.db
        .query("crmCallDays")
        .withIndex("by_connection_day", (q) => q.eq("connectionId", connection._id).gte("day", since))
        .take(16);
      const days = fillDays(rows, Date.now(), 15);
      const ok = days.reduce((sum, row) => sum + row.ok, 0);
      const failed = days.reduce((sum, row) => sum + row.failed, 0);
      usage = { days, ok, failed, successRate: ok + failed > 0 ? ok / (ok + failed) : null };
    }
    return {
      ...base,
      connection: {
        status: connection.status,
        accountId: connection.accountId,
        accountName: connection.accountName,
        currency: connection.currency,
        connectedAt: connection.connectedAt,
        scopes: connection.scopes,
        lastSyncAt: connection.lastSyncAt ?? null,
        lastSyncCode: connection.lastSyncCode ?? null,
        running: latest?.status === "running",
        acting: connection.actingEnabled === true,
        calls: { ok: connection.callsOk, failed: connection.callsFailed, successRate: total > 0 ? connection.callsOk / total : null },
      },
      summary: summary ? { syncedAt: summary.syncedAt, ...(summary.summary as Summary) } : null,
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
      usage,
    };
  },
});

/** Every CRM connection this member may see, for the Data settings card. No tokens, no lead data. */
export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("crmConnections")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(200);
    const out = [];
    for (const row of rows) {
      const client = row.clientId ? await ctx.db.get(row.clientId) : null;
      out.push({ clientId: row.clientId ?? null, clientName: client?.name ?? null, accountName: row.accountName, status: row.status, lastSyncAt: row.lastSyncAt ?? null });
    }
    return { configured: isConfigured(), canConnect: isOwner(ctx.member.role), connections: out };
  },
});

// ---------- Connecting ----------

async function requireClient(ctx: MutationCtx, workspaceId: Id<"workspaces">, clientId: Id<"clients"> | undefined) {
  if (!clientId) return;
  const client = await ctx.db.get(clientId);
  if (!client || client.workspaceId !== workspaceId) notFound();
  if (client.status !== "active") throw userError("That client is archived. Bring it back before connecting its CRM.");
}

/** Starts HighLevel's install page for this client (or the organization). Owner only. Returns the address to open. */
export const startConnect = ownerMutation({
  args: { ...clientArg, returnOrigin: v.optional(v.string()), returnPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const clientId = process.env.HIGHLEVEL_CLIENT_ID;
    if (!clientId || !process.env.HIGHLEVEL_CLIENT_SECRET) throw userError("HighLevel is not set up on this deployment yet.");
    await requireClient(ctx, ctx.workspaceId, args.clientId);
    const nonce = randomHex(24);
    await ctx.db.insert("crmOauthStates", {
      workspaceId: ctx.workspaceId,
      clientId: args.clientId,
      userId: ctx.identity.subject,
      provider: "highlevel",
      nonce,
      returnOrigin: safeReturnOrigin(args.returnOrigin) ?? undefined,
      returnPath: safeReturnPath(args.returnPath) ?? undefined,
      createdAt: Date.now(),
    });
    return { url: installUrl({ clientId, redirectUri: redirectUri(), state: nonce }) };
  },
});

/** Uses a sign-in attempt once. Null when it is unknown, used, too old, or its Owner is no longer an Owner. */
export const consumeState = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    if (!isNonce(args.nonce)) return null;
    const row = await ctx.db
      .query("crmOauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!row || row.usedAt || Date.now() - row.createdAt > STATE_MS) return null;
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", row.userId))
      .unique();
    if (!member?.active || !isOwner(member.role)) return null;
    if (row.clientId) {
      const client = await ctx.db.get(row.clientId);
      if (!client || client.workspaceId !== row.workspaceId || client.status !== "active") return null;
    }
    return { workspaceId: row.workspaceId, clientId: row.clientId ?? null, userId: row.userId, returnOrigin: row.returnOrigin ?? null, returnPath: row.returnPath ?? null };
  },
});

/**
 * Saves a new connection. Refused when the same sub-account is already connected to another client of this
 * workspace. Connecting a different sub-account to the same client replaces the old one and its data.
 */
export const saveConnection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
    accountId: v.string(),
    accountName: v.string(),
    companyId: v.optional(v.string()),
    currency: v.string(),
    timezone: v.optional(v.string()),
    connectedBy: v.string(),
    calls: v.number(),
  },
  handler: async (ctx, args): Promise<{ ok: true; connectionId: Id<"crmConnections"> } | { ok: false; code: string }> => {
    const sameAccount = await ctx.db
      .query("crmConnections")
      .withIndex("by_account", (q) => q.eq("provider", "highlevel").eq("accountId", args.accountId))
      .take(50);
    if (sameAccount.some((row) => row.workspaceId === args.workspaceId && row.clientId !== args.clientId)) return { ok: false, code: "already_connected" };
    const existing = await ctx.db
      .query("crmConnections")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", args.workspaceId).eq("clientId", args.clientId))
      .unique();
    const { calls, ...fields } = args;
    const row = {
      ...fields,
      provider: "highlevel" as const,
      status: "connected" as const,
      connectedAt: Date.now(),
      needsReconnectSince: undefined,
      refreshingSince: undefined,
    };
    let connectionId: Id<"crmConnections">;
    if (existing && existing.accountId === args.accountId) {
      await ctx.db.patch(existing._id, { ...row, callsOk: existing.callsOk + calls });
      connectionId = existing._id;
    } else {
      if (existing) await removeConnection(ctx, existing, args.connectedBy, "crm.replaced");
      connectionId = await ctx.db.insert("crmConnections", { ...row, callsOk: calls, callsFailed: 0 });
    }
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.connectedBy, action: "crm.connected", subject: `highlevel:${args.accountId}` });
    return { ok: true, connectionId };
  },
});

/**
 * Finishes an install that came back to the callback: uses the state once, swaps the code for a sub-account
 * token on the server, checks every read scope was granted, names the sub-account and saves the connection.
 */
export async function completeConnect(ctx: ActionCtx, url: URL) {
  const state = await ctx.runMutation(internal.highLevel.consumeState, { nonce: url.searchParams.get("state") ?? "" });
  if (!state) return { outcome: "expired", returnOrigin: null, returnPath: null };
  const back = { returnOrigin: state.returnOrigin, returnPath: state.returnPath };
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return { outcome: "cancelled", ...back };
  const id = process.env.HIGHLEVEL_CLIENT_ID;
  const secret = process.env.HIGHLEVEL_CLIENT_SECRET;
  if (!id || !secret) return { outcome: "not_configured", ...back };

  const exchanged = await tokenRequest({ grant_type: "authorization_code", code, user_type: "Location", redirect_uri: redirectUri() });
  if (!exchanged.ok) return { outcome: "failed", ...back };
  const tokens = exchanged.body;
  // An agency-level install gives a token that reaches every sub-account. Not accepted: choose one sub-account.
  if (tokens.userType !== "Location" || !isHlId(tokens.locationId)) return { outcome: "agency_install", ...back };
  const granted = typeof tokens.scope === "string" ? tokens.scope.split(/[\s,]+/).filter(Boolean) : [];
  if (!HL_SCOPES.every((scope) => granted.includes(scope))) return { outcome: "missing_permission", ...back };

  const counter: Counter = { ok: 0, failed: 0, lastCode: null };
  const located = await hlRequest(tokens.access_token as string, `/locations/${tokens.locationId}`, counter);
  const location = located.ok ? parseLocation(located.body) : null;
  if (!location) return { outcome: "failed", ...back };
  const saved = await ctx.runMutation(internal.highLevel.saveConnection, {
    workspaceId: state.workspaceId,
    clientId: state.clientId ?? undefined,
    accessToken: tokens.access_token as string,
    refreshToken: tokens.refresh_token as string,
    tokenExpiresAt: Date.now() + Number(tokens.expires_in) * 1000,
    scopes: granted.filter((scope) => (HL_SCOPES as readonly string[]).includes(scope)),
    accountId: location.id,
    accountName: location.name,
    companyId: isHlId(tokens.companyId) ? tokens.companyId : undefined,
    currency: location.currency,
    timezone: location.timezone ?? undefined,
    connectedBy: state.userId,
    calls: counter.ok,
  });
  if (!saved.ok) return { outcome: saved.code, ...back };
  await ctx.scheduler.runAfter(0, internal.highLevel.syncOne, { connectionId: saved.connectionId, trigger: "connect" });
  return { outcome: "connected", ...back };
}

type TokenBody = Record<string, unknown> & { access_token: string; refresh_token: string; expires_in: number };

/** Posts to HighLevel's token address with the app's own id and secret. Answers become short codes. */
async function tokenRequest(fields: Record<string, string>): Promise<{ ok: true; body: TokenBody } | { ok: false; code: string }> {
  const id = process.env.HIGHLEVEL_CLIENT_ID;
  const secret = process.env.HIGHLEVEL_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, code: "not_configured" };
  let response: Response;
  try {
    response = await fetch(`${HL_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...fields, client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: "connection_failed" };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) return { ok: false, code: tokenErrorCode(response.status, body) };
  const lifetime = Number(body?.expires_in);
  if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string" || !Number.isFinite(lifetime) || lifetime <= 0) return { ok: false, code: "token_failed" };
  return { ok: true, body: { ...body, access_token: body.access_token, refresh_token: body.refresh_token, expires_in: lifetime } };
}

// ---------- Tokens ----------

export const connectionById = internalQuery({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args) => ctx.db.get(args.connectionId),
});

export const claimRefresh = internalMutation({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args): Promise<{ state: "claimed"; refreshToken: string } | { state: "busy" } | { state: "gone" }> => {
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.status !== "connected") return { state: "gone" };
    if (row.refreshingSince && Date.now() - row.refreshingSince < REFRESH_LOCK_MS) return { state: "busy" };
    await ctx.db.patch(row._id, { refreshingSince: Date.now() });
    return { state: "claimed", refreshToken: row.refreshToken };
  },
});

/** Saves a renewal: the new access token and the new one-use renewal token, in one write. */
export const saveTokens = internalMutation({
  args: { connectionId: v.id("crmConnections"), accessToken: v.string(), refreshToken: v.string(), tokenExpiresAt: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    await ctx.db.patch(row._id, { accessToken: args.accessToken, refreshToken: args.refreshToken, tokenExpiresAt: args.tokenExpiresAt, refreshingSince: undefined });
    return null;
  },
});

/** Ends a failed renewal. `rejected` means HighLevel signed Vistrial out; an outage does not. */
export const refreshFailed = internalMutation({
  args: { connectionId: v.id("crmConnections"), rejected: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      refreshingSince: undefined,
      ...(args.rejected ? { status: "needsReconnect" as const, needsReconnectSince: row.needsReconnectSince ?? Date.now() } : {}),
    });
    return null;
  },
});

type Live = { ok: true; token: string; connection: Doc<"crmConnections"> } | { ok: false; code: string };

/** A token that works now, renewed first when it is about to end. It must not leave the server. */
export async function liveToken(ctx: ActionCtx, connectionId: Id<"crmConnections">): Promise<Live> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const connection: Doc<"crmConnections"> | null = await ctx.runQuery(internal.highLevel.connectionById, { connectionId });
    if (!connection) return { ok: false, code: "not_connected" };
    if (connection.status !== "connected") return { ok: false, code: "token_rejected" };
    if (connection.tokenExpiresAt - Date.now() > RENEW_BEFORE_MS) return { ok: true, token: connection.accessToken, connection };
    const claim = await ctx.runMutation(internal.highLevel.claimRefresh, { connectionId });
    if (claim.state === "gone") return { ok: false, code: "not_connected" };
    if (claim.state === "busy") {
      await wait(1500);
      continue;
    }
    const renewed = await tokenRequest({ grant_type: "refresh_token", refresh_token: claim.refreshToken, user_type: "Location", redirect_uri: redirectUri() });
    if (!renewed.ok) {
      await ctx.runMutation(internal.highLevel.refreshFailed, { connectionId, rejected: renewed.code === "token_rejected" });
      return { ok: false, code: renewed.code };
    }
    const fresh = { accessToken: renewed.body.access_token, refreshToken: renewed.body.refresh_token, tokenExpiresAt: Date.now() + renewed.body.expires_in * 1000 };
    await ctx.runMutation(internal.highLevel.saveTokens, { connectionId, ...fresh });
    return { ok: true, token: fresh.accessToken, connection: { ...connection, ...fresh } };
  }
  return { ok: false, code: "busy" };
}

// ---------- HighLevel, read-only ----------

export type Counter = { ok: number; failed: number; lastCode: string | null };

/**
 * One call to HighLevel. GET, or POST only for `/contacts/search`, which is a search that changes nothing.
 * Paced to stay under HighLevel's burst limit; every call is counted.
 */
export async function hlRequest(token: string, path: string, counter: Counter, search?: Record<string, unknown>) {
  if (search !== undefined && path !== "/contacts/search") throw new Error("Only the contact search is sent as a POST.");
  let response: Response;
  try {
    response = await fetch(`${HL_API}${path}`, {
      method: search ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: apiVersion(path),
        Accept: "application/json",
        ...(search ? { "Content-Type": "application/json" } : {}),
      },
      body: search ? JSON.stringify(search) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    counter.failed++;
    counter.lastCode = "connection_failed";
    return { ok: false as const, code: "connection_failed", body: null };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  await wait(pauseAfter(response.headers, callGap()));
  if (!response.ok) {
    counter.failed++;
    counter.lastCode = hlErrorCode(response.status);
    return { ok: false as const, code: counter.lastCode, body: null };
  }
  counter.ok++;
  return { ok: true as const, code: "ok", body };
}

/**
 * One approved write. Only a request built by `writeRequest` (convex/lib/crmActions.ts) for an approved
 * action reaches here, and the method and path are checked again against the allow-list before sending.
 */
export async function hlWrite(token: string, request: { method: string; path: string; body: Record<string, unknown> }, counter: Counter) {
  if (!isAllowedWrite(request.method, request.path)) throw new Error("Refused: not an allowed HighLevel write.");
  let response: Response;
  try {
    response = await fetch(`${HL_API}${request.path}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, Version: apiVersion(request.path), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    counter.failed++;
    counter.lastCode = "connection_failed";
    return { ok: false as const, code: "connection_failed", body: null };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    counter.failed++;
    counter.lastCode = hlErrorCode(response.status);
    return { ok: false as const, code: counter.lastCode, body: null };
  }
  counter.ok++;
  return { ok: true as const, code: "ok", body };
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined).map(([key, value]) => [key, String(value)])).toString();

// ---------- Recording a read ----------

export const recordCalls = internalMutation({
  args: { connectionId: v.id("crmConnections"), ok: v.number(), failed: v.number(), code: v.optional(v.string()), synced: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (!row) return null;
    if (args.ok + args.failed > 0) {
      const day = utcDay(Date.now());
      const counts = await ctx.db
        .query("crmCallDays")
        .withIndex("by_connection_day", (q) => q.eq("connectionId", row._id).eq("day", day))
        .unique();
      if (counts) await ctx.db.patch(counts._id, { ok: counts.ok + args.ok, failed: counts.failed + args.failed });
      else await ctx.db.insert("crmCallDays", { workspaceId: row.workspaceId, connectionId: row._id, day, ok: args.ok, failed: args.failed });
    }
    const rejected = args.code === "token_rejected";
    await ctx.db.patch(row._id, {
      callsOk: row.callsOk + args.ok,
      callsFailed: row.callsFailed + args.failed,
      ...(args.synced ? { lastSyncAt: Date.now(), lastSyncCode: args.code ?? "ok" } : {}),
      ...(rejected ? { status: "needsReconnect" as const, needsReconnectSince: row.needsReconnectSince ?? Date.now() } : {}),
    });
    return null;
  },
});

export const startRun = internalMutation({
  args: { connectionId: v.id("crmConnections"), trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("connect")) },
  handler: async (ctx, args): Promise<Id<"crmSyncRuns"> | null> => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const last = await ctx.db
      .query("crmSyncRuns")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .order("desc")
      .first();
    if (last?.status === "running") {
      // One read at a time. A read stuck for ten minutes (a crash or timeout) is closed so it does not look busy forever.
      if (Date.now() - last.startedAt < 10 * 60 * 1000) return null;
      await ctx.db.patch(last._id, { status: "failed", code: "interrupted", finishedAt: Date.now() });
    }
    return ctx.db.insert("crmSyncRuns", {
      workspaceId: connection.workspaceId,
      clientId: connection.clientId,
      connectionId: connection._id,
      trigger: args.trigger,
      startedAt: Date.now(),
      status: "running",
      steps: HL_STEPS.map((key, index) => ({ key, status: index === 0 ? ("working" as const) : ("waiting" as const), calls: 0 })),
      callsOk: 0,
      callsFailed: 0,
    });
  },
});

export const stepRun = internalMutation({
  args: { runId: v.id("crmSyncRuns"), key: v.string(), ok: v.boolean(), calls: v.number(), failed: v.number(), rows: v.optional(v.number()), ms: v.number() },
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
  args: { runId: v.id("crmSyncRuns"), code: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await ctx.db.patch(run._id, { status: args.code === "ok" ? "done" : "failed", code: args.code, finishedAt: Date.now() });
    // Keep the last 30 reads per connection.
    const old = await ctx.db
      .query("crmSyncRuns")
      .withIndex("by_connection", (q) => q.eq("connectionId", run.connectionId))
      .order("desc")
      .take(60);
    for (const row of old.slice(30)) await ctx.db.delete(row._id);
    return null;
  },
});

export const setLocationInfo = internalMutation({
  args: { connectionId: v.id("crmConnections"), accountName: v.string(), currency: v.string(), timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (row) await ctx.db.patch(row._id, { accountName: args.accountName, currency: args.currency, timezone: args.timezone });
    return null;
  },
});

/** Each kept deal's stage and status, to find what moved since the last read. */
export const previousDeals = internalQuery({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("crmDeals")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(HL_LIMITS.dealPages * 100 + 500);
    return rows.map((row) => ({ externalId: row.externalId, stageId: row.stageId, status: row.status }));
  },
});

/** Activity already kept from the last 30 days: stage changes found by earlier reads count toward the summary. */
export const recentActivities = internalQuery({
  args: { connectionId: v.id("crmConnections"), since: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("crmActivities")
      .withIndex("by_connection_at", (q) => q.eq("connectionId", args.connectionId).gte("at", args.since))
      .take(4000);
    return rows.map((row) => ({ externalId: row.externalId, kind: row.kind, direction: row.direction ?? null, at: row.at }));
  },
});

const optional = <T>(value: T | null) => (value === null ? undefined : value);

const dealValidator = v.object({
  externalId: v.string(),
  pipelineId: v.string(),
  stageId: v.string(),
  status: v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("abandoned")),
  value: v.number(),
  source: v.union(v.string(), v.null()),
  contactId: v.union(v.string(), v.null()),
  assignedTo: v.union(v.string(), v.null()),
  createdAt: v.union(v.number(), v.null()),
  updatedAt: v.union(v.number(), v.null()),
  lastStageChangeAt: v.union(v.number(), v.null()),
  lastStatusChangeAt: v.union(v.number(), v.null()),
});
const contactValidator = v.object({
  externalId: v.string(),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  source: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  addedAt: v.union(v.number(), v.null()),
  lastActivityAt: v.union(v.number(), v.null()),
});
const activityValidator = v.object({
  externalId: v.string(),
  kind: v.union(
    v.literal("call"),
    v.literal("sms"),
    v.literal("email"),
    v.literal("chat"),
    v.literal("social"),
    v.literal("appointment"),
    v.literal("stage_change"),
    v.literal("status_change"),
  ),
  direction: v.union(v.literal("inbound"), v.literal("outbound"), v.null()),
  at: v.number(),
  contactId: v.union(v.string(), v.null()),
  dealId: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  seconds: v.union(v.number(), v.null()),
  fromStage: v.union(v.string(), v.null()),
  toStage: v.union(v.string(), v.null()),
});

/**
 * Writes one batch of what a read found. Each kind is keyed by HighLevel's id, so a row is updated, not
 * duplicated. Refused when the connection has gone meanwhile: a read that finishes after a disconnect must
 * not bring the data back.
 */
export const saveBatch = internalMutation({
  args: {
    connectionId: v.id("crmConnections"),
    seenAt: v.number(),
    pipelines: v.optional(v.array(v.object({ externalId: v.string(), name: v.string(), stages: v.array(v.object({ id: v.string(), name: v.string(), position: v.number() })) }))),
    deals: v.optional(v.array(dealValidator)),
    contacts: v.optional(v.array(contactValidator)),
    activities: v.optional(v.array(activityValidator)),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return { saved: false };
    const owner = { workspaceId: connection.workspaceId, clientId: connection.clientId, connectionId: connection._id };
    // One lookup per kind: Convex's index types do not carry across a union of tables.
    const find = {
      crmPipelines: (externalId: string) => ctx.db.query("crmPipelines").withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", externalId)).unique(),
      crmDeals: (externalId: string) => ctx.db.query("crmDeals").withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", externalId)).unique(),
      crmContacts: (externalId: string) => ctx.db.query("crmContacts").withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", externalId)).unique(),
      crmActivities: (externalId: string) => ctx.db.query("crmActivities").withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", externalId)).unique(),
    };
    for (const row of args.pipelines ?? []) {
      const existing = await find.crmPipelines(row.externalId);
      const doc = { ...owner, ...row, seenAt: args.seenAt };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("crmPipelines", doc);
    }
    for (const row of args.deals ?? []) {
      const existing = await find.crmDeals(row.externalId);
      const doc = {
        ...owner,
        externalId: row.externalId,
        pipelineId: row.pipelineId,
        stageId: row.stageId,
        status: row.status,
        value: row.value,
        source: optional(row.source),
        contactId: optional(row.contactId),
        assignedTo: optional(row.assignedTo),
        createdAt: optional(row.createdAt),
        updatedAt: optional(row.updatedAt),
        lastStageChangeAt: optional(row.lastStageChangeAt),
        lastStatusChangeAt: optional(row.lastStatusChangeAt),
        seenAt: args.seenAt,
      };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("crmDeals", doc);
    }
    for (const row of args.contacts ?? []) {
      const existing = await find.crmContacts(row.externalId);
      const doc = {
        ...owner,
        externalId: row.externalId,
        name: optional(row.name),
        email: optional(row.email),
        phone: optional(row.phone),
        source: optional(row.source),
        tags: row.tags,
        addedAt: optional(row.addedAt),
        lastActivityAt: optional(row.lastActivityAt) ?? existing?.lastActivityAt,
        seenAt: args.seenAt,
      };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("crmContacts", doc);
    }
    for (const row of args.activities ?? []) {
      const existing = await find.crmActivities(row.externalId);
      const doc = {
        ...owner,
        externalId: row.externalId,
        kind: row.kind,
        direction: optional(row.direction),
        at: row.at,
        contactId: optional(row.contactId),
        dealId: optional(row.dealId),
        status: optional(row.status),
        seconds: optional(row.seconds),
        fromStage: optional(row.fromStage),
        toStage: optional(row.toStage),
      };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("crmActivities", doc);
    }
    return { saved: true };
  },
});

/**
 * Ends a read: saves the summary, then removes what this read no longer found (deals, contacts and
 * pipelines it did not see) and activity older than 90 days, in batches until none is left.
 */
export const finishRead = internalMutation({
  args: { connectionId: v.id("crmConnections"), seenAt: v.number(), summary: v.any() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const existing = await ctx.db
      .query("crmSummaries")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();
    const row = { workspaceId: connection.workspaceId, clientId: connection.clientId, connectionId: connection._id, syncedAt: Date.now(), summary: args.summary };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("crmSummaries", row);
    await ctx.scheduler.runAfter(0, internal.highLevel.pruneStale, { connectionId: connection._id, seenAt: args.seenAt });
    return null;
  },
});

export const pruneStale = internalMutation({
  args: { connectionId: v.id("crmConnections"), seenAt: v.number() },
  handler: async (ctx, args) => {
    let removed = 0;
    for (const table of ["crmPipelines", "crmDeals", "crmContacts"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
        .filter((q) => q.lt(q.field("seenAt"), args.seenAt))
        .take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      removed += rows.length;
    }
    const old = await ctx.db
      .query("crmActivities")
      .withIndex("by_connection_at", (q) => q.eq("connectionId", args.connectionId).lt("at", Date.now() - HL_KEEP.activityDays * DAY))
      .take(BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    removed += old.length;
    if (removed > 0) await ctx.scheduler.runAfter(0, internal.highLevel.pruneStale, args);
    return { removed };
  },
});

// ---------- One read ----------

function batches<T>(rows: T[], size = BATCH) {
  const out: T[][] = [];
  for (let at = 0; at < rows.length; at += size) out.push(rows.slice(at, at + size));
  return out;
}

/**
 * Reads a sub-account, one recorded step at a time: access, pipelines, deals, contacts, activity, appointments,
 * save. Stops at the first refusal; nothing is retried around a rate limit. At most 400 calls.
 */
async function syncConnection(ctx: ActionCtx, connectionId: Id<"crmConnections">, trigger: Trigger): Promise<{ code: string }> {
  const live = await liveToken(ctx, connectionId);
  if (!live.ok) {
    if (live.code !== "not_connected") await ctx.runMutation(internal.highLevel.recordCalls, { connectionId, ok: 0, failed: 0, code: live.code, synced: true });
    return { code: live.code };
  }
  const runId = await ctx.runMutation(internal.highLevel.startRun, { connectionId, trigger });
  if (!runId) return { code: "busy" };
  const { token, connection } = live;
  const location = connection.accountId;
  const counter: Counter = { ok: 0, failed: 0, lastCode: null };
  const budgetLeft = () => HL_LIMITS.callsPerRead - counter.ok - counter.failed;
  const now = Date.now();
  const seenAt = now;

  const step = async <T>(key: HlStepKey, work: () => Promise<{ ok: boolean; code: string; rows: number; value: T }>) => {
    const before = { ok: counter.ok, failed: counter.failed };
    const started = Date.now();
    const result = await work();
    await ctx.runMutation(internal.highLevel.stepRun, {
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
  let currency = connection.currency;

  const access = await step("access", async () => {
    const result = await hlRequest(token, `/locations/${location}`, counter);
    const parsed = result.ok ? parseLocation(result.body) : null;
    if (parsed) {
      currency = parsed.currency;
      await ctx.runMutation(internal.highLevel.setLocationInfo, { connectionId, accountName: parsed.name, currency: parsed.currency, timezone: parsed.timezone ?? undefined });
    }
    return { ok: result.ok, code: result.code, rows: parsed ? 1 : 0, value: null };
  });
  if (!access.ok) code = access.code;

  let pipelines: Pipeline[] = [];
  if (code === "ok") {
    const result = await step("pipelines", async () => {
      const answer = await hlRequest(token, `/opportunities/pipelines?${qs({ locationId: location })}`, counter);
      const rows = answer.ok ? parsePipelines(answer.body) : [];
      return { ok: answer.ok, code: answer.code, rows: rows.length, value: rows };
    });
    if (result.ok) pipelines = result.value;
    else code = result.code;
  }

  const deals = new Map<string, Deal>();
  const dealContacts = new Map<string, Contact>();
  if (code === "ok") {
    const result = await step("deals", async () => {
      let after: { startAfter?: string; startAfterId?: string } = {};
      for (let page = 0; page < HL_LIMITS.dealPages && budgetLeft() > 0; page++) {
        const answer = await hlRequest(token, `/opportunities/search?${qs({ location_id: location, limit: 100, ...after })}`, counter);
        if (!answer.ok) return { ok: false, code: answer.code, rows: deals.size, value: null };
        const body = answer.body as { opportunities?: unknown[]; meta?: { startAfter?: unknown; startAfterId?: unknown } } | null;
        const rows = Array.isArray(body?.opportunities) ? body.opportunities : [];
        for (const raw of rows) {
          const parsed = parseDeal(raw);
          if (!parsed || !keepDeal(parsed.deal, now)) continue;
          deals.set(parsed.deal.externalId, parsed.deal);
          if (parsed.contact && !dealContacts.has(parsed.contact.externalId)) dealContacts.set(parsed.contact.externalId, { ...parsed.contact, source: parsed.deal.source, addedAt: null });
        }
        const nextId = body?.meta?.startAfterId;
        const nextAt = body?.meta?.startAfter;
        if (rows.length < 100 || !isHlId(nextId) || nextId === after.startAfterId) break;
        after = { startAfterId: nextId, startAfter: String(nextAt ?? "") || undefined };
      }
      return { ok: true, code: "ok", rows: deals.size, value: null };
    });
    if (!result.ok) code = result.code;
  }

  const contacts = new Map<string, Contact>(dealContacts);
  if (code === "ok") {
    const result = await step("contacts", async () => {
      const since = now - HL_KEEP.contactDays * DAY;
      for (let page = 1; page <= HL_LIMITS.contactPages && budgetLeft() > 0; page++) {
        const answer = await hlRequest(token, "/contacts/search", counter, { locationId: location, page, pageLimit: 100, sort: [{ field: "dateAdded", direction: "desc" }] });
        if (!answer.ok) return { ok: false, code: answer.code, rows: contacts.size, value: null };
        const rows = Array.isArray((answer.body as { contacts?: unknown[] } | null)?.contacts) ? (answer.body as { contacts: unknown[] }).contacts : [];
        let older = false;
        for (const raw of rows) {
          const contact = parseContact(raw);
          if (!contact) continue;
          if (contact.addedAt !== null && contact.addedAt < since) {
            older = true;
            // Older leads are kept only when a kept deal points at them; the search's fuller row then wins.
            if (dealContacts.has(contact.externalId)) contacts.set(contact.externalId, contact);
            continue;
          }
          contacts.set(contact.externalId, contact);
        }
        if (older || rows.length < 100) break;
      }
      return { ok: true, code: "ok", rows: contacts.size, value: null };
    });
    if (!result.ok) code = result.code;
  }

  const activities = new Map<string, Activity>();
  if (code === "ok") {
    const result = await step("activity", async () => {
      const since = now - HL_KEEP.conversationDays * DAY;
      const list = await hlRequest(
        token,
        `/conversations/search?${qs({ locationId: location, limit: HL_LIMITS.conversations, sort: "desc", sortBy: "last_message_date", startDate: since })}`,
        counter,
      );
      if (!list.ok) return { ok: false, code: list.code, rows: 0, value: null };
      const conversations = ((list.body as { conversations?: { id?: unknown }[] } | null)?.conversations ?? [])
        .map((row) => row?.id)
        .filter(isHlId)
        .slice(0, HL_LIMITS.conversations);
      for (const conversationId of conversations) {
        if (budgetLeft() <= 0) break;
        const answer = await hlRequest(token, `/conversations/${conversationId}/messages?${qs({ limit: HL_LIMITS.messagesPerConversation })}`, counter);
        if (!answer.ok) {
          if (stopsRead(answer.code)) return { ok: false, code: answer.code, rows: activities.size, value: null };
          continue;
        }
        for (const raw of messagesOf(answer.body).rows) {
          const row = parseMessage(raw);
          if (row && row.at >= since) activities.set(row.externalId, row);
        }
      }
      return { ok: true, code: "ok", rows: activities.size, value: null };
    });
    if (!result.ok) code = result.code;
  }

  if (code === "ok") {
    const result = await step("appointments", async () => {
      const list = await hlRequest(token, `/calendars/?${qs({ locationId: location })}`, counter);
      if (!list.ok) return { ok: false, code: list.code, rows: 0, value: null };
      const calendars = ((list.body as { calendars?: { id?: unknown }[] } | null)?.calendars ?? []).map((row) => row?.id).filter(isHlId).slice(0, HL_LIMITS.calendars);
      let rows = 0;
      for (const calendarId of calendars) {
        if (budgetLeft() <= 0) break;
        const answer = await hlRequest(token, `/calendars/events?${qs({ locationId: location, calendarId, startTime: now - 30 * DAY, endTime: now + 30 * DAY })}`, counter);
        if (!answer.ok) {
          if (stopsRead(answer.code)) return { ok: false, code: answer.code, rows, value: null };
          continue;
        }
        for (const raw of (answer.body as { events?: unknown[] } | null)?.events ?? []) {
          const row = parseEvent(raw);
          if (row) {
            activities.set(row.externalId, row);
            rows++;
          }
        }
      }
      return { ok: true, code: "ok", rows, value: null };
    });
    if (!result.ok) code = result.code;
  }

  if (code === "ok") {
    const saved = await step("save", async () => {
      const previous: { externalId: string; stageId: string; status: string }[] = await ctx.runQuery(internal.highLevel.previousDeals, { connectionId });
      const moved = changesSince(new Map(previous.map((row) => [row.externalId, row])), [...deals.values()], now);
      for (const row of moved) activities.set(row.externalId, row);
      const lastActivity = new Map<string, number>();
      for (const row of activities.values()) {
        if (row.contactId && row.at <= now) lastActivity.set(row.contactId, Math.max(lastActivity.get(row.contactId) ?? 0, row.at));
      }
      const contactRows = [...contacts.values()].map((contact) => ({ ...contact, lastActivityAt: lastActivity.get(contact.externalId) ?? null }));
      const dealRows = [...deals.values()];
      const activityRows = [...activities.values()];

      let saved = (await ctx.runMutation(internal.highLevel.saveBatch, { connectionId, seenAt, pipelines })).saved;
      for (const chunk of batches(dealRows)) if (saved) saved = (await ctx.runMutation(internal.highLevel.saveBatch, { connectionId, seenAt, deals: chunk })).saved;
      for (const chunk of batches(contactRows)) if (saved) saved = (await ctx.runMutation(internal.highLevel.saveBatch, { connectionId, seenAt, contacts: chunk })).saved;
      for (const chunk of batches(activityRows)) if (saved) saved = (await ctx.runMutation(internal.highLevel.saveBatch, { connectionId, seenAt, activities: chunk })).saved;
      if (!saved) return { ok: false, code: "not_connected", rows: 0, value: null };

      // Stage changes kept from earlier reads count too.
      const kept: { externalId: string; kind: Activity["kind"]; direction: Activity["direction"]; at: number }[] = await ctx.runQuery(internal.highLevel.recentActivities, {
        connectionId,
        since: now - 30 * DAY,
      });
      const merged = new Map<string, Activity>();
      for (const row of kept) merged.set(row.externalId, { ...row, contactId: null, dealId: null, status: null, seconds: null, fromStage: null, toStage: null });
      for (const row of activityRows) merged.set(row.externalId, row);
      const summary = summarize({ currency, pipelines, deals: dealRows, contacts: contactRows, activities: [...merged.values()], now });
      await ctx.runMutation(internal.highLevel.finishRead, { connectionId, seenAt, summary });
      return { ok: true, code: "ok", rows: dealRows.length + contactRows.length + activityRows.length, value: null };
    });
    if (!saved.ok) code = saved.code;
  }

  await ctx.runMutation(internal.highLevel.finishRun, { runId, code });
  await ctx.runMutation(internal.highLevel.recordCalls, { connectionId, ok: counter.ok, failed: counter.failed, code, synced: true });
  return { code };
}

// ---------- What people do ----------

export const connectionFor = internalQuery({
  args: { workspaceId: v.id("workspaces"), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) =>
    ctx.db
      .query("crmConnections")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", args.workspaceId).eq("clientId", args.clientId))
      .unique(),
});

/** Reads the connected sub-account again now. Owner or Admin. */
export const syncNow = memberAction({
  args: clientArg,
  handler: async (ctx, args): Promise<{ code: string }> => {
    if (!isAdmin(ctx.role)) notAllowed();
    const connection: Doc<"crmConnections"> | null = await ctx.runQuery(internal.highLevel.connectionFor, { workspaceId: ctx.workspaceId, clientId: args.clientId });
    if (!connection) throw userError("Connect HighLevel first.");
    return syncConnection(ctx, connection._id, "manual");
  },
});

export const syncOne = internalAction({
  args: { connectionId: v.id("crmConnections"), trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("connect")) },
  handler: async (ctx, args): Promise<{ code: string }> => syncConnection(ctx, args.connectionId, args.trigger),
});

/**
 * Deletes a connection now (it disappears from every screen in this write) and schedules the removal of
 * everything read through it. Nothing changes in HighLevel.
 */
async function removeConnection(ctx: MutationCtx, connection: Doc<"crmConnections">, actorId: string, action: string) {
  // Nothing waiting can be approved once the connection is gone: its approvals are closed first.
  await closeOpenActions(ctx, connection._id, actorId === "system" ? "system" : actorId, "cancelled");
  await ctx.db.delete(connection._id);
  await ctx.scheduler.runAfter(0, internal.highLevel.removeData, { connectionId: connection._id });
  await writeAudit(ctx, { workspaceId: connection.workspaceId, actorType: actorId === "system" ? "system" : "user", actorId, action, subject: `highlevel:${connection.accountId}` });
}

/** Removes the connection, its tokens and everything read through it. Owner only. */
export const disconnect = ownerMutation({
  args: clientArg,
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("crmConnections")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", args.clientId))
      .unique();
    if (!connection) return null;
    await removeConnection(ctx, connection, ctx.identity.subject, "crm.disconnected");
    return null;
  },
});

const DATA_TABLES = ["crmActions", "crmPipelines", "crmDeals", "crmContacts", "crmActivities", "crmSummaries", "crmSyncRuns", "crmCallDays"] as const;

/** Deletes everything read through a removed connection, a batch at a time, until none is left. */
export const removeData = internalMutation({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args) => {
    let removed = 0;
    for (const table of DATA_TABLES) {
      const rows =
        table === "crmCallDays"
          ? await ctx.db.query(table).withIndex("by_connection_day", (q) => q.eq("connectionId", args.connectionId)).take(BATCH)
          : await ctx.db.query(table).withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      removed += rows.length;
    }
    if (removed > 0) await ctx.scheduler.runAfter(0, internal.highLevel.removeData, args);
    return { removed };
  },
});

/**
 * The app was uninstalled from a sub-account in HighLevel: every connection to it goes, with its data.
 * A delivery dated before a connection was made (a replay) leaves that connection alone.
 */
export const uninstalled = internalMutation({
  args: { locationId: v.string(), at: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("crmConnections")
      .withIndex("by_account", (q) => q.eq("provider", "highlevel").eq("accountId", args.locationId))
      .take(50);
    let removed = 0;
    for (const row of rows) {
      if (args.at !== undefined && args.at < row.connectedAt) continue;
      await removeConnection(ctx, row, "system", "crm.uninstalled");
      removed++;
    }
    return { removed };
  },
});

// ---------- Background ----------

export const connectionsToSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("crmConnections").take(1000);
    return {
      live: rows.filter((row) => row.status === "connected").map((row) => row._id),
      // Signed out for 30 days: removed with its data, as the privacy policy says.
      expired: rows.filter((row) => row.status === "needsReconnect" && Date.now() - (row.needsReconnectSince ?? row.connectedAt) > HL_KEEP.reconnectDays * DAY).map((row) => row._id),
    };
  },
});

export const removeExpired = internalMutation({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (row && row.status === "needsReconnect") await removeConnection(ctx, row, "system", "crm.expired");
    return null;
  },
});

/**
 * Keeps each connected sub-account fresh and removes connections signed out for 30 days. Runs on a schedule.
 * Each read runs as its own action, a few seconds apart, so one slow sub-account cannot hold up the rest.
 * HighLevel's limits are per sub-account, so reads of different sub-accounts do not share a budget.
 */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number; removed: number }> => {
    const due: { live: Id<"crmConnections">[]; expired: Id<"crmConnections">[] } = await ctx.runQuery(internal.highLevel.connectionsToSync, {});
    for (const connectionId of due.expired) await ctx.runMutation(internal.highLevel.removeExpired, { connectionId });
    await ctx.runMutation(internal.crmActions.expireStale, {});
    for (const [index, connectionId] of due.live.entries()) {
      await ctx.scheduler.runAfter(index * 5000, internal.highLevel.syncOne, { connectionId, trigger: "schedule" });
    }
    return { scheduled: due.live.length, removed: due.expired.length };
  },
});
