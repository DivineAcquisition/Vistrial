/**
 * The Offers workspace: an offer card per offer the business sells, versioned as the owner refines it, and
 * the offer analysis read as structured data for the side-by-side and the test plan. Cards are the owner's
 * own words. An analysis may add a version only from what the business stated, never from a competitor.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { BASIS_LABEL } from "./lib/evidence";
import { savedRecord } from "./lib/savedRecords";
import { CHANNEL_WORDS } from "./skills/offerIntelligence/channels";
import { readAnalysis, type OfferAnalysis, type OfferContext } from "./skills/offerIntelligence/shapes";
import { MAX, NOT_STATED, OFFER_FIELDS, cleanOffer, compareOffers, sameOffer, type OfferContent, type OfferField } from "./lib/offerCards";

export { cleanOffer, compareOffers, OFFER_FIELDS, type OfferContent };

function contentOf(row: Pick<Doc<"offerCardVersions">, OfferField>): OfferContent {
  return { name: row.name, price: row.price, included: row.included, guarantee: row.guarantee, terms: row.terms, targetCustomer: row.targetCustomer };
}

async function ownCard(ctx: QueryCtx, workspaceId: Id<"workspaces">, cardId: Id<"offerCards">) {
  const card = await ctx.db.get(cardId);
  if (!card || card.workspaceId !== workspaceId) notFound();
  return card;
}

async function versionsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, cardId: Id<"offerCards">) {
  return ctx.db
    .query("offerCardVersions")
    .withIndex("by_workspace_card", (q) => q.eq("workspaceId", workspaceId).eq("cardId", cardId))
    .take(100);
}

function versionView(row: Doc<"offerCardVersions">) {
  return { version: row.version, ...contentOf(row), origin: row.origin, assetId: row.assetId ?? null, note: row.note ?? null, createdAt: row.createdAt };
}

/** Every offer card, newest first, each with its current version. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const cards = await ctx.db
      .query("offerCards")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const out = [];
    for (const card of cards) {
      if (card.archived) continue;
      const versions = await versionsOf(ctx, ctx.workspaceId, card._id);
      const current = versions.find((row) => row.version === card.currentVersion);
      if (!current) continue;
      out.push({ id: card._id, versions: versions.length, updatedAt: card.updatedAt, current: versionView(current) });
    }
    return out;
  },
});

/** One card with every version, oldest first. */
export const get = workspaceQuery({
  args: { cardId: v.id("offerCards") },
  handler: async (ctx, args) => {
    const card = await ownCard(ctx, ctx.workspaceId, args.cardId);
    const versions = (await versionsOf(ctx, ctx.workspaceId, card._id)).sort((a, b) => a.version - b.version);
    return { id: card._id, currentVersion: card.currentVersion, versions: versions.map(versionView) };
  },
});

/** Two versions of one card side by side, with what changed. */
export const compare = workspaceQuery({
  args: { cardId: v.id("offerCards"), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const card = await ownCard(ctx, ctx.workspaceId, args.cardId);
    const versions = await versionsOf(ctx, ctx.workspaceId, card._id);
    const before = versions.find((row) => row.version === args.from);
    const after = versions.find((row) => row.version === args.to);
    if (!before || !after) notFound();
    return { from: versionView(before), to: versionView(after), changes: compareOffers(contentOf(before), contentOf(after)) };
  },
});

const contentArgs = {
  name: v.string(),
  price: v.string(),
  included: v.array(v.string()),
  guarantee: v.string(),
  terms: v.string(),
  targetCustomer: v.string(),
};

/**
 * Saves the card as a new version (or a new card without `cardId`). Nothing is overwritten. Saving the same
 * content again adds nothing. Owners and Managers.
 */
export const saveVersion = workspaceMutation({
  args: { cardId: v.optional(v.id("offerCards")), ...contentArgs, origin: v.optional(v.union(v.literal("person"), v.literal("chat"))), note: v.optional(v.string()) },
  handler: async (ctx, { cardId, origin, note, ...input }) => {
    if (ctx.member.role === "rep") notAllowed();
    const content = cleanOffer(input);
    if (!content.name) throw userError("Give the offer a name.");
    const now = Date.now();
    if (cardId) {
      const card = await ownCard(ctx, ctx.workspaceId, cardId);
      const versions = await versionsOf(ctx, ctx.workspaceId, card._id);
      const current = versions.find((row) => row.version === card.currentVersion);
      if (current && sameOffer(contentOf(current), content)) return { cardId: card._id, version: card.currentVersion, added: false };
      const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
      await ctx.db.insert("offerCardVersions", {
        workspaceId: ctx.workspaceId,
        cardId: card._id,
        version,
        ...content,
        origin: origin ?? "person",
        ...(note?.trim() ? { note: note.trim().slice(0, MAX.note) } : {}),
        createdBy: ctx.identity.subject,
        createdAt: now,
      });
      await ctx.db.patch(card._id, { name: content.name, currentVersion: version, updatedAt: now });
      await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "offer.version", subject: card._id, count: version });
      return { cardId: card._id, version, added: true };
    }
    const id = await ctx.db.insert("offerCards", { workspaceId: ctx.workspaceId, name: content.name, currentVersion: 1, createdBy: ctx.identity.subject, createdAt: now, updatedAt: now });
    await ctx.db.insert("offerCardVersions", {
      workspaceId: ctx.workspaceId,
      cardId: id,
      version: 1,
      ...content,
      origin: origin ?? "person",
      ...(note?.trim() ? { note: note.trim().slice(0, MAX.note) } : {}),
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "offer.created", subject: id });
    return { cardId: id, version: 1, added: true };
  },
});

/** Puts a card away. Its versions are kept. Owners and Managers. */
export const archive = workspaceMutation({
  args: { cardId: v.id("offerCards") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const card = await ownCard(ctx, ctx.workspaceId, args.cardId);
    await ctx.db.patch(card._id, { archived: true, updatedAt: Date.now() });
    return null;
  },
});

// ---------- The offer analysis, read as data ----------

type AnalysisRecord = { analysis: unknown };

/** An offer analysis asset's structured answer and the context its run read. */
export async function analysisFor(ctx: QueryCtx, asset: Doc<"assets">): Promise<{ analysis: OfferAnalysis; context: OfferContext | null } | null> {
  if (asset.kind !== "offerAnalysis") return null;
  const saved = (await savedRecord(ctx.db, asset, "analysis")) as AnalysisRecord | null;
  const analysis = readAnalysis(saved?.analysis);
  if (!analysis) return null;
  const context = (await savedRecord(ctx.db, asset, "context")) as OfferContext | null;
  return { analysis, context };
}

/** Words that mark a competitor field as present. Blank, "Not stated" and "none" are not. */
function stated(value: string) {
  return Boolean(value.trim()) && !NOT_STATED.test(value.trim()) && !/^(none|n\/a|-)$/i.test(value.trim());
}

/**
 * One offer analysis as the Offers tab draws it: the business's offer, each competitor offer beside it
 * with the cited sources, which fields show a gap (a competitor states something this offer does not),
 * the gaps and risks, and the test plan.
 */
export const analysis = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    const read = await analysisFor(ctx, asset);
    if (!read) return null;
    const { analysis: row, context } = read;
    const sources = new Map((context?.researchSources ?? []).map((source) => [source.id, source]));
    const ours = row.currentOffer;
    return {
      assetId: asset._id,
      title: asset.title,
      status: asset.status,
      createdAt: asset.createdAt,
      summary: row.summary,
      position: row.offerPosition.text,
      ours: { product: ours.product, price: ours.price, guarantee: ours.guarantee, terms: ours.terms, basis: ours.basis },
      competitors: row.competitorOffers.map((offer) => ({
        competitor: offer.competitor,
        offer: offer.offer,
        price: offer.price,
        guarantee: offer.guarantee,
        basisLabel: offer.basis ? BASIS_LABEL[offer.basis] : null,
        sources: offer.sourceRefIds
          .map((id) => sources.get(id))
          .filter((source) => source !== undefined)
          .map((source) => ({ id: source.id, title: source.title, url: source.url, platform: source.platform })),
        // A gap: the competitor states it and this offer does not.
        gaps: {
          price: stated(offer.price) && !stated(ours.price),
          guarantee: stated(offer.guarantee) && !stated(ours.guarantee),
        },
      })),
      gapsAndRisks: row.gapsAndRisks.map((gap) => ({ kind: gap.kind, statement: gap.statement, basisLabel: gap.basis ? BASIS_LABEL[gap.basis] : null })),
      changes: row.changes.map((change, index) => ({
        index,
        title: change.title,
        proposedChange: change.proposedChange,
        validationMethod: change.validationMethod,
        evidence: change.evidence.text,
        basisLabel: change.evidence.basis ? BASIS_LABEL[change.evidence.basis] : null,
        channel: change.channel ? CHANNEL_WORDS[change.channel] : null,
        newChannel: change.newChannel,
        metric: change.metric,
      })),
      limits: row.limits,
      reports: (context?.reports ?? []).map((report) => ({ title: report.title, version: report.version })),
    };
  },
});

/**
 * Adds the offer the analysis read from the business's own words to a card, as a new version (or a new
 * card). Only what the business stated: never a competitor's offer. Owners and Managers.
 */
export const fromAnalysis = workspaceMutation({
  args: { assetId: v.id("assets"), cardId: v.optional(v.id("offerCards")) },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    const read = await analysisFor(ctx, asset);
    if (!read) notFound();
    const offer = read.analysis.currentOffer;
    if (offer.basis === "insufficient") throw userError("This analysis had too little on record about your offer to fill a card.");
    const audience = read.context?.profile?.audience ?? "";
    const content = cleanOffer({ name: offer.product, price: offer.price, included: [], guarantee: offer.guarantee, terms: offer.terms, targetCustomer: audience });
    if (!content.name) throw userError("This analysis does not name your offer.");
    const now = Date.now();
    let cardId = args.cardId ?? null;
    let version = 1;
    if (cardId) {
      const card = await ownCard(ctx, ctx.workspaceId, cardId);
      const versions = await versionsOf(ctx, ctx.workspaceId, card._id);
      const current = versions.find((row) => row.version === card.currentVersion);
      // Keeps what only the owner wrote (what's included) when the analysis says nothing about it.
      if (current && content.included.length === 0) content.included = current.included;
      if (current && sameOffer(contentOf(current), content)) return { cardId: card._id, version: card.currentVersion, added: false };
      version = Math.max(0, ...versions.map((row) => row.version)) + 1;
      await ctx.db.patch(card._id, { name: content.name, currentVersion: version, updatedAt: now });
    } else {
      cardId = await ctx.db.insert("offerCards", { workspaceId: ctx.workspaceId, name: content.name, currentVersion: 1, createdBy: ctx.identity.subject, createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("offerCardVersions", {
      workspaceId: ctx.workspaceId,
      cardId,
      version,
      ...content,
      origin: "analysis",
      assetId: asset._id,
      note: "From the offer analysis: what you stated.",
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    return { cardId, version, added: true };
  },
});
