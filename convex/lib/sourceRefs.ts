import type { Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { notFound } from "./errors";
import type { Platform, SourceState, availability, classification, embed, sourceKind } from "./researchShapes";

export const MAX_EXCERPT = 300;
export const MAX_URL = 2048;
export const MAX_TITLE = 300;

/** Query parameters that only track a click. They never change what a page is. */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref_src)$/i;

/** A public http(s) URL with no credentials in it, or null. */
export function parsePublicUrl(raw: string): URL | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  return url;
}

/**
 * One form per page, so the same page found twice is stored once: lower-case host without "www.",
 * no fragment, no tracking parameters, the rest sorted, and no trailing slash.
 */
export function canonicalUrl(raw: string): string | null {
  const url = parsePublicUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "";
  const port = url.port ? `:${url.port}` : "";
  return `https://${host}${port}${path}${query}`;
}

/** Cuts an excerpt to 300 characters or less, on a word where it can. */
export function clipExcerpt(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return undefined;
  if (flat.length <= MAX_EXCERPT) return flat;
  const cut = flat.slice(0, MAX_EXCERPT - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_EXCERPT * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type SourceRefInput = {
  workspaceId: Id<"workspaces">;
  projectId: Id<"researchProjects">;
  runId?: Id<"agentRuns">;
  artifactId?: Id<"runArtifacts">;
  origin: "found" | "supplied";
  platform: Platform;
  kind: Infer<typeof sourceKind>;
  url: string;
  title: string;
  publisher?: string;
  publishedAt?: number;
  observedAt: number;
  embed?: Infer<typeof embed>;
  availability: Infer<typeof availability>;
  excerpt?: string;
  classification?: Infer<typeof classification>;
  limitation?: string;
};

/**
 * Saves one source reference for a project, or returns the one already saved for the same page.
 * Refuses a project, run or artifact from another workspace, and a URL that is not public http(s).
 */
export async function saveSourceRef(ctx: MutationCtx, input: SourceRefInput): Promise<{ id: Id<"sourceRefs">; created: boolean }> {
  const project = await ctx.db.get(input.projectId);
  if (!project || project.workspaceId !== input.workspaceId) notFound();
  if (input.runId) {
    const run = await ctx.db.get(input.runId);
    if (!run || run.workspaceId !== input.workspaceId) notFound();
  }
  if (input.artifactId) {
    const artifact = await ctx.db.get(input.artifactId);
    if (!artifact || artifact.workspaceId !== input.workspaceId) notFound();
  }
  const canonical = canonicalUrl(input.url);
  if (!canonical) throw new Error("That link is not a public web address.");
  const existing = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_project_canonical", (q) =>
      q.eq("workspaceId", input.workspaceId).eq("projectId", input.projectId).eq("canonicalUrl", canonical),
    )
    .first();
  if (existing) {
    const gaps = fillGaps(existing, input);
    if (Object.keys(gaps).length > 0) await ctx.db.patch(existing._id, gaps);
    return { id: existing._id, created: false };
  }
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || canonical;
  const id = await ctx.db.insert("sourceRefs", {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    runId: input.runId,
    artifactId: input.artifactId,
    origin: input.origin,
    platform: input.platform,
    kind: input.kind,
    url: input.url.trim(),
    canonicalUrl: canonical,
    title,
    publisher: input.publisher?.trim().slice(0, MAX_TITLE) || undefined,
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    embed: input.embed,
    availability: input.availability,
    excerpt: clipExcerpt(input.excerpt),
    classification: input.classification,
    limitation: input.limitation?.trim().slice(0, MAX_TITLE) || undefined,
  });
  return { id, created: true };
}

/**
 * What a later check adds to a source already saved. It fills gaps and never overwrites: a TikTok link the
 * web search found gains its embed once oEmbed confirms it, or is marked unavailable when oEmbed refuses it.
 */
export function fillGaps(existing: Doc<"sourceRefs">, input: SourceRefInput) {
  const patch: Partial<Doc<"sourceRefs">> = {};
  if (input.embed && !existing.embed) {
    patch.embed = input.embed;
    patch.availability = input.availability;
    patch.kind = input.kind;
    if (existing.title === existing.canonicalUrl || existing.title === existing.url) {
      patch.title = input.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || existing.title;
    }
  } else if (!existing.embed && (input.availability === "unavailable" || input.availability === "removed") && existing.availability === "linkOnly") {
    patch.availability = input.availability;
    if (input.limitation && !existing.limitation) patch.limitation = input.limitation.trim().slice(0, MAX_TITLE);
  }
  if (input.publisher && !existing.publisher) patch.publisher = input.publisher.trim().slice(0, MAX_TITLE);
  if (input.publishedAt && !existing.publishedAt) patch.publishedAt = input.publishedAt;
  if (input.excerpt && !existing.excerpt) patch.excerpt = clipExcerpt(input.excerpt);
  return patch;
}

/** Sets one adapter's status for a run. A second call for the same source replaces the first. */
export async function setSourceStatus(
  ctx: MutationCtx,
  input: {
    workspaceId: Id<"workspaces">;
    runId: Id<"agentRuns">;
    projectId: Id<"researchProjects">;
    platform: Platform;
    state: SourceState;
    reasonCode: string;
    found: number;
  },
) {
  const run = await ctx.db.get(input.runId);
  const project = await ctx.db.get(input.projectId);
  if (!run || run.workspaceId !== input.workspaceId || !project || project.workspaceId !== input.workspaceId) {
    notFound();
  }
  const current = await ctx.db
    .query("sourceStatus")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", input.workspaceId).eq("runId", input.runId).eq("platform", input.platform))
    .unique();
  const fields = { state: input.state, reasonCode: input.reasonCode, found: input.found, checkedAt: Date.now() };
  if (current) {
    await ctx.db.patch(current._id, fields);
    return current._id;
  }
  return ctx.db.insert("sourceStatus", {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    runId: input.runId,
    platform: input.platform,
    ...fields,
  });
}

/** A source reference as screens see it. No raw fetch, no artifact body. */
export function sourceRefView(row: Doc<"sourceRefs">) {
  return {
    id: row._id,
    projectId: row.projectId,
    runId: row.runId ?? null,
    origin: row.origin,
    platform: row.platform,
    kind: row.kind,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    publisher: row.publisher ?? null,
    publishedAt: row.publishedAt ?? null,
    observedAt: row.observedAt,
    embed: row.embed ?? null,
    availability: row.availability,
    excerpt: row.excerpt ?? null,
    classification: row.classification ?? null,
    limitation: row.limitation ?? null,
  };
}
