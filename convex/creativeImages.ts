/**
 * Images for an approved or waiting ad set: the price before anything is spent, the batch a person confirms,
 * and the images themselves. Each image is charged only once it is delivered, and its price is held from the
 * balance while it is being made, so two batches cannot spend the same credit.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { contentOf as kitContent } from "./brandKits";
import { writeAudit } from "./lib/audit";
import { OUT_OF_CREDITS, accountFor, billingOn, chargeUsage, priceFor } from "./lib/billing";
import { PLACEMENTS, type Placement } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { IMAGE_FAIL_WORDS, IMAGE_SIZE, MAX_IMAGES_PER_BATCH, MAX_IMAGES_PER_DAY, PLACEMENT_ASPECT, imagePrompt, isPlacement } from "./lib/creativeImages";
import { notAllowed, notFound, userError } from "./lib/errors";
import { imageCostCents, imageModel } from "./lib/gemini";
import { savedRecord } from "./lib/savedRecords";
import type { CreativeRecord } from "./skills/creativeProduction/shapes";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ad set an image belongs to, with its saved creative. Refuses one that is not ready to spend on. */
async function adSet(ctx: QueryCtx, workspaceId: Id<"workspaces">, assetId: Id<"assets">) {
  const asset = await ctx.db.get(assetId);
  if (!asset || asset.workspaceId !== workspaceId || asset.kind !== "adCopySet") notFound();
  const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
  if (!saved?.creative) notFound();
  return { asset, saved, creative: saved.creative };
}

async function kitOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, saved: CreativeRecord) {
  const kitId = ctx.db.normalizeId("brandKits", saved.kit.id);
  if (!kitId) return null;
  const row = await ctx.db
    .query("brandKitVersions")
    .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", workspaceId).eq("kitId", kitId).eq("version", saved.kit.version))
    .unique();
  return row ? kitContent(row) : null;
}

async function imagesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, assetId: Id<"assets">) {
  return ctx.db
    .query("creativeImages")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", workspaceId).eq("assetId", assetId))
    .take(200);
}

/** Credit already promised to images still being made. */
async function heldCents(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("creativeImages")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", "generating"))
    .take(200);
  return rows.reduce((sum, row) => sum + row.holdCents, 0);
}

function cleanPlacements(raw: string[]): Placement[] {
  if (!raw.every(isPlacement)) throw userError("One of the placements is not one Vistrial makes.");
  return PLACEMENTS.filter((placement) => raw.includes(placement));
}

/** What a batch would cost: the count, the price of each and the total, in cents of credit. */
function priceOf(count: number) {
  const each = priceFor(imageCostCents(imageModel(), IMAGE_SIZE));
  return { count, eachCents: each, totalCents: each * count };
}

/**
 * The price of making images for an ad set, before anything is spent: one image per variation per placement.
 * Also says whether the balance covers it once credit held for images in progress is set aside.
 */
export const quote = workspaceQuery({
  args: { assetId: v.id("assets"), placements: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { asset, saved, creative } = await adSet(ctx, ctx.workspaceId, args.assetId);
    const placements = cleanPlacements(args.placements);
    const kit = await kitOf(ctx, ctx.workspaceId, saved);
    const price = priceOf(creative.variations.length * placements.length);
    const account = billingOn() ? await accountFor(ctx, ctx.workspaceId) : null;
    const available = account ? account.balanceCents - (await heldCents(ctx, ctx.workspaceId)) : null;
    return {
      ...price,
      variations: creative.variations.length,
      placements,
      /** The placements the brand kit names, as the starting choice. */
      kitPlacements: kit?.placements ?? [],
      /** Null when billing is off (local and test deployments): nothing is blocked there. */
      availableCents: available,
      canAfford: available === null || available >= price.totalCents,
      blocked: asset.status === "needsReview" ? "This ad set did not pass its checks. Fix it before spending on images." : asset.status === "rejected" || asset.status === "archived" ? "This ad set was rejected or put away." : null,
    };
  },
});

async function assertRoom(ctx: MutationCtx, workspaceId: Id<"workspaces">, count: number, totalCents: number) {
  if (count > MAX_IMAGES_PER_BATCH) throw userError(`Up to ${MAX_IMAGES_PER_BATCH} images at a time. Choose fewer placements.`, "limit");
  const today = await ctx.db
    .query("creativeImages")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).gt("createdAt", Date.now() - DAY_MS))
    .take(MAX_IMAGES_PER_DAY + 1);
  if (today.length + count > MAX_IMAGES_PER_DAY) throw userError(`Up to ${MAX_IMAGES_PER_DAY} images a day. Try again tomorrow.`, "limit");
  if (!billingOn()) return;
  const account = await accountFor(ctx, workspaceId);
  const available = (account?.balanceCents ?? 0) - (await heldCents(ctx, workspaceId));
  if (!account || available <= 0) throw userError(OUT_OF_CREDITS, "out_of_credits");
  if (available < totalCents) throw userError("Your credit balance does not cover these images. An owner can add credits in Billing, or choose fewer placements.", "out_of_credits");
}

/**
 * Makes the images a person confirmed: one per variation per placement, or one again (`only`). `confirmedCents`
 * is the total they were shown; if the price is no longer that, nothing is made and they are shown the new
 * one. An image already made for the same variation and placement is replaced. Owners and Managers.
 */
export const generate = workspaceMutation({
  args: { assetId: v.id("assets"), placements: v.array(v.string()), confirmedCents: v.number(), only: v.optional(v.object({ variationKey: v.string(), placement: v.string() })) },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const { asset, creative } = await adSet(ctx, ctx.workspaceId, args.assetId);
    if (asset.status === "needsReview") throw userError("This ad set did not pass its checks. Fix it before spending on images.");
    if (asset.status === "rejected" || asset.status === "archived") throw userError("This ad set was rejected or put away.");
    const placements = cleanPlacements(args.only ? [args.only.placement] : args.placements);
    const variations = args.only ? creative.variations.filter((row) => row.key === args.only?.variationKey) : creative.variations;
    if (placements.length === 0 || variations.length === 0) throw userError("Choose at least one placement.");
    const price = priceOf(variations.length * placements.length);
    if (args.confirmedCents !== price.totalCents) throw userError("The price changed. Check the new price and confirm again.");
    await assertRoom(ctx, ctx.workspaceId, price.count, price.totalCents);

    const existing = await imagesOf(ctx, ctx.workspaceId, asset._id);
    const model = imageModel();
    const now = Date.now();
    let started = 0;
    for (const variation of variations) {
      for (const placement of placements) {
        const prior = existing.find((row) => row.variationKey === variation.key && row.placement === placement);
        // One still being made is left alone: pressing twice never pays twice.
        if (prior?.status === "generating") continue;
        let imageId;
        if (prior) {
          // The earlier picture stays visible until the new one arrives, then its file is deleted.
          await ctx.db.patch(prior._id, { status: "generating", model, holdCents: price.eachCents, failCode: undefined });
          imageId = prior._id;
        } else {
          imageId = await ctx.db.insert("creativeImages", { workspaceId: ctx.workspaceId, assetId: asset._id, variationKey: variation.key, placement, status: "generating", model, costCents: 0, holdCents: price.eachCents, createdBy: ctx.identity.subject, createdAt: now });
        }
        await ctx.scheduler.runAfter(0, internal.creativeImageActions.make, { imageId });
        started += 1;
      }
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.images", subject: asset._id, count: started });
    return { started, totalCents: price.eachCents * started };
  },
});

/** The images of an ad set, with the brand's look for placing the headline and the real logo on top. */
export const list = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const { asset, saved } = await adSet(ctx, ctx.workspaceId, args.assetId);
    const kit = await kitOf(ctx, ctx.workspaceId, saved);
    const images = [];
    for (const row of await imagesOf(ctx, ctx.workspaceId, asset._id)) {
      images.push({
        id: row._id,
        variationKey: row.variationKey,
        placement: row.placement,
        status: row.status,
        url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
        problem: row.status === "failed" ? (IMAGE_FAIL_WORDS[row.failCode ?? ""] ?? "This image could not be made.") : null,
      });
    }
    const logo = kit?.logos.find((row) => row.variant === "light") ?? kit?.logos.find((row) => row.variant === "icon") ?? kit?.logos[0] ?? null;
    return {
      images,
      eachCents: priceFor(imageCostCents(imageModel(), IMAGE_SIZE)),
      brand: {
        name: saved.kit.name,
        accent: kit?.colors[0]?.hex ?? null,
        headingFont: kit?.headingFont ?? "",
        logoUrl: logo ? await ctx.storage.getUrl(logo.storageId as Id<"_storage">) : null,
      },
    };
  },
});

/** What the action needs to make one image: the prompt, built here from the creative and the brand kit only. */
export const forMake = internalQuery({
  args: { imageId: v.id("creativeImages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.imageId);
    if (!row || row.status !== "generating" || !isPlacement(row.placement)) return null;
    const asset = await ctx.db.get(row.assetId);
    if (!asset || asset.workspaceId !== row.workspaceId) return null;
    const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
    const variation = saved?.creative?.variations.find((item) => item.key === row.variationKey);
    if (!saved || !variation) return null;
    const kit = await kitOf(ctx, row.workspaceId, saved);
    return {
      model: row.model,
      size: IMAGE_SIZE,
      aspect: PLACEMENT_ASPECT[row.placement],
      prompt: imagePrompt({ direction: variation.imageDirection, kit: kit ?? { imageStyle: "", colors: [], industry: "" }, placement: row.placement }),
    };
  },
});

/** Saves a delivered image and charges for it, or records why it failed and charges nothing. The hold is released either way. */
export const saveMade = internalMutation({
  args: { imageId: v.id("creativeImages"), storageId: v.optional(v.id("_storage")), costCents: v.number(), failCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row: Doc<"creativeImages"> | null = await ctx.db.get(args.imageId);
    if (!row) {
      if (args.storageId) await ctx.storage.delete(args.storageId);
      return null;
    }
    if (args.storageId) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.patch(row._id, { status: "ready", storageId: args.storageId, costCents: row.costCents + args.costCents, holdCents: 0, failCode: undefined });
      await chargeUsage(ctx, { workspaceId: row.workspaceId, costCents: args.costCents, source: "creative", ref: row._id });
    } else {
      // A retake that failed keeps the earlier picture.
      await ctx.db.patch(row._id, { status: row.storageId ? "ready" : "failed", holdCents: 0, failCode: args.failCode ?? "provider_error" });
    }
    return null;
  },
});
