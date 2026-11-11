/**
 * Call transcripts a workspace uploads or pastes, from any note taker. The text is the customer's own
 * data: stored for this workspace only, labelled "Your data", and usable as evidence the way results
 * files are. Vistrial takes text only, never audio or video. The person adding one confirms the call was
 * recorded lawfully; that confirmation is stored with it.
 */

import { canWork, isAdmin, requireWork } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { adminMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { canonicalUrl } from "./lib/sourceRefs";
import { cleanTranscript, TRANSCRIPT_REFUSAL_WORDS } from "./lib/transcriptText";

const MAX_TITLE = 120;
const MAX_TOOL = 40;
const LIST_LIMIT = 30;
/** How many transcripts one research run takes as sources, newest first. */
const SOURCES_PER_RUN = 5;
export const MAX_PER_WORKSPACE = 200;

/** The agents a transcript is granted to. Missing means the Growth Architect only. */
export function transcriptAgents(row: Pick<Doc<"callTranscripts">, "agents">) {
  return row.agents ?? [GROWTH_ARCHITECT];
}

function clip(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function requireEditor(role: Doc<"members">["role"]) {
  requireWork(role);
}

/** Where the transcript can be read in the product. Used as the source link. */
export function transcriptUrl(id: Id<"callTranscripts">) {
  return `https://vistrial.io/app/connections/integrations?transcript=${id}`;
}

async function own(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">, id: Id<"callTranscripts">) {
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== workspaceId) notFound();
  return row;
}

/** Adds a transcript from pasted text or a text file's contents. Owners, Admins and Members. */
export const add = workspaceMutation({
  args: {
    title: v.string(),
    /** The tool it came from, in the person's words ("Fathom", "Zoom"). */
    tool: v.string(),
    /** The day of the call, YYYY-MM-DD. */
    callDate: v.optional(v.string()),
    text: v.string(),
    /** The person confirms the call was recorded lawfully and may be shared with Vistrial. */
    consentConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!args.consentConfirmed) throw userError("Confirm that the call was recorded lawfully before adding its transcript.");
    const title = clip(args.title, MAX_TITLE);
    if (!title) throw userError("Give the call a title.");
    if (args.callDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(args.callDate) || Number.isNaN(Date.parse(`${args.callDate}T00:00:00Z`)))) {
      throw userError("The call date is not a date.");
    }
    const cleaned = cleanTranscript(args.text);
    if (!cleaned.ok) throw userError(TRANSCRIPT_REFUSAL_WORDS[cleaned.code], cleaned.code === "too_large" ? "limit" : "invalid");
    const existing = await ctx.db
      .query("callTranscripts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(MAX_PER_WORKSPACE);
    if (existing.length >= MAX_PER_WORKSPACE) throw userError(`A workspace keeps up to ${MAX_PER_WORKSPACE} transcripts. Delete one you no longer need.`, "limit");
    const id = await ctx.db.insert("callTranscripts", {
      workspaceId: ctx.workspaceId,
      title,
      tool: clip(args.tool, MAX_TOOL) || "Other",
      callDate: args.callDate,
      text: cleaned.text,
      words: cleaned.words,
      addedBy: ctx.identity.subject,
      createdAt: Date.now(),
      consentConfirmedAt: Date.now(),
    });
    // The audit row holds the id only, never the title or the text.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "transcript.added", subject: id });
    return id;
  },
});

export type TranscriptView = {
  id: Id<"callTranscripts">;
  title: string;
  tool: string;
  callDate: string | null;
  words: number;
  createdAt: number;
  agents: string[];
  /** The opening of the call, to recognise it by. */
  opening: string;
};

function view(row: Doc<"callTranscripts">): TranscriptView {
  return {
    id: row._id,
    title: row.title,
    tool: row.tool,
    callDate: row.callDate ?? null,
    words: row.words,
    createdAt: row.createdAt,
    agents: transcriptAgents(row),
    opening: clip(row.text, 200),
  };
}

/** The workspace's transcripts, newest first, without their full text. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("callTranscripts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(LIST_LIMIT);
    return { canEdit: canWork(ctx.member.role), canGrant: isAdmin(ctx.member.role), transcripts: rows.map(view) };
  },
});

/** One transcript's full text. Owners, Admins and Members. */
export const read = workspaceQuery({
  args: { transcriptId: v.id("callTranscripts") },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const row = await own(ctx, ctx.workspaceId, args.transcriptId);
    return { ...view(row), text: row.text };
  },
});

/** Deletes a transcript and its text. Owners, Admins and Members. */
export const remove = workspaceMutation({
  args: { transcriptId: v.id("callTranscripts") },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const row = await own(ctx, ctx.workspaceId, args.transcriptId);
    await ctx.db.delete(row._id);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "transcript.removed", subject: args.transcriptId });
    return null;
  },
});

/** Grants or withdraws an agent's use of one transcript. Owner only. */
export const setAgentAccess = adminMutation({
  args: { transcriptId: v.id("callTranscripts"), agentSlug: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    const row = await own(ctx, ctx.workspaceId, args.transcriptId);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.agentSlug))
      .unique();
    if (!agent || agent.retired) notFound();
    const current = new Set(transcriptAgents(row));
    if (args.granted) current.add(args.agentSlug);
    else current.delete(args.agentSlug);
    await ctx.db.patch(row._id, { agents: [...current] });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.granted ? "transcript.agent_granted" : "transcript.agent_withdrawn",
      subject: `${args.transcriptId}:${args.agentSlug}`,
    });
    return null;
  },
});

/** One line a reader can check against the page. */
export function describeTranscript(row: Pick<Doc<"callTranscripts">, "title" | "tool" | "callDate" | "words">) {
  return `Call transcript "${row.title}"${row.callDate ? ` on ${row.callDate}` : ""}, from ${row.tool}, ${row.words.toLocaleString("en-US")} words.`;
}

/**
 * Saves an agent's granted transcripts as "Your data" sources on a research project, once each (refreshed
 * on a later run), so a claim with basis firstParty can cite them. Newest first, a few per run.
 */
export async function saveTranscriptSourcesFor(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; projectId: Id<"researchProjects">; runId?: Id<"agentRuns">; agentSlug: string },
) {
  const rows = await ctx.db
    .query("callTranscripts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(LIST_LIMIT);
  const used: { transcript: Doc<"callTranscripts">; sourceId: Id<"sourceRefs"> }[] = [];
  for (const transcript of rows) {
    if (used.length >= SOURCES_PER_RUN) break;
    if (!transcriptAgents(transcript).includes(args.agentSlug)) continue;
    const url = transcriptUrl(transcript._id);
    const canonical = canonicalUrl(url) ?? url;
    const existing = await ctx.db
      .query("sourceRefs")
      .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", args.workspaceId).eq("projectId", args.projectId).eq("canonicalUrl", canonical))
      .first();
    const fields = {
      title: clip(`Your call: ${transcript.title} (${transcript.tool})`, 200),
      publisher: "Your business",
      observedAt: transcript.createdAt,
      excerpt: clip(transcript.text, 300),
      limitation: "A transcript you provided. Vistrial cannot check it against the recording, and one call is not a pattern.",
      ...(args.runId ? { runId: args.runId } : {}),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      used.push({ transcript, sourceId: existing._id });
      continue;
    }
    const sourceId = await ctx.db.insert("sourceRefs", {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      origin: "supplied",
      platform: "customerData",
      kind: "file",
      url,
      canonicalUrl: canonical,
      availability: "available",
      ...fields,
    });
    used.push({ transcript, sourceId });
  }
  return used;
}
