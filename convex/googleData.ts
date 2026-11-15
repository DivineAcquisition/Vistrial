/**
 * The customer's own Google data, read-only (docs/rebuild/integrations-setup.md, sections 1 to 4). Each
 * product is its own connection on the shared Google app, asking only its own scope. After the sign-in,
 * an Owner or Admin chooses which property, site, account or location it reads; Vistrial then reads only
 * totals for that one, saves them as the connection's summary, and refreshes them on a schedule. Nothing is
 * ever changed at Google. Disconnecting deletes the choice, the summary and the token (integrations.ts).
 *
 * Built so far: Google Analytics 4. Each further product adds one entry to READERS.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { liveToken } from "./integrationActions";
import { adminMutation, memberAction, workspaceQuery } from "./lib/builders";
import { notAllowed, userError } from "./lib/errors";
import { ANALYTICS, analyticsChoices, analyticsRequests, summarizeAnalytics, type Choice } from "./lib/integrations/google/analytics";
import { isAdmin } from "./lib/roles";

const TIMEOUT_MS = 20_000;

type Got = { ok: true; body: unknown } | { ok: false; code: string };

/** A call with the connection's token. Google's answers become short codes; its words are not kept. */
export async function googleCall(url: string, token: string, body?: unknown): Promise<Got> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: "connection_failed" };
  }
  if (response.status === 401) return { ok: false, code: "token_rejected" };
  if (response.status === 403) return { ok: false, code: "permission_missing" };
  if (response.status === 429) return { ok: false, code: "rate_limited" };
  if (!response.ok) return { ok: false, code: response.status >= 500 ? "provider_down" : "read_failed" };
  const json = (await response.json().catch(() => null)) as unknown;
  return json === null ? { ok: false, code: "read_failed" } : { ok: true, body: json };
}

type Reader = {
  /** What the person chooses, in words: "property", "site", "account", "location". */
  noun: string;
  choices: (token: string) => Promise<{ ok: true; choices: Choice[] } | { ok: false; code: string }>;
  read: (token: string, selectedId: string) => Promise<{ ok: true; summary: unknown } | { ok: false; code: string }>;
};

export const READERS: Record<string, Reader> = {
  google_analytics: {
    noun: "property",
    choices: async (token) => {
      const got = await googleCall(ANALYTICS.summaries, token);
      return got.ok ? { ok: true, choices: analyticsChoices(got.body) } : got;
    },
    read: async (token, property) => {
      if (!/^properties\/\d+$/.test(property)) return { ok: false, code: "read_failed" };
      const requests = analyticsRequests();
      const answers: Record<string, unknown> = {};
      for (const [key, body] of Object.entries(requests)) {
        const got = await googleCall(ANALYTICS.report(property), token, body);
        if (!got.ok) return got;
        answers[key] = got.body;
      }
      return { ok: true, summary: summarizeAnalytics(answers as Parameters<typeof summarizeAnalytics>[0]) };
    },
  },
};

export function isGoogleDataProvider(key: string | null | undefined): key is keyof typeof READERS {
  return !!key && Object.hasOwn(READERS, key);
}

// ---------- Reads ----------

export const connectionState = internalQuery({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider))
      .unique();
    if (!connection) return null;
    const choices = await ctx.db
      .query("integrationSnapshots")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider).eq("kind", "choices"))
      .unique();
    return { selected: connection.selected ?? null, choices: (choices?.data as Choice[] | undefined) ?? [] };
  },
});

/** Saves the chosen one. Refused when it is not among the choices last read for this connection. */
export const setSelected = internalMutation({
  args: { workspaceId: v.id("workspaces"), provider: v.string(), choiceId: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider))
      .unique();
    if (!connection) return { ok: false as const };
    const saved = await ctx.db
      .query("integrationSnapshots")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider).eq("kind", "choices"))
      .unique();
    const choice = ((saved?.data as Choice[] | undefined) ?? []).find((row) => row.id === args.choiceId);
    if (!choice) return { ok: false as const };
    if (connection.selected?.id !== choice.id) {
      // A different property's totals do not belong beside this one's.
      const summary = await ctx.db
        .query("integrationSnapshots")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", args.provider).eq("kind", "summary"))
        .unique();
      if (summary) await ctx.db.delete(summary._id);
    }
    await ctx.db.patch(connection._id, { selected: { id: choice.id, label: choice.label } });
    return { ok: true as const };
  },
});

/** Reads the choices, and the chosen one's totals. With one choice only, it is chosen for the person. */
async function sync(ctx: ActionCtx, workspaceId: Id<"workspaces">, provider: string): Promise<{ code: string }> {
  const reader = isGoogleDataProvider(provider) ? READERS[provider] : null;
  if (!reader) return { code: "not_built" };
  const live = await liveToken(ctx, workspaceId, provider);
  if (!live.ok) return { code: live.code };
  const listed = await reader.choices(live.token);
  if (!listed.ok) {
    await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code: listed.code });
    return { code: listed.code };
  }
  await ctx.runMutation(internal.integrations.saveSnapshot, { workspaceId, provider, kind: "choices", data: listed.choices });
  let selected = live.connection.selected ?? null;
  if (selected && !listed.choices.some((row) => row.id === selected!.id)) selected = null;
  if (!selected && listed.choices.length === 1) {
    await ctx.runMutation(internal.googleData.setSelected, { workspaceId, provider, choiceId: listed.choices[0].id });
    selected = listed.choices[0];
  }
  if (!selected) {
    const code = listed.choices.length ? "choose" : "nothing_to_read";
    await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code });
    return { code };
  }
  const read = await reader.read(live.token, selected.id);
  if (read.ok) await ctx.runMutation(internal.integrations.saveSnapshot, { workspaceId, provider, kind: "summary", data: { selectedId: selected.id, ...(read.summary as object) } });
  const code = read.ok ? "ok" : read.code;
  await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code });
  return { code };
}

/** The first read after a sign-in, and each scheduled one. Internal. */
export const syncOne = internalAction({
  args: { workspaceId: v.id("workspaces"), provider: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => sync(ctx, args.workspaceId, args.provider),
});

/** Reads a connection again now. Owner or Admin. */
export const syncNow = memberAction({
  args: { provider: v.string() },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!role || !isAdmin(role)) notAllowed();
    if (!isGoogleDataProvider(args.provider)) throw userError("That connection cannot be read here.");
    const result = await sync(ctx, ctx.workspaceId, args.provider);
    if (result.code === "not_connected") throw userError("Connect it first.");
    return result;
  },
});

/** Chooses what a connection reads, then reads it. Owner or Admin. */
export const choose = adminMutation({
  args: { provider: v.string(), choiceId: v.string() },
  handler: async (ctx, args) => {
    if (!isGoogleDataProvider(args.provider)) throw userError("That connection cannot be read here.");
    const result: { ok: boolean } = await ctx.runMutation(internal.googleData.setSelected, { workspaceId: ctx.workspaceId, provider: args.provider, choiceId: args.choiceId });
    if (!result.ok) throw userError(`That ${READERS[args.provider].noun} is not one this connection can open. Refresh the list and choose again.`);
    await ctx.scheduler.runAfter(0, internal.googleData.syncOne, { workspaceId: ctx.workspaceId, provider: args.provider });
    return null;
  },
});

export const connectedRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("integrationConnections").take(1000);
    return rows.filter((row) => row.status === "connected" && isGoogleDataProvider(row.provider)).map((row) => ({ workspaceId: row.workspaceId, provider: row.provider }));
  },
});

/** Keeps each connection's totals fresh. Runs on a schedule. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ synced: number }> => {
    const rows: { workspaceId: Id<"workspaces">; provider: string }[] = await ctx.runQuery(internal.googleData.connectedRows, {});
    for (const row of rows) await sync(ctx, row.workspaceId, row.provider);
    return { synced: rows.length };
  },
});

/** What a connection reads and its last totals, for its card. */
export const view = workspaceQuery({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    if (!isGoogleDataProvider(args.provider)) return null;
    const connection = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", args.provider))
      .unique();
    if (!connection) return null;
    const snapshot = (kind: string) =>
      ctx.db
        .query("integrationSnapshots")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", args.provider).eq("kind", kind))
        .unique();
    const [choices, summary] = await Promise.all([snapshot("choices"), snapshot("summary")]);
    const current = summary && connection.selected && (summary.data as { selectedId?: string }).selectedId === connection.selected.id ? summary : null;
    return {
      noun: READERS[args.provider].noun,
      canChoose: isAdmin(ctx.member.role),
      selected: connection.selected ?? null,
      choices: (choices?.data as Choice[] | undefined) ?? [],
      summary: current ? { syncedAt: current.syncedAt, data: current.data as unknown } : null,
    };
  },
});
