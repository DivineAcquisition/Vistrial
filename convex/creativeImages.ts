/**
 * Images for an approved or waiting ad set: the price before anything is spent, the batch a person confirms,
 * and the images themselves. Each image is charged only once it is delivered, and its price is held from the
 * balance while it is being made, so two batches cannot spend the same credit.
 */

import { requireWork } from "./lib/roles";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { contentOf as kitContent } from "./brandKits";
import { writeAudit } from "./lib/audit";
import { OUT_OF_CREDITS, accountFor, billingOn, chargeUsage, markup, priceFor } from "./lib/billing";
import { PLACEMENTS, type Placement } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { CHECK_COST_CENTS, IMAGE_FAIL_WORDS, IMAGE_SIZE, DESIGN_STYLES, LOOKS, LOOK_WORDS, MAX_IMAGES_PER_BATCH, MAX_IMAGES_PER_DAY, PLACEMENT_ASPECT, designStyleWords, designedPrompt, imagePrompt, isDesignStyle, isLook, isPlacement, isTone, type DesignStyle, type Look, type Tone } from "./lib/creativeImages";
import { notFound, userError } from "./lib/errors";
import { designModel, imageModel } from "./lib/gemini";
import { platformRoute } from "./lib/modelChoice";
import { savedRecord } from "./lib/savedRecords";
import { EMPTY_DESIGN, EXAMPLE_NOTE, designText, exampleFigures, type CreativeRecord, type Variation } from "./skills/creativeProduction/shapes";
import { GPT_IMAGE_ASPECTS, GPT_IMAGE_MODEL, IMAGE_ADMIN_WORDS, IMAGE_MODELS, IMAGE_SETUP_WORDS, geminiImageCents, gptImageQuoteCents, gptImagesOpen, imageFamilyOf, imageMark, imageVia, type ImageFamily } from "./lib/imageModels";

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

const modelFor = (look: Look, family: ImageFamily = "gemini") => (family === "gpt" ? GPT_IMAGE_MODEL : look === "designed" ? designModel() : imageModel());

/**
 * What one image of a look costs us, in cents: the picture, plus reading a designed ad's words back. For
 * Gemini it is the list price (with OpenRouter's fee when made that way). GPT Image is priced by the token,
 * so this is the most it may cost: the quote a person confirms. The real cost, never more, is what is charged.
 */
function costOf(look: Look, family: ImageFamily = "gemini") {
  const picture = family === "gpt" ? gptImageQuoteCents() : geminiImageCents(modelFor(look), IMAGE_SIZE);
  if (picture === null) throw userError("GPT images are not available here yet. Choose another model.");
  return picture + (look === "designed" ? CHECK_COST_CENTS : 0);
}

/** What a batch would cost: the count, the price of each and the total, in cents of credit. For GPT these are the most it can cost. */
function priceOf(count: number, look: Look, family: ImageFamily = "gemini") {
  const each = priceFor(costOf(look, family));
  return { count, eachCents: each, totalCents: each * count, upTo: family === "gpt" };
}

/** The placements a family cannot make: GPT Image has no 4:5 shape. */
function placementsOff(family: ImageFamily): Placement[] {
  return family === "gpt" ? PLACEMENTS.filter((placement) => !GPT_IMAGE_ASPECTS.includes(PLACEMENT_ASPECT[placement])) : [];
}

/** The image families that can make images here. Only these are offered. */
function openFamilies(): ImageFamily[] {
  return [...(imageVia() ? (["gemini"] as const) : []), ...(gptImagesOpen() ? (["gpt"] as const) : [])];
}

type Member = { workspaceId: Id<"workspaces">; identity: { subject: string } };

function preferences(ctx: QueryCtx & Member) {
  return ctx.db
    .query("memberPreferences")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
    .unique();
}

/**
 * The family that makes this person's images: the one picked now (refused if it is not offered here), else
 * the one they last picked if it is still offered, else Gemini.
 */
async function familyFor(ctx: QueryCtx & Member, picked: string | undefined): Promise<ImageFamily> {
  const open = openFamilies();
  if (picked !== undefined) {
    if (picked !== "gemini" && picked !== "gpt") throw userError("That model is not one you can choose.");
    if (picked === "gpt" && !open.includes("gpt")) throw userError("GPT images are not available here yet. Choose another model.");
    return picked;
  }
  const last = (await preferences(ctx))?.models?.image;
  return last === "gpt" && open.includes("gpt") ? "gpt" : "gemini";
}

async function rememberFamily(ctx: MutationCtx & Member, family: ImageFamily) {
  const row = await preferences(ctx);
  if (row?.models?.image === family) return;
  const models = { ...row?.models, image: family };
  if (row) await ctx.db.patch(row._id, { models, updatedAt: Date.now() });
  else await ctx.db.insert("memberPreferences", { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, models, updatedAt: Date.now() });
}

function lookOf(raw: string | undefined): Look {
  const look = raw ?? "designed";
  if (!isLook(look)) throw userError("Choose a designed ad or a photo with text on top.");
  return look;
}

/** A Platform Admin is told the exact setting that is missing; everyone else is told what they can do. */
async function isPlatformAdmin(ctx: QueryCtx & { identity: { subject: string } }) {
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_user", (q) => q.eq("userId", ctx.identity.subject))
    .unique();
  return staff?.role === "platform_admin";
}

/** What a person choosing GPT Image is told about where the request goes. The privacy policy says the same. */
const GPT_IMAGE_NOTICE = "GPT images are made by OpenAI, reached through OpenRouter. Unlike the other models here, OpenAI is not on a no-retention agreement for image requests: it may keep the request for a time. The price is an upper limit: you are charged what each image really cost, never more.";

/**
 * The image model switch: only the families that can make images here, each with the model this look uses.
 * Claude does not make images, so it is not listed.
 */
function imageSwitch(look: Look, family: ImageFamily) {
  const open = openFamilies();
  const gemini = priceFor(costOf(look));
  const options = open.map((row) => {
    const each = priceFor(costOf(look, row));
    return {
      id: row,
      family: row,
      familyName: row === "gpt" ? "GPT" : "Gemini",
      name: IMAGE_MODELS[modelFor(look, row)]?.name ?? (row === "gpt" ? "GPT Image" : "Gemini"),
      cost: row === "gemini" || !open.includes("gemini") || each === gemini ? null : each > gemini ? "Usually costs more" : "Usually costs less",
    };
  });
  return { value: open.includes(family) ? family : null, options };
}

/** A variation saved before designs existed has none: it is read as blank, and a designed ad uses its headline and button alone. */
function designOf(variation: Variation) {
  return variation.design ?? EMPTY_DESIGN;
}

/**
 * The price of making images for an ad set, before anything is spent: one image per variation per placement.
 * Also says whether the balance covers it once credit held for images in progress is set aside.
 */
export const quote = workspaceQuery({
  args: { assetId: v.id("assets"), placements: v.array(v.string()), look: v.optional(v.string()), model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { asset, saved, creative } = await adSet(ctx, ctx.workspaceId, args.assetId);
    const look = lookOf(args.look);
    // A model picked that has since been closed reads as the default here: a price is still shown.
    const family = await familyFor(ctx, args.model === "gpt" && !gptImagesOpen() ? undefined : args.model);
    const off = placementsOff(family);
    // A placement this model cannot make is left out of the price, and the screen shows it as unavailable.
    const placements = cleanPlacements(args.placements).filter((placement) => !off.includes(placement));
    const kit = await kitOf(ctx, ctx.workspaceId, saved);
    const price = priceOf(creative.variations.length * placements.length, look, family);
    const account = billingOn() ? await accountFor(ctx, ctx.workspaceId) : null;
    const available = account ? account.balanceCents - (await heldCents(ctx, ctx.workspaceId)) : null;
    const admin = await isPlatformAdmin(ctx);
    return {
      ...price,
      /** Whether images can be made here at all. When not, the screen shows these words in place of the button, and nothing can be started. */
      setup: imageVia() ? null : { words: admin ? IMAGE_SETUP_WORDS.admin : IMAGE_SETUP_WORDS.everyone, admin },
      /** The image model switch: the families that can make images here, and the one these would be made with. */
      models: imageSwitch(look, family),
      /** Placements the chosen model cannot make. They are not in the price. */
      placementsOff: off,
      /** What to tell the person about the chosen model, or null. */
      notice: family === "gpt" ? GPT_IMAGE_NOTICE : null,
      variations: creative.variations.length,
      placements,
      look,
      /** Each look with what one image of it costs, so the choice shows its price. */
      looks: LOOKS.map((row) => ({ value: row, ...LOOK_WORDS[row], eachCents: priceFor(costOf(row, family)) })),
      /** How many of the brand's own ads the kit holds as pictures of its look. A designed ad follows them. */
      styleRefs: kit?.styleRefs.length ?? 0,
      /** Where a designed ad's look comes from: the brand's past ads (or the standard layout), or a new design. */
      styles: DESIGN_STYLES.map((row) => ({ value: row, ...designStyleWords(row, kit?.styleRefsOwned ? kit.styleRefs.length : 0) })),
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
 * one. An image already made for the same variation and placement is replaced. Owners, Admins and Members.
 */
export const generate = workspaceMutation({
  args: {
    assetId: v.id("assets"),
    placements: v.array(v.string()),
    confirmedCents: v.number(),
    look: v.optional(v.string()),
    tone: v.optional(v.string()),
    style: v.optional(v.string()),
    /** The image family picked: "gemini" or "gpt". Missing means the one this person last picked, else Gemini. */
    model: v.optional(v.string()),
    only: v.optional(v.object({ variationKey: v.string(), placement: v.string() })),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const { asset, creative } = await adSet(ctx, ctx.workspaceId, args.assetId);
    // Checked before anything is held or started: with no key, no image is attempted and nothing is charged.
    if (!imageVia()) throw userError((await isPlatformAdmin(ctx)) ? IMAGE_SETUP_WORDS.admin : IMAGE_SETUP_WORDS.everyone);
    if (asset.status === "needsReview") throw userError("This ad set did not pass its checks. Fix it before spending on images.");
    if (asset.status === "rejected" || asset.status === "archived") throw userError("This ad set was rejected or put away.");
    const placements = cleanPlacements(args.only ? [args.only.placement] : args.placements);
    const variations = args.only ? creative.variations.filter((row) => row.key === args.only?.variationKey) : creative.variations;
    if (placements.length === 0 || variations.length === 0) throw userError("Choose at least one placement.");
    const existing = await imagesOf(ctx, ctx.workspaceId, asset._id);
    // One image made again keeps the look it had, unless a new one is asked for.
    const earlier = args.only ? existing.find((row) => row.variationKey === args.only?.variationKey && row.placement === args.only?.placement) : undefined;
    const look = lookOf(args.look ?? earlier?.look ?? (earlier ? "photo" : undefined));
    const tone: Tone = args.tone === undefined ? (earlier?.tone ?? "dark") : isTone(args.tone) ? args.tone : "dark";
    const style: DesignStyle = args.style === undefined ? (earlier?.style ?? "brand") : isDesignStyle(args.style) ? args.style : "brand";
    // One image made again keeps the model it had, unless another is picked. A pick is remembered for next time.
    const family = await familyFor(ctx, args.model ?? (earlier ? imageFamilyOf(earlier.model) : undefined));
    if (family === "gpt" && !gptImagesOpen()) throw userError("GPT images are not available here yet. Choose another model.");
    const off = placementsOff(family);
    const cannot = placements.filter((placement) => off.includes(placement));
    if (cannot.length > 0) throw userError(`${IMAGE_MODELS[GPT_IMAGE_MODEL].name} cannot make the ${cannot.join(" and ")} shape. Leave it out, or choose another model.`);
    if (args.model !== undefined && !args.only) await rememberFamily(ctx, family);
    const price = priceOf(variations.length * placements.length, look, family);
    if (args.confirmedCents !== price.totalCents) throw userError("The price changed. Check the new price and confirm again.");
    await assertRoom(ctx, ctx.workspaceId, price.count, price.totalCents);

    const model = modelFor(look, family);
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
          await ctx.db.patch(prior._id, { status: "generating", model, look, tone, style, holdCents: price.eachCents, failCode: undefined });
          imageId = prior._id;
        } else {
          imageId = await ctx.db.insert("creativeImages", { workspaceId: ctx.workspaceId, assetId: asset._id, variationKey: variation.key, placement, look, tone, style, status: "generating", model, costCents: 0, holdCents: price.eachCents, createdBy: ctx.identity.subject, createdAt: now });
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
    const admin = await isPlatformAdmin(ctx);
    const open = openFamilies();
    const retakeOf = (look: Look, family: ImageFamily) => {
      const use = open.includes(family) ? family : "gemini";
      return { cents: priceFor(costOf(look, use)), upTo: use === "gpt", model: use };
    };
    const failWords = (code: string) => (admin ? IMAGE_ADMIN_WORDS[code] : undefined) ?? IMAGE_FAIL_WORDS[code] ?? "This image could not be made.";
    for (const row of await imagesOf(ctx, ctx.workspaceId, asset._id)) {
      images.push({
        id: row._id,
        variationKey: row.variationKey,
        placement: row.placement,
        look: (row.look ?? "photo") as Look,
        status: row.status,
        /** The copy was edited after this designed ad was drawn, so its words are out of date. */
        stale: row.stale === true && row.status === "ready",
        url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
        problem: row.status === "failed" ? failWords(row.failCode ?? "") : null,
        /** The image model that made the picture shown. Null while the first one is being made, and when it failed. */
        model: row.storageId ? imageMark(row.model) : null,
        /** What making this one again would cost at most, with the model it was made with (or Gemini if that one is closed). */
        retake: retakeOf((row.look ?? "photo") as Look, imageFamilyOf(row.model)),
      });
    }
    const logo = kit?.logos.find((row) => row.variant === "light") ?? kit?.logos.find((row) => row.variant === "icon") ?? kit?.logos[0] ?? null;
    return {
      images,
      eachCents: { photo: priceFor(costOf("photo")), designed: priceFor(costOf("designed")) },
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
    const base = { model: row.model, size: IMAGE_SIZE, aspect: PLACEMENT_ASPECT[row.placement] };
    if ((row.look ?? "photo") !== "designed") {
      return { ...base, look: "photo" as const, prompt: imagePrompt({ direction: variation.imageDirection, kit: kit ?? { imageStyle: "", colors: [], industry: "" }, placement: row.placement }), expected: [] as string[], styleRefs: [] as Id<"_storage">[], checkRoute: null };
    }
    const design = designOf(variation);
    const fresh = row.style === "fresh";
    const refs = (kit?.styleRefsOwned && !fresh ? kit.styleRefs : []).map((ref) => ref.storageId as Id<"_storage">);
    const route = await platformRoute(ctx, "classify");
    return {
      ...base,
      look: "designed" as const,
      prompt: designedPrompt({
        text: { eyebrow: design.eyebrow, kicker: design.kicker, headline: variation.headline, accent: design.accent, visual: design.visual || variation.imageDirection, labels: design.labels, subline: design.subline, cta: variation.cta, ...(exampleFigures({ ...variation, design }) ? { note: EXAMPLE_NOTE } : {}) },
        kit: kit ?? { name: saved.kit.name, colors: [], headingFont: "", imageStyle: "", industry: "" },
        placement: row.placement,
        tone: row.tone ?? "dark",
        styleRefs: refs.length,
        style: fresh ? "fresh" : "brand",
        variant: Math.max(0, saved.creative?.variations.findIndex((item) => item.key === row.variationKey) ?? 0),
      }),
      /** Every line the picture must show. The action reads the picture back and compares. */
      expected: designText({ ...variation, design }),
      styleRefs: refs,
      checkRoute: route,
    };
  },
});

/** Saves a delivered image and charges for it, or records why it failed and charges nothing. The hold is released either way. */
export const saveMade = internalMutation({
  args: { imageId: v.id("creativeImages"), storageId: v.optional(v.id("_storage")), costCents: v.number(), failCode: v.optional(v.string()), provider: v.optional(v.string()), reportedCents: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const row: Doc<"creativeImages"> | null = await ctx.db.get(args.imageId);
    if (!row) {
      if (args.storageId) await ctx.storage.delete(args.storageId);
      return null;
    }
    if (args.storageId) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      // Never more than the price the person confirmed, which is what is held on the row. Whatever changed
      // between confirming and making (a setting, a key, what the image turned out to cost) is ours to bear.
      const costCents = row.holdCents > 0 && priceFor(args.costCents) > row.holdCents ? row.holdCents / markup() : args.costCents;
      await ctx.db.patch(row._id, { status: "ready", storageId: args.storageId, costCents: row.costCents + costCents, holdCents: 0, failCode: undefined, stale: undefined, ...(args.provider ? { provider: args.provider } : {}), ...(args.reportedCents !== undefined ? { reportedCents: args.reportedCents } : {}) });
      await chargeUsage(ctx, { workspaceId: row.workspaceId, costCents, source: "creative", ref: row._id });
    } else {
      // A retake that failed keeps the earlier picture.
      await ctx.db.patch(row._id, { status: row.storageId ? "ready" : "failed", holdCents: 0, failCode: args.failCode ?? "provider_error" });
    }
    return null;
  },
});
