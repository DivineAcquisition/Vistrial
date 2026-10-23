import { v } from "convex/values";

import { writeAudit } from "./audit";
import { activeMembership, requireMember, requireOwner, requireUser } from "./authz";
import { mutation, query } from "./_generated/server";
import { ensureAgents } from "./seed";
import { hashToken, randomToken, slugFromName } from "./token";

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

export const create = mutation({
  args: { name: v.string(), timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireUser(ctx);
    if (await activeMembership(ctx, identity.subject)) {
      throw new Error("You already belong to a workspace.");
    }
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
      userId: identity.subject,
      role: "owner",
      displayName: identity.name?.trim() || identity.email?.trim() || "Owner",
      active: true,
    });
    await ctx.db.insert("workspaceSettings", {
      workspaceId,
      setupDone: false,
      themeDefault: "light",
    });
    const agents = await ctx.db.query("agents").collect();
    for (const agent of agents) {
      await ctx.db.insert("workspaceAgents", {
        workspaceId,
        agentId: agent._id,
        state: "off",
        updatedAt: Date.now(),
        updatedBy: identity.subject,
      });
    }
    await writeAudit(ctx, {
      workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "workspace.created",
      subject: memberId,
      detail: { name },
    });
    return workspaceId;
  },
});

export const invite = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("rep")),
  },
  handler: async (ctx, args) => {
    const { identity, member } = await requireMember(ctx);
    requireOwner(member);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter an email.");
    const token = randomToken();
    const invitationId = await ctx.db.insert("invitations", {
      workspaceId: member.workspaceId,
      email,
      role: args.role,
      tokenHash: await hashToken(token),
      expiresAt: Date.now() + INVITE_MS,
    });
    await writeAudit(ctx, {
      workspaceId: member.workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "invite.created",
      subject: invitationId,
      detail: { email, role: args.role },
    });
    return { invitationId, token };
  },
});

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireUser(ctx);
    const tokenHash = await hashToken(args.token);
    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite) throw new Error("This invite is not valid.");
    if (invite.acceptedAt !== undefined) throw new Error("This invite has already been used.");
    if (invite.expiresAt <= Date.now()) throw new Error("This invite has expired.");
    const email = identity.email?.trim().toLowerCase() ?? "";
    if (!email || email !== invite.email) throw new Error("This invite is for a different email.");
    if (await activeMembership(ctx, identity.subject)) {
      throw new Error("You already belong to a workspace.");
    }
    const memberId = await ctx.db.insert("members", {
      workspaceId: invite.workspaceId,
      userId: identity.subject,
      role: invite.role,
      displayName: identity.name?.trim() || email,
      active: true,
    });
    await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: invite.workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "invite.accepted",
      subject: memberId,
      detail: { role: invite.role },
    });
    return memberId;
  },
});

export const updateSettings = mutation({
  args: { setupDone: v.boolean() },
  handler: async (ctx, args) => {
    const { identity, member } = await requireMember(ctx);
    requireOwner(member);
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .unique();
    if (!settings) throw new Error("Workspace settings are missing.");
    await ctx.db.patch(settings._id, { setupDone: args.setupDone });
    await writeAudit(ctx, {
      workspaceId: member.workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "settings.updated",
      subject: settings._id,
      detail: { setupDone: args.setupDone ? "yes" : "no" },
    });
  },
});

export const setAgentState = mutation({
  args: {
    slug: v.string(),
    state: v.union(v.literal("off"), v.literal("suggesting"), v.literal("on")),
  },
  handler: async (ctx, args) => {
    const { identity, member } = await requireMember(ctx);
    requireOwner(member);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!agent) throw new Error("That agent is not in the registry.");
    const link = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", member.workspaceId).eq("agentId", agent._id))
      .unique();
    if (!link) throw new Error("That agent is not in this workspace.");
    await ctx.db.patch(link._id, {
      state: args.state,
      updatedAt: Date.now(),
      updatedBy: identity.subject,
    });
    await writeAudit(ctx, {
      workspaceId: member.workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "agent_state.updated",
      subject: link._id,
      detail: { slug: args.slug, state: args.state },
    });
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .unique();
    const links = await ctx.db
      .query("workspaceAgents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .collect();
    const agents = [];
    for (const link of links) {
      const agent = await ctx.db.get(link.agentId);
      if (agent) agents.push({ slug: agent.slug, state: link.state });
    }
    return {
      role: member.role,
      setupDone: settings?.setupDone ?? false,
      agents,
    };
  },
});

export const createLead = mutation({
  args: { assignedMemberId: v.optional(v.id("members")) },
  handler: async (ctx, args) => {
    const { identity, member } = await requireMember(ctx);
    if (member.role === "rep") throw new Error("Only an owner can change that.");
    if (args.assignedMemberId) {
      const assignee = await ctx.db.get(args.assignedMemberId);
      if (!assignee || assignee.workspaceId !== member.workspaceId) {
        throw new Error("That person is not in this workspace.");
      }
    }
    const leadId = await ctx.db.insert("leads", {
      workspaceId: member.workspaceId,
      assignedMemberId: args.assignedMemberId,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      workspaceId: member.workspaceId,
      actorType: "user",
      actorId: identity.subject,
      action: "lead.created",
      subject: leadId,
      detail: {},
    });
    return leadId;
  },
});

export const listLeads = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .collect();
    const visible = member.role === "rep" ? leads.filter((lead) => lead.assignedMemberId === member._id) : leads;
    return visible.map((lead) => ({ id: lead._id, assignedMemberId: lead.assignedMemberId ?? null }));
  },
});

export const getLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== member.workspaceId) throw new Error("That lead is not available.");
    if (member.role === "rep" && lead.assignedMemberId !== member._id) {
      throw new Error("That lead is not available.");
    }
    return { id: lead._id, assignedMemberId: lead.assignedMemberId ?? null };
  },
});
