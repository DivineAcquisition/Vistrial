/**
 * "Notify me when it's live" for planned agents. Each person's choice is kept per workspace, so the
 * launch can tell exactly who asked. Nothing is sent from here.
 */
import { v } from "convex/values";

import { CATALOG } from "./catalog";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { userError } from "./lib/errors";

function plannedSlug(slug: string) {
  const agent = CATALOG.find((row) => row.slug === slug);
  if (!agent || agent.status !== "planned") throw userError("Only planned agents have a waitlist.");
  return agent.slug;
}

export const mine = workspaceQuery({
  args: { agentSlug: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentWaitlist")
      .withIndex("by_workspace_agent_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", args.agentSlug).eq("userId", ctx.identity.subject))
      .unique();
    return { joined: Boolean(row) };
  },
});

export const toggle = workspaceMutation({
  args: { agentSlug: v.string() },
  handler: async (ctx, args) => {
    const agentSlug = plannedSlug(args.agentSlug);
    const row = await ctx.db
      .query("agentWaitlist")
      .withIndex("by_workspace_agent_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", agentSlug).eq("userId", ctx.identity.subject))
      .unique();
    if (row) {
      await ctx.db.delete(row._id);
      return { joined: false };
    }
    await ctx.db.insert("agentWaitlist", { workspaceId: ctx.workspaceId, agentSlug, userId: ctx.identity.subject, at: Date.now() });
    return { joined: true };
  },
});
