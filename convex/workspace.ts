import { v } from "convex/values";

import { signedInMutation, signedInQuery, workspaceQuery, ownerMutation } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { activeMembership } from "./lib/access";
import { notFound } from "./lib/errors";
import { ensureAgents } from "./lib/agents";
import { hashToken, randomToken, slugFromName } from "./lib/token";
import { seedSpine } from "./lib/seedSpine";

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

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
      role: member.role,
      setupDone: settings?.setupDone ?? false,
    };
  },
});

export const create = signedInMutation({
  args: { name: v.string(), timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (await activeMembership(ctx, ctx.userId)) throw new Error("You already belong to a workspace.");
    const name = args.name.trim();
    if (!name) throw new Error("Name the workspace.");
    await ensureAgents(ctx);
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      slug: slugFromName(name),
      timezone: args.timezone?.trim() || "America/New_York",
      status: "active",
      createdAt: Date.now(),
    });
    const memberId = await ctx.db.insert("members", {
      workspaceId,
      userId: ctx.userId,
      role: "owner",
      displayName: ctx.name,
      active: true,
    });
    await ctx.db.insert("workspaceSettings", {
      workspaceId,
      setupDone: false,
      themeDefault: "light",
      defaultCountry: "US",
    });
    await seedSpine(ctx, workspaceId);
    const agents = await ctx.db.query("agents").withIndex("by_sort").take(50);
    for (const agent of agents) {
      await ctx.db.insert("workspaceAgents", {
        workspaceId,
        agentId: agent._id,
        state: "off",
        updatedAt: Date.now(),
        updatedBy: ctx.userId,
      });
    }
    await writeAudit(ctx, {
      workspaceId,
      actorType: "user",
      actorId: ctx.userId,
      action: "workspace.created",
      subject: memberId,
    });
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
    const agents = await ctx.db.query("agents").withIndex("by_sort").take(50);
    const links = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(50);
    const stateByAgent = new Map(links.map((link) => [link.agentId, link.state]));
    const skillRows = await ctx.db.query("skills").take(200);
    return {
      role: ctx.member.role,
      setupDone: settings?.setupDone ?? false,
      agents: agents
        .map((agent) => ({
          slug: agent.slug,
          name: agent.name,
          area: agent.area,
          job: agent.job,
          promise: agent.promise,
          sort: agent.sort,
          skills: skillRows
            .filter((skill) => skill.agentId === agent._id)
            .sort((a, b) => a.sort - b.sort)
            .map((skill) => ({ key: skill.key, name: skill.name, status: skill.status, sort: skill.sort })),
          state: stateByAgent.get(agent._id) ?? "off",
        }))
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    };
  },
});

export const markSetupDone = ownerMutation({
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

export const setAgentState = ownerMutation({
  args: {
    slug: v.string(),
    state: v.union(v.literal("off"), v.literal("suggesting"), v.literal("on")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!agent) notFound();
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

export const invite = ownerMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("rep")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter an email.");
    const token = randomToken();
    const invitationId = await ctx.db.insert("invitations", {
      workspaceId: ctx.workspaceId,
      email,
      role: args.role,
      tokenHash: await hashToken(token),
      expiresAt: Date.now() + INVITE_MS,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "invite.created",
      subject: invitationId,
    });
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
    if (inviteRow.acceptedAt !== undefined) throw new Error("This invite has already been used.");
    if (inviteRow.expiresAt <= Date.now()) throw new Error("This invite has expired.");
    if (!ctx.email || ctx.email !== inviteRow.email) throw new Error("This invite is for a different email.");
    if (await activeMembership(ctx, ctx.userId)) throw new Error("You already belong to a workspace.");
    const memberId = await ctx.db.insert("members", {
      workspaceId: inviteRow.workspaceId,
      userId: ctx.userId,
      role: inviteRow.role,
      displayName: ctx.name,
      active: true,
    });
    await ctx.db.patch(inviteRow._id, { acceptedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: inviteRow.workspaceId,
      actorType: "user",
      actorId: ctx.userId,
      action: "invite.accepted",
      subject: memberId,
    });
    return memberId;
  },
});
