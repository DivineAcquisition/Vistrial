/**
 * Dealmaker's Playbook, read and edited by people (docs/rebuild/dealmaker.md, 0.6 and 0.7). One per
 * organization and one per client: `clientId` picks it, missing for the organization's own. Everyone who
 * may see that client reads it; Owners, Admins and Members edit it (a Viewer is refused by the builders).
 * The rules and the evidence labels live in lib/playbook.ts.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, clientOfAsset, type ClientScope } from "./lib/clients";
import { notFound, userError } from "./lib/errors";
import { BASIS_LABEL } from "./lib/evidence";
import {
  FOLDER_LABEL,
  FOLDERS,
  KIND_LABEL,
  LIMITS,
  PLAYBOOK_TEXT,
  SOURCE_LABEL,
  STAGE_LABEL,
  basisFor,
  checkItem,
  clean,
  cleanBody,
  folder,
  itemsOf,
  kind,
  lessonsOf,
  needsFrom,
  objectionTag,
  stage,
  type ItemInput,
} from "./lib/playbook";
import { SALES_CONVERSION } from "./catalog";
import { canonicalUrl } from "./lib/sourceRefs";
import { youtubeId } from "./adapters/links";
import { startRunFor } from "./runs";
import { SKILL_SLUG as STUDY_SKILL, STUDY_LIMITS } from "./skills/playbookStudy/shapes";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };

/** The Playbook a member asked for, after checking they may see it. Archived clients can still be read. */
async function scopeFor(ctx: Ctx, clientId: Id<"clients"> | undefined) {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** Call transcripts this Playbook's business has shared with Dealmaker. */
async function transcriptsShared(ctx: Pick<QueryCtx, "db">, scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }) {
  const rows = await ctx.db
    .query("callTranscripts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId))
    .take(500);
  return rows.filter((row) => row.clientId === scope.clientId && (row.agents ?? []).includes(SALES_CONVERSION)).length;
}

/** Calls shared with Dealmaker for this Playbook's business, newest first. */
async function sharedTranscripts(ctx: Pick<QueryCtx, "db">, scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }) {
  const rows = await ctx.db
    .query("callTranscripts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId))
    .order("desc")
    .take(500);
  return rows.filter((row) => row.clientId === scope.clientId && (row.agents ?? []).includes(SALES_CONVERSION)).slice(0, 30);
}

/** Strategist's latest approved offer analysis for this Playbook's business, if there is one. */
async function approvedOfferAnalysis(ctx: QueryCtx, scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }) {
  const rows = await ctx.db
    .query("assets")
    .withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", scope.workspaceId).eq("kind", "offerAnalysis").eq("status", "approved"))
    .order("desc")
    .take(20);
  for (const row of rows) if ((await clientOfAsset(ctx, row)) === scope.clientId) return row;
  return null;
}

function itemView(row: Doc<"playbookItems">) {
  return {
    id: row._id,
    folder: row.folder,
    kind: row.kind,
    kindLabel: KIND_LABEL[row.kind],
    stage: row.stage ?? null,
    stageLabel: row.stage ? STAGE_LABEL[row.stage] : null,
    tag: row.tag ?? null,
    title: row.title,
    body: row.body,
    quote: row.quote ?? null,
    source: { type: row.source.type, label: row.source.label ?? null, ref: row.source.ref ?? null, words: SOURCE_LABEL[row.source.type] },
    basis: row.basis,
    basisLabel: BASIS_LABEL[row.basis],
    updatedAt: row.updatedAt,
  };
}

function lessonView(row: Doc<"playbookLessons">) {
  return {
    id: row._id,
    text: row.text,
    source: row.source,
    status: row.status,
    byDealmaker: row.proposedBy === "agent",
    proposedAt: row.proposedAt,
    decidedAt: row.decidedAt ?? null,
  };
}

/** One Playbook: its four folders, the learned list and what each skill still needs. */
export const view = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await scopeFor(ctx, args.clientId);
    const [items, lessons, transcripts, studies, offer] = await Promise.all([
      itemsOf(ctx, scope),
      lessonsOf(ctx, scope),
      transcriptsShared(ctx, scope),
      ctx.db
        .query("playbookStudies")
        .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
        .order("desc")
        .take(5),
      approvedOfferAnalysis(ctx, scope),
    ]);
    const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      clientId: scope.clientId ?? null,
      folders: FOLDERS.map((id) => ({
        id,
        name: FOLDER_LABEL[id].name,
        holds: FOLDER_LABEL[id].holds,
        items: sorted.filter((row) => row.folder === id).map(itemView),
      })),
      lessons: {
        proposed: lessons.filter((row) => row.status === "proposed").sort((a, b) => b.proposedAt - a.proposedAt).map(lessonView),
        approved: lessons.filter((row) => row.status === "approved").sort((a, b) => b.proposedAt - a.proposedAt).map(lessonView),
      },
      needs: needsFrom(items, transcripts),
      studies: studies.map((row) => ({
        id: row._id,
        status: row.status,
        sources: row.sources.map((source) => source.label),
        filed: row.filed ?? null,
        dropped: row.dropped ?? null,
        missing: row.missing ?? [],
        createdAt: row.createdAt,
      })),
      /** What a study can read: calls shared with Dealmaker, and Strategist's approved offer analysis. */
      readable: {
        transcripts: (await sharedTranscripts(ctx, scope)).map((row) => ({ id: row._id, title: row.title, callDate: row.callDate ?? null })),
        offerAnalysis: offer ? { id: offer._id, title: offer.title } : null,
      },
      canEdit: ctx.role !== "viewer",
    };
  },
});

const itemFields = {
  folder,
  kind,
  stage: v.optional(stage),
  tag: v.optional(objectionTag),
  title: v.string(),
  body: v.string(),
};

function shaped(args: ItemInput) {
  const problem = checkItem(args);
  if (problem) throw userError(problem);
  return {
    folder: args.folder,
    kind: args.kind,
    stage: args.stage,
    tag: args.tag,
    title: clean(args.title, LIMITS.title),
    body: cleanBody(args.body),
  };
}

/** A person adds an item. It is the business's own data, labelled so. */
export const addItem = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), ...itemFields },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const fields = shaped(args);
    const live = await itemsOf(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    if (live.length >= LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
    const now = Date.now();
    const id = await ctx.db.insert("playbookItems", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      ...fields,
      source: { type: "person" },
      basis: basisFor("person"),
      status: "active",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.item_added", subject: id });
    return id;
  },
});

async function liveItem(ctx: Ctx, id: Id<"playbookItems">) {
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== ctx.workspaceId || row.status !== "active") notFound();
  ctx.clients.require(row.clientId);
  return row;
}

/**
 * A person edits an item. It keeps where it came from; once a person has rewritten it, what it says is the
 * business's own word, so an item from a public source or the starter set becomes "Your data".
 */
export const updateItem = workspaceMutation({
  args: { itemId: v.id("playbookItems"), ...itemFields },
  handler: async (ctx, args) => {
    const row = await liveItem(ctx, args.itemId);
    const fields = shaped(args);
    await ctx.db.patch(row._id, { ...fields, basis: basisFor("person"), updatedBy: ctx.identity.subject, updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.item_edited", subject: row._id });
    return null;
  },
});

/** Takes an item out of the Playbook. It is kept, so what earlier drafts used can still be shown. */
export const archiveItem = workspaceMutation({
  args: { itemId: v.id("playbookItems") },
  handler: async (ctx, args) => {
    const row = await liveItem(ctx, args.itemId);
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "archived", archivedBy: ctx.identity.subject, archivedAt: now, updatedAt: now });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.item_archived", subject: row._id });
    return null;
  },
});

/* ---------------------------------------------------------------------------
 * The learned list
 * ------------------------------------------------------------------------- */

/** A person writes a lesson themselves. Written by a person, it is approved as it is saved. */
export const addLesson = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), text: v.string() },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const text = clean(args.text, LIMITS.lesson);
    if (!text) throw userError(PLAYBOOK_TEXT.emptyLesson);
    const kept = await lessonsOf(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    if (kept.length >= LIMITS.lessons) throw userError(PLAYBOOK_TEXT.lessonsFull);
    const now = Date.now();
    const id = await ctx.db.insert("playbookLessons", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      text,
      source: "person",
      status: "approved",
      proposedBy: ctx.identity.subject,
      proposedAt: now,
      decidedBy: ctx.identity.subject,
      decidedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.lesson_added", subject: id });
    return id;
  },
});

async function keptLesson(ctx: Ctx, id: Id<"playbookLessons">) {
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== ctx.workspaceId || row.status === "removed") notFound();
  ctx.clients.require(row.clientId);
  return row;
}

/** A person approves or rejects a lesson Dealmaker proposed. Only an approved lesson guides drafts. */
export const decideLesson = workspaceMutation({
  args: { lessonId: v.id("playbookLessons"), approve: v.boolean(), text: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await keptLesson(ctx, args.lessonId);
    if (row.status !== "proposed") throw userError(PLAYBOOK_TEXT.notProposed);
    const text = args.text === undefined ? row.text : clean(args.text, LIMITS.lesson);
    if (!text) throw userError(PLAYBOOK_TEXT.emptyLesson);
    const now = Date.now();
    await ctx.db.patch(row._id, { text, status: args.approve ? "approved" : "rejected", decidedBy: ctx.identity.subject, decidedAt: now, updatedAt: now });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.approve ? "playbook.lesson_approved" : "playbook.lesson_rejected",
      subject: row._id,
    });
    return null;
  },
});

/** Anyone who may edit the Playbook can change an approved lesson's words. */
export const editLesson = workspaceMutation({
  args: { lessonId: v.id("playbookLessons"), text: v.string() },
  handler: async (ctx, args) => {
    const row = await keptLesson(ctx, args.lessonId);
    const text = clean(args.text, LIMITS.lesson);
    if (!text) throw userError(PLAYBOOK_TEXT.emptyLesson);
    await ctx.db.patch(row._id, { text, updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.lesson_edited", subject: row._id });
    return null;
  },
});

/** Removes a lesson from the list; it no longer guides anything. */
export const removeLesson = workspaceMutation({
  args: { lessonId: v.id("playbookLessons") },
  handler: async (ctx, args) => {
    const row = await keptLesson(ctx, args.lessonId);
    await ctx.db.patch(row._id, { status: "removed", decidedBy: ctx.identity.subject, decidedAt: Date.now(), updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.lesson_removed", subject: row._id });
    return null;
  },
});

/* ---------------------------------------------------------------------------
 * Reading sources into the Playbook
 * ------------------------------------------------------------------------- */

const STUDY_TEXT = {
  nothing: "Choose a call, paste some text, add a page of your website or a YouTube link, or include the offer analysis.",
  tooManyPages: `A study reads at most ${STUDY_LIMITS.pages} pages of your website at a time.`,
  badPage: "That is not a web address.",
  tooManyVideos: `A study reads at most ${STUDY_LIMITS.videos} videos at a time.`,
  badVideo: "That is not a YouTube video link.",
  tooMany: `A study reads at most ${STUDY_LIMITS.sources} sources at a time.`,
  notShared: "That call is not shared with Dealmaker.",
  noOffer: "There is no approved offer analysis to read.",
  emptyText: "Pasted text needs a name and some words.",
} as const;

/**
 * A person asks Dealmaker to read sources into this Playbook: calls shared with Dealmaker, pasted or
 * uploaded text, and Strategist's approved offer analysis. It runs as Dealmaker's work, so it starts only
 * once Dealmaker is live and on, with the run's own cost limit.
 */
export const study = workspaceMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    transcriptIds: v.optional(v.array(v.id("callTranscripts"))),
    texts: v.optional(v.array(v.object({ label: v.string(), text: v.string() }))),
    offerAnalysis: v.optional(v.boolean()),
    /** Public pages of the business's own website, by address. */
    website: v.optional(v.array(v.string())),
    /** Public YouTube videos, by link: read by Gemini from the link, never downloaded. */
    videos: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const sources: Doc<"playbookStudies">["sources"] = [];
    const shared = new Map((await sharedTranscripts(ctx, scope)).map((row) => [row._id as string, row]));
    for (const id of args.transcriptIds ?? []) {
      const row = shared.get(id);
      if (!row) throw userError(STUDY_TEXT.notShared);
      sources.push({ type: "transcript", ref: row._id, label: clean(row.title, STUDY_LIMITS.label) });
    }
    for (const row of args.texts ?? []) {
      const label = clean(row.label, STUDY_LIMITS.label);
      const text = cleanBodyLong(row.text);
      if (!label || !text) throw userError(STUDY_TEXT.emptyText);
      sources.push({ type: "text", label, text });
    }
    if (args.offerAnalysis) {
      const offer = await approvedOfferAnalysis(ctx, scope);
      if (!offer) throw userError(STUDY_TEXT.noOffer);
      sources.push({ type: "strategist", ref: offer._id, label: clean(offer.title, STUDY_LIMITS.label) });
    }
    const pages = [...new Set((args.website ?? []).map((row) => row.trim()).filter(Boolean))];
    if (pages.length > STUDY_LIMITS.pages) throw userError(STUDY_TEXT.tooManyPages);
    for (const page of pages) {
      const url = /^https?:\/\//i.test(page) ? page : `https://${page}`;
      if (!canonicalUrl(url)) throw userError(STUDY_TEXT.badPage);
      sources.push({ type: "website", ref: url, label: clean(url.replace(/^https?:\/\//i, ""), STUDY_LIMITS.label) });
    }
    const videos = [...new Set((args.videos ?? []).map((row) => row.trim()).filter(Boolean))];
    if (videos.length > STUDY_LIMITS.videos) throw userError(STUDY_TEXT.tooManyVideos);
    for (const video of videos) {
      const id = youtubeId(/^https?:\/\//i.test(video) ? video : `https://${video}`);
      if (!id) throw userError(STUDY_TEXT.badVideo);
      sources.push({ type: "video", ref: `https://www.youtube.com/watch?v=${id}`, label: `YouTube video ${id}` });
    }
    if (!sources.length) throw userError(STUDY_TEXT.nothing);
    if (sources.length > STUDY_LIMITS.sources) throw userError(STUDY_TEXT.tooMany);
    const studyId = await ctx.db.insert("playbookStudies", { workspaceId: ctx.workspaceId, ...forClient, sources, status: "running", createdBy: ctx.identity.subject, createdAt: Date.now() });
    const runId = await startRunFor(ctx, {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      role: ctx.member.role,
      agentSlug: SALES_CONVERSION,
      skillSlug: STUDY_SKILL,
      inputRef: studyId,
      ...forClient,
    });
    await ctx.db.patch(studyId, { runId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.study_started", subject: studyId });
    return { studyId, runId };
  },
});

/** Pasted text keeps its lines, up to the study's limit. */
function cleanBodyLong(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, STUDY_LIMITS.pastedChars);
}
