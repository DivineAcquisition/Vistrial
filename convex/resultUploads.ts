/**
 * Results files: a business uploads an export from its own tools (Google Ads, a CRM, bookings, email) and
 * Vistrial keeps only totals and per-campaign figures. The file is deleted as soon as it is read, columns
 * that hold personal data are never read, and a customer list is refused. The figures become "Your data"
 * evidence for the agents the upload is granted to.
 */

import { v } from "convex/values";
import Papa from "papaparse";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { ownerMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound } from "./lib/errors";
import { MAX_BYTES, summarizeResults, type ResultsSummary } from "./lib/resultsCsv";
import { canonicalUrl } from "./lib/sourceRefs";

const MAX_FILE_NAME = 120;
const MAX_LABEL = 60;
const LIST_LIMIT = 20;

/** The agents an upload is granted to. Missing means the Growth Architect only. */
export function uploadAgents(upload: Pick<Doc<"resultUploads">, "agents">) {
  return upload.agents ?? [GROWTH_ARCHITECT];
}

function clip(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Where the figures can be read in the product. Used as the source link. */
export function uploadUrl(agentSlug: string, uploadId: Id<"resultUploads">) {
  return `https://vistrial.io/app/agents/${agentSlug}/connections/results?upload=${uploadId}`;
}

/** One line a reader can check against the page: what the file covers and its totals. */
export function describeUpload(upload: Pick<Doc<"resultUploads">, "label" | "currency" | "summary">) {
  const summary = upload.summary;
  if (!summary) return upload.label;
  const parts: string[] = [];
  const money = (value: number) => `${upload.currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const count = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (summary.totals.spend !== undefined) parts.push(`spend ${money(summary.totals.spend)}`);
  if (summary.totals.impressions !== undefined) parts.push(`${count(summary.totals.impressions)} impressions`);
  if (summary.totals.clicks !== undefined) parts.push(`${count(summary.totals.clicks)} clicks`);
  if (summary.totals.conversions !== undefined) parts.push(`${count(summary.totals.conversions)} conversions`);
  if (summary.totals.revenue !== undefined) parts.push(`revenue ${money(summary.totals.revenue)}`);
  const period = summary.dateStart && summary.dateStop ? ` from ${summary.dateStart} to ${summary.dateStop}` : "";
  return `${upload.label}${period}: ${parts.join(", ")}.`;
}

function requireEditor(role: Doc<"members">["role"]) {
  if (role === "rep") notAllowed();
}

export const createUpload = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    requireEditor(ctx.member.role);
    return ctx.storage.generateUploadUrl();
  },
});

export const start = workspaceMutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    label: v.string(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const currency = args.currency.trim().toUpperCase();
    const label = clip(args.label, MAX_LABEL);
    if (!/^[A-Z]{3}$/.test(currency) || !label) notAllowed();
    const uploadId = await ctx.db.insert("resultUploads", {
      workspaceId: ctx.workspaceId,
      fileName: clip(args.fileName, MAX_FILE_NAME) || "results.csv",
      label,
      currency,
      uploadedBy: ctx.identity.subject,
      createdAt: Date.now(),
      status: "processing",
      storageId: args.storageId,
    });
    await ctx.scheduler.runAfter(0, internal.resultUploads.parse, { uploadId });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "results.uploaded",
      subject: uploadId,
    });
    return uploadId;
  },
});

export const load = internalQuery({
  args: { uploadId: v.id("resultUploads") },
  handler: async (ctx, args) => ctx.db.get(args.uploadId),
});

export const parse = internalAction({
  args: { uploadId: v.id("resultUploads") },
  handler: async (ctx, args): Promise<null> => {
    const upload: Doc<"resultUploads"> | null = await ctx.runQuery(internal.resultUploads.load, { uploadId: args.uploadId });
    if (!upload || upload.status !== "processing" || !upload.storageId) return null;
    const refuse = async (code: string, ignoredColumns: string[] = []): Promise<null> => {
      await ctx.runMutation(internal.resultUploads.finish, { uploadId: args.uploadId, code, ignoredColumns });
      return null;
    };
    const blob = await ctx.storage.get(upload.storageId);
    if (!blob) return refuse("file_missing");
    if (blob.size > MAX_BYTES) return refuse("too_large");
    let parsed: { data: Record<string, string>[]; meta: { fields?: string[] } };
    try {
      parsed = Papa.parse<Record<string, string>>(await blob.text(), { header: true, skipEmptyLines: true });
    } catch {
      return refuse("parse_failed");
    }
    // A stray quote on one line should not throw away a whole report; a file that is not a table should.
    if (!parsed.meta.fields || parsed.meta.fields.length === 0) return refuse("parse_failed");
    const outcome = summarizeResults(parsed.meta.fields, parsed.data);
    if (!outcome.ok) return refuse(outcome.code, outcome.ignoredColumns);
    await ctx.runMutation(internal.resultUploads.finish, { uploadId: args.uploadId, summary: outcome.summary });
    return null;
  },
});

const figures = v.object({
  spend: v.optional(v.number()),
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  conversions: v.optional(v.number()),
  revenue: v.optional(v.number()),
});

export const finish = internalMutation({
  args: {
    uploadId: v.id("resultUploads"),
    code: v.optional(v.string()),
    ignoredColumns: v.optional(v.array(v.string())),
    summary: v.optional(
      v.object({
        rows: v.number(),
        dateStart: v.union(v.string(), v.null()),
        dateStop: v.union(v.string(), v.null()),
        metrics: v.array(v.string()),
        totals: figures,
        groupBy: v.union(v.string(), v.null()),
        groups: v.array(
          v.object({
            name: v.string(),
            spend: v.optional(v.number()),
            impressions: v.optional(v.number()),
            clicks: v.optional(v.number()),
            conversions: v.optional(v.number()),
            revenue: v.optional(v.number()),
          }),
        ),
        otherGroups: v.number(),
        ignoredColumns: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) return;
    // The file itself is never kept, whatever the outcome.
    if (upload.storageId) await ctx.storage.delete(upload.storageId);
    if (args.summary) {
      await ctx.db.patch(args.uploadId, { status: "ready", summary: args.summary, storageId: undefined, code: undefined });
    } else {
      await ctx.db.patch(args.uploadId, {
        status: "refused",
        code: args.code ?? "parse_failed",
        ignoredColumns: args.ignoredColumns,
        storageId: undefined,
      });
    }
  },
});

export type UploadView = {
  id: Id<"resultUploads">;
  fileName: string;
  label: string;
  currency: string;
  createdAt: number;
  status: Doc<"resultUploads">["status"];
  code: string | null;
  ignoredColumns: string[];
  agents: string[];
  summary: ResultsSummary | null;
};

function view(upload: Doc<"resultUploads">): UploadView {
  return {
    id: upload._id,
    fileName: upload.fileName,
    label: upload.label,
    currency: upload.currency,
    createdAt: upload.createdAt,
    status: upload.status,
    code: upload.code ?? null,
    ignoredColumns: upload.summary?.ignoredColumns ?? upload.ignoredColumns ?? [],
    agents: uploadAgents(upload),
    summary: (upload.summary as ResultsSummary | undefined) ?? null,
  };
}

/** The workspace's results files, newest first. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("resultUploads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(LIST_LIMIT);
    return rows.map(view);
  },
});

async function ownUpload(ctx: { db: { get: (id: Id<"resultUploads">) => Promise<Doc<"resultUploads"> | null> } }, workspaceId: Id<"workspaces">, uploadId: Id<"resultUploads">) {
  const upload = await ctx.db.get(uploadId);
  if (!upload || upload.workspaceId !== workspaceId) notFound();
  return upload;
}

/** Deletes an upload's figures. Owners and managers. */
export const remove = workspaceMutation({
  args: { uploadId: v.id("resultUploads") },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const upload = await ownUpload(ctx, ctx.workspaceId, args.uploadId);
    if (upload.storageId) await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(upload._id);
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "results.removed",
      subject: args.uploadId,
    });
    return null;
  },
});

/** Grants or withdraws an agent's use of one upload's figures. Owner only. */
export const setAgentAccess = ownerMutation({
  args: { uploadId: v.id("resultUploads"), agentSlug: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    const upload = await ownUpload(ctx, ctx.workspaceId, args.uploadId);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.agentSlug))
      .unique();
    if (!agent || agent.retired) notFound();
    const current = new Set(uploadAgents(upload));
    if (args.granted) current.add(args.agentSlug);
    else current.delete(args.agentSlug);
    await ctx.db.patch(upload._id, { agents: [...current] });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.granted ? "results.agent_granted" : "results.agent_withdrawn",
      subject: `${args.uploadId}:${args.agentSlug}`,
    });
    return null;
  },
});

/** Ready uploads an agent may use, newest first. For the research tools. */
export const readyForAgent = internalQuery({
  args: { workspaceId: v.id("workspaces"), agentSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("resultUploads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(LIST_LIMIT);
    return rows.filter((row) => row.status === "ready" && uploadAgents(row).includes(args.agentSlug)).map(view);
  },
});

/**
 * Saves an agent's ready uploads as "Your data" sources on a research project, once each (refreshed on a
 * later run), so a claim with basis firstParty can cite them. Returns the uploads used.
 */
export async function saveUploadSourcesFor(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; projectId: Id<"researchProjects">; runId?: Id<"agentRuns">; agentSlug: string },
) {
  const rows = await ctx.db
    .query("resultUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(LIST_LIMIT);
  const used: { upload: Doc<"resultUploads">; sourceId: Id<"sourceRefs"> }[] = [];
  for (const upload of rows) {
    if (upload.status !== "ready" || !uploadAgents(upload).includes(args.agentSlug)) continue;
    const url = uploadUrl(args.agentSlug, upload._id);
    const canonical = canonicalUrl(url) ?? url;
    const existing = await ctx.db
      .query("sourceRefs")
      .withIndex("by_workspace_project_canonical", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("projectId", args.projectId).eq("canonicalUrl", canonical),
      )
      .first();
    const fields = {
      title: clip(`Your results: ${upload.label} (${upload.fileName})`, 200),
      publisher: "Your business",
      observedAt: upload.createdAt,
      excerpt: clip(describeUpload(upload), 300),
      limitation: "Totals from a file you uploaded. Vistrial cannot check them against the platform.",
      ...(args.runId ? { runId: args.runId } : {}),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      used.push({ upload, sourceId: existing._id });
      continue;
    }
    const sourceId = await ctx.db.insert("sourceRefs", {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      origin: "supplied",
      platform: "customerData",
      kind: "dataset",
      url,
      canonicalUrl: canonical,
      availability: "available",
      ...fields,
    });
    used.push({ upload, sourceId });
  }
  return used;
}

export const saveUploadSources = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    projectId: v.id("researchProjects"),
    runId: v.optional(v.id("agentRuns")),
    agentSlug: v.string(),
  },
  handler: async (ctx, args) => (await saveUploadSourcesFor(ctx, args)).map((row) => row.sourceId),
});
