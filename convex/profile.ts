import { v } from "convex/values";

import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound } from "./lib/errors";

const competitor = v.object({ name: v.string(), url: v.string() });

function assertEditor(role: string) {
  if (role === "rep") notAllowed();
}

function cleanCompetitors(rows: { name: string; url: string }[]) {
  return rows.map((row) => {
    const name = row.name.trim();
    const url = row.url.trim();
    if (!name || !url.startsWith("https://")) throw new Error("Each competitor needs a name and an https URL.");
    return { name, url };
  });
}

export const get = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(20);
    const ordered = [...rows].sort((a, b) => b.version - a.version);
    const draft = ordered.find((row) => row.status === "draft") ?? null;
    const confirmed = ordered.find((row) => row.status === "confirmed") ?? null;
    const examples = draft
      ? await ctx.db
          .query("profileExamples")
          .withIndex("by_workspace_version", (q) => q.eq("workspaceId", ctx.workspaceId).eq("version", draft.version))
          .take(20)
      : [];
    return {
      draft: draft && {
        version: draft.version,
        offer: draft.offer,
        priceNotes: draft.priceNotes,
        audience: draft.audience,
        geography: draft.geography,
        channels: draft.channels,
        brandVoice: draft.brandVoice,
        competitors: draft.competitors,
        status: draft.status,
      },
      confirmed: confirmed && {
        version: confirmed.version,
        offer: confirmed.offer,
        priceNotes: confirmed.priceNotes,
        audience: confirmed.audience,
        geography: confirmed.geography,
        channels: confirmed.channels,
        brandVoice: confirmed.brandVoice,
        competitors: confirmed.competitors,
        status: confirmed.status,
      },
      versions: ordered.map((row) => ({ version: row.version, status: row.status })),
      examples: examples.map((row) => ({ id: row._id, kind: row.kind, text: row.text ?? "", hasFile: Boolean(row.storageId) })),
    };
  },
});

export const saveDraft = workspaceMutation({
  args: {
    offer: v.string(),
    priceNotes: v.string(),
    audience: v.string(),
    geography: v.string(),
    channels: v.string(),
    brandVoice: v.string(),
    competitors: v.array(competitor),
  },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const competitors = cleanCompetitors(args.competitors);
    const rows = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(20);
    const draft = rows.filter((row) => row.status === "draft").sort((a, b) => b.version - a.version)[0];
    const fields = {
      offer: args.offer.trim(),
      priceNotes: args.priceNotes.trim(),
      audience: args.audience.trim(),
      geography: args.geography.trim(),
      channels: args.channels.trim(),
      brandVoice: args.brandVoice.trim(),
      competitors,
    };
    if (draft) {
      await ctx.db.patch(draft._id, fields);
      await writeAudit(ctx, {
        workspaceId: ctx.workspaceId,
        actorType: "user",
        actorId: ctx.identity.subject,
        action: "profile.draft_saved",
        subject: draft._id,
        count: draft.version,
      });
      return draft.version;
    }
    const version = rows.reduce((max, row) => Math.max(max, row.version), 0) + 1;
    const id = await ctx.db.insert("profileVersions", {
      workspaceId: ctx.workspaceId,
      version,
      ...fields,
      status: "draft",
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "profile.draft_saved",
      subject: id,
      count: version,
    });
    return version;
  },
});

export const confirm = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    assertEditor(ctx.member.role);
    const rows = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "draft"))
      .take(5);
    const draft = rows.sort((a, b) => b.version - a.version)[0];
    if (!draft) notFound();
    if (!draft.offer.trim() || !draft.audience.trim()) throw new Error("Add the offer and the audience first.");
    await ctx.db.patch(draft._id, {
      status: "confirmed",
      confirmedBy: ctx.identity.subject,
      confirmedAt: Date.now(),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "profile.confirmed",
      subject: draft._id,
      count: draft.version,
    });
    return draft.version;
  },
});

export const createUpload = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    assertEditor(ctx.member.role);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addExample = workspaceMutation({
  args: {
    version: v.number(),
    kind: v.union(v.literal("voiceExample"), v.literal("pastAd"), v.literal("other")),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const rows = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", ctx.workspaceId).eq("version", args.version))
      .take(1);
    const profile = rows[0];
    if (!profile || profile.status !== "draft") notFound();
    if (!args.text?.trim() && !args.storageId) throw new Error("Add text or a file.");
    const id = await ctx.db.insert("profileExamples", {
      workspaceId: ctx.workspaceId,
      version: args.version,
      kind: args.kind,
      text: args.text?.trim(),
      storageId: args.storageId,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "profile.example_added",
      subject: id,
      count: args.version,
    });
    return id;
  },
});

export const finishSetup = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role !== "owner") notAllowed();
    const confirmed = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
      .take(5);
    if (confirmed.length === 0) throw new Error("Confirm the business profile first.");
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
