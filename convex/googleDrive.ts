/**
 * Google Drive, files the customer picks (docs/rebuild/integrations-setup.md, section 4b). An Owner or Admin
 * picks files in Google's Picker in the browser; only their ids come here, and Vistrial reads each one's text
 * with the connection's own token (drive.file reaches exactly the picked files). It keeps the text, never
 * the file, and never lists, changes, shares or deletes anything in the Drive.
 *
 * Granted files reach agents three ways: as "Your file" sources in research, as two read tools during work
 * that uses tools (lib/integrations/google/driveTools.ts), and, when a person chooses, as a Playbook study
 * source or a call transcript.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT, SALES_CONVERSION } from "./catalog";
import { googleCall } from "./googleData";
import { liveToken } from "./integrationActions";
import { writeAudit } from "./lib/audit";
import { adminMutation, memberAction, workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew } from "./lib/clients";
import { notAllowed, notFound, userError } from "./lib/errors";
import { DRIVE, DRIVE_TEXT, KIND_WORD, cleanText, isFileId, readPlan, wordCount } from "./lib/integrations/google/drive";
import { isAdmin } from "./lib/roles";
import { addTranscriptFor } from "./transcripts";

export const PROVIDER = "google_drive";
/** Picked files are for both live agents unless an Owner narrows them. */
export const DEFAULT_AGENTS = [GROWTH_ARCHITECT, SALES_CONVERSION];

export function fileAgents(row: Pick<Doc<"driveFiles">, "agents">) {
  return row.agents ?? DEFAULT_AGENTS;
}

async function connectionOf(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("integrationConnections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId).eq("provider", PROVIDER))
    .unique();
}

/** The picked files, for the Drive card. Text is never sent; the opening line is. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const connection = await connectionOf(ctx, ctx.workspaceId);
    if (!connection) return null;
    const rows = await ctx.db
      .query("driveFiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(DRIVE.files);
    return {
      canPick: isAdmin(ctx.member.role) && connection.status === "connected",
      canEdit: ctx.member.role !== "viewer",
      /** The account the Picker should sign in as: the connection's own. */
      accountEmail: connection.accountLabel.includes("@") ? connection.accountLabel : null,
      files: rows.map((row) => ({
        id: row._id,
        name: row.name,
        kind: row.kind,
        kindWord: KIND_WORD[row.kind] ?? "File",
        words: row.words,
        opening: row.text.replace(/\s+/g, " ").slice(0, 160),
        agents: fileAgents(row),
        readAt: row.readAt,
      })),
    };
  },
});

export const savedIds = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("driveFiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(DRIVE.files + 1);
    return rows.map((row) => row.fileId);
  },
});

/** Saves or refreshes one file's text. Refused when Drive was disconnected meanwhile. */
export const saveFile = internalMutation({
  args: { workspaceId: v.id("workspaces"), userId: v.string(), fileId: v.string(), name: v.string(), kind: v.string(), text: v.string(), modifiedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await connectionOf(ctx, args.workspaceId))) return null;
    const existing = await ctx.db
      .query("driveFiles")
      .withIndex("by_workspace_file", (q) => q.eq("workspaceId", args.workspaceId).eq("fileId", args.fileId))
      .unique();
    const fields = {
      name: args.name.replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled",
      kind: args.kind,
      text: args.text,
      words: wordCount(args.text),
      modifiedAt: args.modifiedAt,
      readAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    const id = await ctx.db.insert("driveFiles", { workspaceId: args.workspaceId, fileId: args.fileId, ...fields, addedBy: args.userId, addedAt: Date.now() });
    // The audit row holds the id only, never the name or the text.
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.userId, action: "drive.file_added", subject: id });
    return id;
  },
});

type FileRead = { ok: true; name: string; kind: string; text: string; modifiedAt?: number } | { ok: false; reason: keyof typeof DRIVE_TEXT | "token_rejected" | "read_failed" };

/** Reads one picked file's text with the connection's token. Never a write. */
async function readFile(token: string, fileId: string): Promise<FileRead> {
  const meta = await googleCall(DRIVE.meta(fileId), token);
  if (!meta.ok) return { ok: false, reason: meta.code === "token_rejected" ? "token_rejected" : meta.code === "permission_missing" || meta.code === "read_failed" ? "not_found" : "read_failed" };
  const body = meta.body as { name?: unknown; mimeType?: unknown; size?: unknown; modifiedTime?: unknown; trashed?: unknown };
  const plan = readPlan(body);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  let response: Response;
  try {
    response = await fetch(plan.url(fileId), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  if (response.status === 401) return { ok: false, reason: "token_rejected" };
  if (!response.ok) return { ok: false, reason: response.status === 403 || response.status === 404 ? "not_found" : "read_failed" };
  const raw = await response.text().catch(() => "");
  const modified = typeof body.modifiedTime === "string" ? Date.parse(body.modifiedTime) : NaN;
  return { ok: true, name: typeof body.name === "string" ? body.name : "Untitled", kind: plan.kind, text: cleanText(raw), ...(Number.isFinite(modified) ? { modifiedAt: modified } : {}) };
}

const READ_WORDS: Record<string, string> = { token_rejected: "Google signed Vistrial out of Drive. Reconnect it.", read_failed: "Google Drive did not answer. Try again in a moment." };

/**
 * Adds the files a person just picked. Owner or Admin. Only ids arrive; each is opened with the connection's
 * token, so a file the connection cannot open is refused. Returns what was added and what was not, in words.
 */
export const addPicked = memberAction({
  args: { fileIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<{ added: string[]; refused: { name: string; why: string }[] }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!role || !isAdmin(role)) notAllowed();
    const ids = [...new Set(args.fileIds)];
    if (!ids.length || ids.length > DRIVE.perPick || ids.some((id) => !isFileId(id))) throw userError(`Pick between 1 and ${DRIVE.perPick} files.`);
    const saved: string[] = await ctx.runQuery(internal.googleDrive.savedIds, { workspaceId: ctx.workspaceId });
    if (saved.length + ids.filter((id) => !saved.includes(id)).length > DRIVE.files) throw userError(DRIVE_TEXT.tooMany, "limit");
    const live = await liveToken(ctx, ctx.workspaceId, PROVIDER);
    if (!live.ok) throw userError(live.code === "not_connected" ? "Connect Google Drive first." : (READ_WORDS[live.code] ?? READ_WORDS.read_failed));
    const added: string[] = [];
    const refused: { name: string; why: string }[] = [];
    for (const fileId of ids) {
      const read = await readFile(live.token, fileId);
      if (!read.ok) {
        if (read.reason === "token_rejected") {
          await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code: "token_rejected" });
          throw userError(READ_WORDS.token_rejected);
        }
        refused.push({ name: fileId, why: (DRIVE_TEXT as Record<string, string>)[read.reason] ?? READ_WORDS.read_failed });
        continue;
      }
      await ctx.runMutation(internal.googleDrive.saveFile, {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fileId,
        name: read.name,
        kind: read.kind,
        text: read.text,
        modifiedAt: read.modifiedAt,
      });
      added.push(read.name);
    }
    await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code: "ok" });
    return { added, refused };
  },
});

/** Reads every picked file's text again. Owner or Admin. A file that cannot be opened any more keeps its last text. */
export const refresh = memberAction({
  args: {},
  handler: async (ctx): Promise<{ read: number; failed: number }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!role || !isAdmin(role)) notAllowed();
    const live = await liveToken(ctx, ctx.workspaceId, PROVIDER);
    if (!live.ok) throw userError(live.code === "not_connected" ? "Connect Google Drive first." : (READ_WORDS[live.code] ?? READ_WORDS.read_failed));
    const ids: string[] = await ctx.runQuery(internal.googleDrive.savedIds, { workspaceId: ctx.workspaceId });
    let read = 0;
    let failed = 0;
    for (const fileId of ids) {
      const got = await readFile(live.token, fileId);
      if (!got.ok) {
        failed++;
        if (got.reason === "token_rejected") break;
        continue;
      }
      await ctx.runMutation(internal.googleDrive.saveFile, { workspaceId: ctx.workspaceId, userId: ctx.userId, fileId, name: got.name, kind: got.kind, text: got.text, modifiedAt: got.modifiedAt });
      read++;
    }
    await ctx.runMutation(internal.integrations.recordSync, { connectionId: live.connection._id, code: failed && !read ? "read_failed" : "ok" });
    return { read, failed };
  },
});

/** Removes one picked file: its row and text. Nothing in the Drive changes. Owner or Admin. */
export const remove = adminMutation({
  args: { driveFileId: v.id("driveFiles") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.driveFileId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    await ctx.db.delete(row._id);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "drive.file_removed", subject: row._id });
    return null;
  },
});

/** Grants or withdraws one agent's use of a picked file. Owner or Admin. */
export const setAgentAccess = adminMutation({
  args: { driveFileId: v.id("driveFiles"), agentSlug: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.driveFileId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (!DEFAULT_AGENTS.includes(args.agentSlug)) throw userError("That agent cannot read files.");
    const current = new Set(fileAgents(row));
    if (args.granted) current.add(args.agentSlug);
    else current.delete(args.agentSlug);
    await ctx.db.patch(row._id, { agents: DEFAULT_AGENTS.filter((slug) => current.has(slug)) });
    return null;
  },
});

/** Adds a picked file as a call transcript, with the same consent confirmation as an upload. */
export const useAsTranscript = workspaceMutation({
  args: { driveFileId: v.id("driveFiles"), consentConfirmed: v.boolean(), callDate: v.optional(v.string()), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    if (ctx.member.role === "viewer") notAllowed();
    const row = await ctx.db.get(args.driveFileId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    const forClient = await clientForNew(ctx, args.clientId);
    return addTranscriptFor(ctx, {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      forClient,
      title: row.name,
      tool: "Google Drive",
      callDate: args.callDate,
      text: row.text,
      consentConfirmed: args.consentConfirmed,
    });
  },
});

/** The picked files one agent may read, for research sources and read tools. */
export async function filesFor(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">, agentSlug: string) {
  if (!(await connectionOf(ctx, workspaceId))) return [];
  const rows = await ctx.db
    .query("driveFiles")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(DRIVE.files);
  return rows.filter((row) => fileAgents(row).includes(agentSlug));
}

export const forAgent = internalQuery({
  args: { workspaceId: v.id("workspaces"), agentSlug: v.string() },
  handler: async (ctx, args) => (await filesFor(ctx, args.workspaceId, args.agentSlug)).map((row) => ({ id: row._id as string, name: row.name, kind: row.kind, words: row.words, text: row.text })),
});
