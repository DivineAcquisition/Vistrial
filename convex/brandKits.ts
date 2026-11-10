/**
 * Brand kits: one for the workspace's own brand and one per client, each versioned as it is refined. Every
 * creative belongs to a kit and takes its look, voice and logo from it. Logos are real files the business
 * uploaded: Creative Production places them on an image and never generates one.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { BRAND_MAX, LOGO_TYPES, MAX_LOGO_BYTES, brandGaps, brandProblem, cleanBrand, sameBrand, type BrandContent, type BrandInput } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";

const MAX_KITS = 100;
const MAX_VERSIONS = 200;
const LOGO_NAME = /\.(png|jpe?g|webp|svg)$/i;

export const ONE_OWN_KIT = "You already have a kit for your own brand. Edit that one, or add this as a client.";

export async function ownKit(ctx: QueryCtx, workspaceId: Id<"workspaces">, kitId: Id<"brandKits">) {
  const kit = await ctx.db.get(kitId);
  if (!kit || kit.workspaceId !== workspaceId) notFound();
  return kit;
}

async function versionsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, kitId: Id<"brandKits">) {
  return ctx.db
    .query("brandKitVersions")
    .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", workspaceId).eq("kitId", kitId))
    .take(MAX_VERSIONS);
}

/** A stored version as kit content. */
export function contentOf(row: Doc<"brandKitVersions">): BrandContent {
  return cleanBrand({
    name: row.name,
    website: row.website,
    industry: row.industry,
    colors: row.colors,
    headingFont: row.headingFont,
    bodyFont: row.bodyFont,
    imageStyle: row.imageStyle,
    tone: row.tone,
    useWords: row.useWords,
    avoidWords: row.avoidWords,
    examples: row.examples,
    disclaimers: row.disclaimers,
    regulated: row.regulated,
    bannedTopics: row.bannedTopics,
    placements: row.placements,
    logos: row.logos,
    logosOwned: row.logosOwned,
  });
}

/** The current version of a kit, for a skill that makes a creative for it. Null when the kit has none. */
export async function currentKit(ctx: QueryCtx, workspaceId: Id<"workspaces">, kitId: Id<"brandKits">) {
  const kit = await ownKit(ctx, workspaceId, kitId);
  const row = (await versionsOf(ctx, workspaceId, kit._id)).find((version) => version.version === kit.currentVersion);
  return row ? { kit, version: row.version, content: contentOf(row) } : null;
}

/** Content with a link to show each logo. The links are short-lived and only ever for this workspace's files. */
async function withLogoUrls(ctx: QueryCtx, content: BrandContent) {
  const logos = [];
  for (const logo of content.logos) {
    logos.push({ ...logo, url: await ctx.storage.getUrl(logo.storageId as Id<"_storage">) });
  }
  return { ...content, logos };
}

async function versionView(ctx: QueryCtx, row: Doc<"brandKitVersions">) {
  return { version: row.version, ...(await withLogoUrls(ctx, contentOf(row))), note: row.note ?? null, createdAt: row.createdAt };
}

/** Every brand kit, the workspace's own first, then clients by most recently changed. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const kits = await ctx.db
      .query("brandKits")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(MAX_KITS);
    const out = [];
    for (const kit of kits) {
      if (kit.archived) continue;
      const versions = await versionsOf(ctx, ctx.workspaceId, kit._id);
      const current = versions.find((row) => row.version === kit.currentVersion);
      if (!current) continue;
      const content = contentOf(current);
      const logo = content.logos[0];
      out.push({
        id: kit._id,
        kind: kit.kind,
        name: kit.name,
        versions: versions.length,
        updatedAt: kit.updatedAt,
        industry: content.industry,
        colors: content.colors,
        logoUrl: logo ? await ctx.storage.getUrl(logo.storageId as Id<"_storage">) : null,
        gaps: brandGaps(content),
      });
    }
    return out.sort((a, b) => Number(b.kind === "own") - Number(a.kind === "own"));
  },
});

/** One kit with every version, oldest first. */
export const get = workspaceQuery({
  args: { kitId: v.id("brandKits") },
  handler: async (ctx, args) => {
    const kit = await ownKit(ctx, ctx.workspaceId, args.kitId);
    const versions = (await versionsOf(ctx, ctx.workspaceId, kit._id)).sort((a, b) => a.version - b.version);
    const views = [];
    for (const row of versions) views.push(await versionView(ctx, row));
    return { id: kit._id, kind: kit.kind, name: kit.name, currentVersion: kit.currentVersion, archived: kit.archived === true, versions: views };
  },
});

/** A one-time upload link for a logo file. Owners and Managers. */
export const logoUploadUrl = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role === "rep") notAllowed();
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Checks each logo is a real uploaded image of a kind and size we accept. A logo the kit already holds was
 * checked when it was added. A file that fails is deleted, so a refused upload does not linger.
 */
async function assertLogos(ctx: MutationCtx, content: BrandContent, held: Set<string>) {
  for (const logo of content.logos) {
    if (held.has(logo.storageId)) continue;
    const id = ctx.db.system.normalizeId("_storage", logo.storageId);
    const meta = id ? await ctx.db.system.get(id) : null;
    if (!id || !meta) throw userError("A logo file did not finish uploading. Add it again.");
    // The type the browser sent with the upload. A file stored without one is judged by its name.
    const type = (meta.contentType ?? "").split(";")[0].trim().toLowerCase();
    const accepted = type ? (LOGO_TYPES as readonly string[]).includes(type) : LOGO_NAME.test(logo.name);
    if (!accepted) {
      await ctx.storage.delete(id);
      throw userError("Add the logo as a PNG, JPG, WebP or SVG file.");
    }
    if (meta.size > MAX_LOGO_BYTES) {
      await ctx.storage.delete(id);
      throw userError("That logo file is over 5 MB.");
    }
  }
}

const contentArgs = {
  name: v.string(),
  website: v.optional(v.string()),
  industry: v.optional(v.string()),
  colors: v.optional(v.array(v.object({ label: v.string(), hex: v.string() }))),
  headingFont: v.optional(v.string()),
  bodyFont: v.optional(v.string()),
  imageStyle: v.optional(v.string()),
  tone: v.optional(v.string()),
  useWords: v.optional(v.array(v.string())),
  avoidWords: v.optional(v.array(v.string())),
  examples: v.optional(v.array(v.string())),
  disclaimers: v.optional(v.array(v.string())),
  // Checked in code (brandProblem), so a wrong value gets words a person can act on.
  regulated: v.optional(v.string()),
  bannedTopics: v.optional(v.array(v.string())),
  placements: v.optional(v.array(v.string())),
  logos: v.optional(v.array(v.object({ storageId: v.string(), variant: v.string(), name: v.string() }))),
  logosOwned: v.optional(v.boolean()),
};

function versionFields(content: BrandContent) {
  return { ...content, logos: content.logos.map((logo) => ({ ...logo, storageId: logo.storageId as Id<"_storage"> })) };
}

/**
 * Saves the kit as a new version, or a new kit without `kitId` (then `kind` says whose brand it is).
 * Nothing is overwritten, and saving the same content again adds nothing. A workspace has one kit for its
 * own brand. Owners and Managers.
 */
export const saveVersion = workspaceMutation({
  args: { kitId: v.optional(v.id("brandKits")), kind: v.optional(v.union(v.literal("own"), v.literal("client"))), note: v.optional(v.string()), ...contentArgs },
  handler: async (ctx, { kitId, kind, note, ...raw }) => {
    if (ctx.member.role === "rep") notAllowed();
    const input = raw as BrandInput;
    const problem = brandProblem(input);
    if (problem) throw userError(problem);
    if ((note ?? "").trim().length > BRAND_MAX.note) throw userError(`Keep the note under ${BRAND_MAX.note} characters.`);
    const content = cleanBrand(input);
    const now = Date.now();
    const stamp = { ...(note?.trim() ? { note: note.trim() } : {}), createdBy: ctx.identity.subject, createdAt: now };

    if (kitId) {
      const kit = await ownKit(ctx, ctx.workspaceId, kitId);
      if (kit.archived) throw userError("This brand was put away. Add it again to use it.");
      const versions = await versionsOf(ctx, ctx.workspaceId, kit._id);
      const current = versions.find((row) => row.version === kit.currentVersion);
      if (current && sameBrand(contentOf(current), content)) return { kitId: kit._id, version: kit.currentVersion, added: false };
      if (versions.length >= MAX_VERSIONS) throw userError("This brand has too many versions. Add it as a new brand to keep editing.", "limit");
      await assertLogos(ctx, content, new Set(versions.flatMap((row) => row.logos.map((logo) => logo.storageId as string))));
      const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
      await ctx.db.insert("brandKitVersions", { workspaceId: ctx.workspaceId, kitId: kit._id, version, ...versionFields(content), ...stamp });
      await ctx.db.patch(kit._id, { name: content.name, currentVersion: version, updatedAt: now });
      await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "brandKit.version", subject: kit._id, count: version });
      return { kitId: kit._id, version, added: true };
    }

    if (!kind) throw userError("Say whether this is your own brand or a client's.");
    const existing = await ctx.db
      .query("brandKits")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(MAX_KITS + 1);
    const open = existing.filter((row) => !row.archived);
    if (open.length >= MAX_KITS) throw userError(`Up to ${MAX_KITS} brands. Put one away to add another.`, "limit");
    if (kind === "own" && open.some((row) => row.kind === "own")) throw userError(ONE_OWN_KIT);
    await assertLogos(ctx, content, new Set());
    const id = await ctx.db.insert("brandKits", { workspaceId: ctx.workspaceId, kind, name: content.name, currentVersion: 1, createdBy: ctx.identity.subject, createdAt: now, updatedAt: now });
    await ctx.db.insert("brandKitVersions", { workspaceId: ctx.workspaceId, kitId: id, version: 1, ...versionFields(content), ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "brandKit.created", subject: id });
    return { kitId: id, version: 1, added: true };
  },
});

/** Puts a kit away. Its versions and logo files are kept, so a creative made with it still shows them. Owners and Managers. */
export const archive = workspaceMutation({
  args: { kitId: v.id("brandKits") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const kit = await ownKit(ctx, ctx.workspaceId, args.kitId);
    await ctx.db.patch(kit._id, { archived: true, updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "brandKit.archived", subject: kit._id });
    return null;
  },
});
