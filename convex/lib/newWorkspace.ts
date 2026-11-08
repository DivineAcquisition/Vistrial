import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { writeAudit } from "./audit";
import { ensureAgents } from "./agents";
import { seedSpine } from "./seedSpine";
import { slugFromName } from "./token";

/** Creates a workspace with its owner, settings, pipeline and agent links (all off). */
export async function createWorkspaceFor(
  ctx: MutationCtx,
  input: { userId: string; displayName: string; name: string; timezone?: string; defaultCountry?: string },
): Promise<Id<"workspaces">> {
  await ensureAgents(ctx);
  const workspaceId = await ctx.db.insert("workspaces", {
    name: input.name,
    slug: slugFromName(input.name),
    timezone: input.timezone?.trim() || "America/New_York",
    status: "active",
    createdAt: Date.now(),
  });
  const memberId = await ctx.db.insert("members", {
    workspaceId,
    userId: input.userId,
    role: "owner",
    displayName: input.displayName,
    active: true,
  });
  await ctx.db.insert("workspaceSettings", {
    workspaceId,
    setupDone: false,
    themeDefault: "light",
    defaultCountry: input.defaultCountry ?? "US",
  });
  await seedSpine(ctx, workspaceId);
  const agents = await ctx.db.query("agents").withIndex("by_sort").take(50);
  for (const agent of agents) {
    if (agent.retired) continue;
    await ctx.db.insert("workspaceAgents", {
      workspaceId,
      agentId: agent._id,
      state: "off",
      updatedAt: Date.now(),
      updatedBy: input.userId,
    });
  }
  await writeAudit(ctx, {
    workspaceId,
    actorType: "user",
    actorId: input.userId,
    action: "workspace.created",
    subject: memberId,
  });
  return workspaceId;
}
