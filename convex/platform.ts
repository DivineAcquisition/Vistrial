import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { staffMutation, staffQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, userError } from "./lib/errors";
import { PRICES, isProvider, isWorkKind } from "./lib/modelRouter";

const OPEN = ["queued", "running", "waiting"] as const;

export const get = staffQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    return { halted: row?.halted === true };
  },
});

export const setHalt = staffMutation({
  args: { halted: v.boolean() },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    if (current) await ctx.db.patch(current._id, { halted: args.halted });
    else await ctx.db.insert("platformControls", { key: "platform", halted: args.halted });
    if (args.halted) {
      for (const status of OPEN) {
        const rows = await ctx.db
          .query("agentRuns")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(50);
        for (const run of rows) {
          await ctx.db.patch(run._id, { status: "stopped", stopReason: "cancelled", finishedAt: Date.now() });
          await writeAudit(ctx, {
            workspaceId: run.workspaceId,
            actorType: "staff",
            actorId: ctx.identity.subject,
            action: "run.finished",
            subject: run._id,
            count: run.costCents,
          });
        }
      }
    }
    await writeAudit(ctx, {
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: args.halted ? "platform.halted" : "platform.resumed",
      subject: "platform",
      count: args.halted ? 1 : 0,
    });
    return null;
  },
});

export const setRoute = staffMutation({
  args: {
    workKind: v.string(),
    provider: v.string(),
    model: v.string(),
    fallbackProvider: v.string(),
    fallbackModel: v.string(),
  },
  handler: async (ctx, args) => {
    if (ctx.staff.role !== "platform_admin") notAllowed();
    if (!isWorkKind(args.workKind)) throw userError("Unknown kind of work.");
    if (!isProvider(args.provider) || !isProvider(args.fallbackProvider)) throw userError("Unknown provider.");
    // A model with no price cannot run, so a route is never pointed at one. The fake provider is for tests.
    for (const [provider, model] of [[args.provider, args.model], [args.fallbackProvider, args.fallbackModel]]) {
      if (provider !== "fake" && !PRICES[model]) throw userError(`The model "${model.slice(0, 80)}" has no price set, so it cannot run.`);
      if (provider === "openrouter" && !model.includes("/")) throw userError("An OpenRouter model is written company/model, for example openai/gpt-6.1-sol.");
      if (provider === "claude" && !model.startsWith("claude-")) throw userError("The claude provider runs Anthropic's own model ids, for example claude-opus-5-5.");
    }
    const current = await ctx.db
      .query("modelRoutes")
      .withIndex("by_workKind", (q) => q.eq("workKind", args.workKind))
      .unique();
    if (current) {
      await ctx.db.patch(current._id, {
        provider: args.provider,
        model: args.model,
        fallbackProvider: args.fallbackProvider,
        fallbackModel: args.fallbackModel,
      });
    } else {
      await ctx.db.insert("modelRoutes", args);
    }
    await writeAudit(ctx, {
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: "route.updated",
      subject: args.workKind,
      count: 1,
    });
    return null;
  },
});

/**
 * The launch routes (decision D2): Opus 5.5 for research and writing, Sonnet 5.5 for the brief and
 * classification, each falling back to the other. Run once from the Convex dashboard (Functions, then
 * platform:ensureDefaultRoutes, then Run). It fills only the kinds of work that have no route, so a route a
 * Platform Admin has set is never changed. Internal, so no client can call it.
 */
export const DEFAULT_ROUTES = [
  { workKind: "research", provider: "claude", model: "claude-opus-5-5", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" },
  { workKind: "write", provider: "claude", model: "claude-opus-5-5", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" },
  { workKind: "classify", provider: "claude", model: "claude-sonnet-5-5", fallbackProvider: "claude", fallbackModel: "claude-opus-5-5" },
  { workKind: "summarize", provider: "claude", model: "claude-sonnet-5-5", fallbackProvider: "claude", fallbackModel: "claude-opus-5-5" },
] as const;

export const ensureDefaultRoutes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const added: string[] = [];
    for (const route of DEFAULT_ROUTES) {
      const current = await ctx.db
        .query("modelRoutes")
        .withIndex("by_workKind", (q) => q.eq("workKind", route.workKind))
        .unique();
      if (current) continue;
      await ctx.db.insert("modelRoutes", { ...route });
      added.push(route.workKind);
    }
    if (added.length > 0) {
      await writeAudit(ctx, { actorType: "system", actorId: "system", action: "route.defaults", subject: added.join(","), count: added.length });
    }
    return { added, kept: DEFAULT_ROUTES.map((row) => row.workKind).filter((kind) => !added.includes(kind)) };
  },
});
