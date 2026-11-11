import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { writeAudit } from "./audit";
import { ensureAgents } from "./agents";
import { activeAccountOwners, upsertAccountMember } from "./organizations";
import { seedSpine } from "./seedSpine";
import { slugFromName } from "./token";

/**
 * Creates an organization (a workspace) with its settings, pipeline and agent links (all off).
 * Without `accountId` it is a person's first: an account is made for it and they own both. With one, it is
 * another organization of that account, and every Owner of the account is an Owner in it.
 */
export async function createWorkspaceFor(
  ctx: MutationCtx,
  input: {
    userId: string;
    displayName: string;
    name: string;
    timezone?: string;
    defaultCountry?: string;
    email?: string;
    accountId?: Id<"accounts">;
  },
): Promise<Id<"workspaces">> {
  await ensureAgents(ctx);
  const workspaceId = await ctx.db.insert("workspaces", {
    name: input.name,
    slug: slugFromName(input.name),
    timezone: input.timezone?.trim() || "America/New_York",
    status: "active",
    createdAt: Date.now(),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  });
  let accountId = input.accountId;
  if (!accountId) {
    // The first organization's id is the account's billing customer, as it is for every account made from
    // a workspace that existed before accounts did.
    accountId = await ctx.db.insert("accounts", {
      name: input.name,
      billingCustomerId: workspaceId,
      createdBy: input.userId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(workspaceId, { accountId });
    await upsertAccountMember(ctx, { accountId, userId: input.userId, role: "owner", displayName: input.displayName, email: input.email });
  }
  const owners = (await activeAccountOwners(ctx, accountId)).map((row) => ({ userId: row.userId, displayName: row.displayName, email: row.email }));
  if (!owners.some((row) => row.userId === input.userId)) owners.push({ userId: input.userId, displayName: input.displayName, email: input.email });
  let memberId: Id<"members"> | null = null;
  for (const owner of owners) {
    const id = await ctx.db.insert("members", {
      workspaceId,
      userId: owner.userId,
      role: "owner",
      displayName: owner.displayName,
      active: true,
      ...(owner.email ? { email: owner.email } : {}),
    });
    if (owner.userId === input.userId) memberId = id;
  }
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
    subject: memberId ?? workspaceId,
  });
  return workspaceId;
}
