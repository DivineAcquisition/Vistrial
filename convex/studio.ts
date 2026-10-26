import { v } from "convex/values";

import { CATALOG } from "./catalog";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound } from "./lib/errors";
import {
  LIBRARY_ACCEPTANCE,
  buildContentCalendar,
  buildCopySets,
  buildCreativeBrief,
  buildResearchReport,
  clipExcerpt,
  profileReady,
  type BusinessFacts,
} from "./lib/salesWork";

const emptyFacts = {
  offer: "",
  price: "",
  audience: "",
  voice: "",
  examples: "",
  pastAds: "",
  competitors: "",
};

function factsOf(row: BusinessFacts | null): BusinessFacts {
  return row ?? emptyFacts;
}

export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await ctx.db
      .query("businessProfiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const swipe = await ctx.db
      .query("swipeEntries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(50);
    const acceptance = await ctx.db
      .query("libraryAcceptances")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const waiting = await ctx.db
      .query("approvalAssets")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "waiting"))
      .take(50);
    return {
      profile: factsOf(profile),
      profileReady: profileReady(factsOf(profile)),
      swipe: swipe
        .map((row) => ({
          id: row._id,
          excerpt: row.excerpt,
          sourceName: row.sourceName,
        }))
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
      libraryAccepted: Boolean(acceptance),
      ownResultsConnected: false,
      waiting: waiting
        .map((row) => ({
          id: row._id,
          title: row.title,
          body: row.body,
          agentSlug: row.agentSlug,
          skillSlug: row.skillSlug,
          createdAt: row.createdAt,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const saveProfile = workspaceMutation({
  args: {
    offer: v.string(),
    price: v.string(),
    audience: v.string(),
    voice: v.string(),
    examples: v.string(),
    pastAds: v.string(),
    competitors: v.string(),
  },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const next = {
      offer: args.offer.trim(),
      price: args.price.trim(),
      audience: args.audience.trim(),
      voice: args.voice.trim(),
      examples: args.examples.trim(),
      pastAds: args.pastAds.trim(),
      competitors: args.competitors.trim(),
      updatedAt: Date.now(),
    };
    const current = await ctx.db
      .query("businessProfiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const id = current
      ? (await ctx.db.patch(current._id, next), current._id)
      : await ctx.db.insert("businessProfiles", { workspaceId: ctx.workspaceId, ...next });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "profile.updated",
      subject: id,
    });
    return null;
  },
});

export const addSwipe = workspaceMutation({
  args: { excerpt: v.string(), sourceName: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const excerpt = clipExcerpt(args.excerpt);
    const sourceName = args.sourceName.trim();
    if (!excerpt || !sourceName) throw new Error("An excerpt needs a source name.");
    const id = await ctx.db.insert("swipeEntries", {
      workspaceId: ctx.workspaceId,
      excerpt,
      sourceName,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "swipe.added",
      subject: id,
    });
    return null;
  },
});

export const acceptLibraryRisk = workspaceMutation({
  args: { statement: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role !== "owner") notAllowed();
    if (args.statement.trim() !== LIBRARY_ACCEPTANCE) {
      throw new Error("Type the acceptance line exactly. Collection stays off until then.");
    }
    const current = await ctx.db
      .query("libraryAcceptances")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (current) return null;
    const id = await ctx.db.insert("libraryAcceptances", {
      workspaceId: ctx.workspaceId,
      statement: LIBRARY_ACCEPTANCE,
      acceptedAt: Date.now(),
      acceptedBy: ctx.identity.subject,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "library.risk_accepted",
      subject: id,
    });
    return null;
  },
});

export const runSkill = workspaceMutation({
  args: { agentSlug: v.string(), skillSlug: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const agent = CATALOG.find((row) => row.slug === args.agentSlug);
    const skill = agent?.skills.find((row) => row.slug === args.skillSlug);
    if (!agent || !skill) notFound();
    if (agent.slug !== "sales") throw new Error("This skill is not built yet.");

    const profile = await ctx.db
      .query("businessProfiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const facts = factsOf(profile);
    const swipe = await ctx.db
      .query("swipeEntries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(50);
    const acceptance = await ctx.db
      .query("libraryAcceptances")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const asset =
      args.skillSlug === "ad-research"
        ? buildResearchReport({
            facts,
            swipe: swipe.map((row) => ({ excerpt: row.excerpt, sourceName: row.sourceName })),
            ownResultsConnected: false,
            libraryAccepted: Boolean(acceptance),
          })
        : args.skillSlug === "ad-copy"
          ? buildCopySets(facts)
          : args.skillSlug === "creative"
            ? buildCreativeBrief(facts)
            : args.skillSlug === "content"
              ? buildContentCalendar(facts)
              : null;
    if (!asset) notFound();
    const id = await ctx.db.insert("approvalAssets", {
      workspaceId: ctx.workspaceId,
      agentSlug: agent.slug,
      skillSlug: skill.slug,
      title: asset.title,
      body: asset.body,
      status: "waiting",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "asset.waiting",
      subject: id,
    });
    return id;
  },
});

export const decideAsset = workspaceMutation({
  args: {
    assetId: v.id("approvalAssets"),
    status: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (asset.status !== "waiting") throw new Error("That asset is no longer waiting.");
    await ctx.db.patch(asset._id, {
      status: args.status,
      decidedAt: Date.now(),
      decidedBy: ctx.identity.subject,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.status === "approved" ? "asset.approved" : "asset.declined",
      subject: asset._id,
    });
    return null;
  },
});

export const completeSetup = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role !== "owner") notAllowed();
    const profile = await ctx.db
      .query("businessProfiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!profileReady(factsOf(profile))) throw new Error("Add the offer and the audience first.");
    const sales = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", "sales"))
      .unique();
    if (!sales) notFound();
    const link = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentId", sales._id))
      .unique();
    if (!link || link.state === "off") throw new Error("Turn on the Sales Agent.");
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!settings) notFound();
    await ctx.db.patch(settings._id, { setupDone: true });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "settings.updated",
      subject: settings._id,
      count: 1,
    });
    return null;
  },
});
