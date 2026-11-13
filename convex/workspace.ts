import { v } from "convex/values";

import { currentAgentSlug } from "./catalog";
import type { Id } from "./_generated/dataModel";
import { signedInMutation, signedInQuery, workspaceQuery, adminMutation } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { activeMembership } from "./lib/access";
import { notAllowed, notFound, userError } from "./lib/errors";
import { upsertAccountMember, upsertMember } from "./lib/organizations";
import { ROLE_ORDER, grantableRoleValidator, isAdmin, roleOf } from "./lib/roles";
import { ensureAgents } from "./lib/agents";
import { hashToken, randomToken } from "./lib/token";
import { createWorkspaceFor } from "./lib/newWorkspace";

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GRANTS = 25;

/** The role an invite or a role change may give, in the new words. Never Owner. */
function grantable(role: string): "admin" | "member" | "viewer" {
  const next = roleOf(role);
  return next === "owner" ? "admin" : next;
}

export const syncCatalog = signedInMutation({
  args: {},
  handler: async (ctx) => {
    await ensureAgents(ctx);
    return null;
  },
});

export const mine = signedInQuery({
  args: {},
  handler: async (ctx) => {
    const member = await activeMembership(ctx, ctx.userId);
    if (!member) return null;
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .unique();
    return {
      workspaceId: member.workspaceId,
      role: roleOf(member.role),
      setupDone: settings?.setupDone ?? false,
    };
  },
});

export const create = signedInMutation({
  args: { name: v.string(), timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (await activeMembership(ctx, ctx.userId)) throw userError("You already belong to an organization.");
    const name = args.name.trim();
    if (!name) throw userError("Name the organization.");
    const workspaceId = await createWorkspaceFor(ctx, { userId: ctx.userId, displayName: ctx.name, email: ctx.email || undefined, name, timezone: args.timezone });
    return workspaceId;
  },
});

export const shell = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const departments = await ctx.db.query("departments").withIndex("by_sort").take(20);
    const agents = await ctx.db.query("agents").withIndex("by_sort").take(50);
    const skills = await ctx.db.query("skills").withIndex("by_sort").take(100);
    const links = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(50);
    const stateByAgent = new Map(links.map((link) => [link.agentId, link.state]));
    const skillsByAgent = new Map<string, typeof skills>();
    for (const skill of skills) {
      const list = skillsByAgent.get(skill.agentSlug) ?? [];
      list.push(skill);
      skillsByAgent.set(skill.agentSlug, list);
    }
    return {
      role: ctx.role,
      setupDone: settings?.setupDone ?? false,
      departments: departments
        .map((row) => ({ slug: row.slug, name: row.name, sort: row.sort }))
        .sort((a, b) => a.sort - b.sort),
      agents: agents
        .filter((agent) => agent.retired !== true)
        .map((agent) => ({
          slug: agent.slug,
          name: agent.name,
          number: agent.number ?? null,
          department: agent.department ?? null,
          status: agent.status ?? ("planned" as const),
          lifecycle: agent.lifecycle ?? null,
          job: agent.job,
          promise: agent.promise,
          sort: agent.sort,
          skills: (skillsByAgent.get(agent.slug) ?? [])
            .sort((a, b) => a.sort - b.sort)
            .map((skill) => ({
              slug: skill.slug,
              name: skill.name,
              handsBack: skill.job,
              promise: skill.promise,
              status: skill.status,
              sort: skill.sort,
            })),
          state: stateByAgent.get(agent._id) ?? "off",
        }))
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    };
  },
});

export const markSetupDone = adminMutation({
  args: { setupDone: v.boolean() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!settings) notFound();
    await ctx.db.patch(settings._id, { setupDone: args.setupDone });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "settings.updated",
      subject: settings._id,
      count: args.setupDone ? 1 : 0,
    });
    return null;
  },
});

export const setAgentState = adminMutation({
  args: {
    slug: v.string(),
    state: v.union(v.literal("off"), v.literal("suggesting"), v.literal("on")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", currentAgentSlug(args.slug)))
      .unique();
    if (!agent || agent.retired === true) notFound();
    if (agent.status !== "live" && args.state !== "off") throw userError(`${agent.name} is not available yet.`);
    const link = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentId", agent._id))
      .unique();
    if (!link) {
      const created = await ctx.db.insert("workspaceAgents", {
        workspaceId: ctx.workspaceId,
        agentId: agent._id,
        state: args.state,
        updatedAt: Date.now(),
        updatedBy: ctx.identity.subject,
      });
      await writeAudit(ctx, {
        workspaceId: ctx.workspaceId,
        actorType: "user",
        actorId: ctx.identity.subject,
        action: "agent_state.updated",
        subject: created,
      });
      return null;
    }
    await ctx.db.patch(link._id, {
      state: args.state,
      updatedAt: Date.now(),
      updatedBy: ctx.identity.subject,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "agent_state.updated",
      subject: link._id,
    });
    return null;
  },
});

export const invite = adminMutation({
  args: {
    email: v.string(),
    /** The role in this organization. "manager" and "rep" are accepted from a tab opened before the roles changed. */
    role: grantableRoleValidator,
    /** Other organizations of the same account to open with the same invite, each with its own role. */
    grants: v.optional(v.array(v.object({ workspaceId: v.id("workspaces"), role: grantableRoleValidator }))),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw userError("Enter an email.");
    const here = await ctx.db.get(ctx.workspaceId);
    if (!here) notFound();
    const grants: { workspaceId: Id<"workspaces">; role: "admin" | "member" | "viewer" }[] = [{ workspaceId: ctx.workspaceId, role: grantable(args.role) }];
    for (const grant of args.grants ?? []) {
      if (grants.some((row) => row.workspaceId === grant.workspaceId)) continue;
      const other = await ctx.db.get(grant.workspaceId);
      // Another organization can only be added by someone who runs it too, and only inside the same account.
      const mine = other
        ? await ctx.db
            .query("members")
            .withIndex("by_workspace_user", (q) => q.eq("workspaceId", other._id).eq("userId", ctx.identity.subject))
            .unique()
        : null;
      if (!other || other.status !== "active" || !mine?.active) notFound();
      if (!here.accountId || other.accountId !== here.accountId) notFound();
      if (!isAdmin(mine.role)) notAllowed();
      grants.push({ workspaceId: other._id, role: grantable(grant.role) });
    }
    if (grants.length > MAX_GRANTS) throw userError(`An invite can open ${MAX_GRANTS} organizations at most.`);
    const token = randomToken();
    const invitationId = await ctx.db.insert("invitations", {
      workspaceId: ctx.workspaceId,
      email,
      role: grants[0].role,
      tokenHash: await hashToken(token),
      expiresAt: Date.now() + INVITE_MS,
      invitedBy: ctx.identity.subject,
      ...(here.accountId ? { accountId: here.accountId } : {}),
      grants,
    });
    for (const grant of grants) {
      await writeAudit(ctx, {
        workspaceId: grant.workspaceId,
        actorType: "user",
        actorId: ctx.identity.subject,
        action: "invite.created",
        subject: invitationId,
        count: ROLE_ORDER[grant.role],
      });
    }
    return { invitationId, token };
  },
});

export const acceptInvite = signedInMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);
    const inviteRow = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!inviteRow) notFound();
    if (inviteRow.acceptedAt !== undefined) throw userError("This invite has already been used.");
    if (inviteRow.canceledAt !== undefined) throw userError("This invite was cancelled. Ask the owner for a new one.");
    if (inviteRow.expiresAt <= Date.now()) throw userError("This invite has expired.");
    if (!ctx.email || ctx.email !== inviteRow.email) throw userError("This invite is for a different email.");
    // An invite made before a person could be given several organizations opens the one it names.
    const grants = inviteRow.grants ?? [{ workspaceId: inviteRow.workspaceId, role: inviteRow.role }];
    let first: Id<"members"> | null = null;
    for (const grant of grants) {
      const workspace = await ctx.db.get(grant.workspaceId);
      // An organization archived since the invite was sent is skipped; the rest still open.
      if (!workspace || workspace.status !== "active") continue;
      // Someone removed earlier and invited back keeps one row, so an organization never has two for them.
      const memberId = await upsertMember(ctx, { workspaceId: workspace._id, userId: ctx.userId, role: grantable(grant.role), displayName: ctx.name, email: ctx.email });
      if (workspace.accountId) {
        await upsertAccountMember(ctx, { accountId: workspace.accountId, userId: ctx.userId, role: "member", displayName: ctx.name, email: ctx.email });
      }
      await writeAudit(ctx, { workspaceId: workspace._id, actorType: "user", actorId: ctx.userId, action: "invite.accepted", subject: memberId });
      first ??= memberId;
    }
    if (!first) throw userError("This invite no longer opens anything. Ask for a new one.");
    await ctx.db.patch(inviteRow._id, { acceptedAt: Date.now() });
    return first;
  },
});
