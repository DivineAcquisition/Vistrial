/**
 * Settings: the workspace's business details, its people, its agents' defaults, Vistrial support access,
 * and each member's own choices. Owners change everything here. Managers read the workspace sections and
 * change nothing that affects the whole workspace. Reps only reach their own section ("You").
 * Every workspace-wide change writes an audit row with ids and counts only.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { managerQuery, ownerMutation, workspaceMutation, workspaceQuery, type MemberAccess } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";

const researchMode = v.union(v.literal("fast"), v.literal("thorough"));
const memberRole = v.union(v.literal("owner"), v.literal("manager"), v.literal("rep"));
const themeChoice = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));

type Role = Doc<"members">["role"];

async function settingsRow(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
}

async function requireSettings(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const row = await settingsRow(ctx, workspaceId);
  if (!row) notFound();
  return row;
}

async function activeMembers(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  return rows.filter((row) => row.active);
}

async function audit(ctx: MutationCtx & MemberAccess, action: string, subject: string, count?: number) {
  await writeAudit(ctx, {
    workspaceId: ctx.workspaceId,
    actorType: "user",
    actorId: ctx.identity.subject,
    action,
    subject,
    count,
  });
}

/** A member of this workspace, never one of another's. */
async function memberHere(ctx: MutationCtx & MemberAccess, memberId: Id<"members">) {
  const row = await ctx.db.get(memberId);
  if (!row || row.workspaceId !== ctx.workspaceId || !row.active) notFound();
  return row;
}

function ownersLeftAfter(members: Doc<"members">[], change: { memberId: Id<"members">; role: Role | null }) {
  return members.filter((row) => (row._id === change.memberId ? change.role === "owner" : row.role === "owner")).length;
}

/* ------------------------------------------------------------------ You */

/** What the signed-in member sees about themself, plus the workspace defaults any member's screens use. */
export const me = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const prefs = await ctx.db
      .query("memberPreferences")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .unique();
    const settings = await settingsRow(ctx, ctx.workspaceId);
    return {
      memberId: ctx.member._id,
      displayName: ctx.member.displayName,
      email: ctx.member.email ?? ctx.identity.email ?? null,
      role: ctx.member.role,
      joinedAt: ctx.member._creationTime,
      theme: prefs?.theme ?? null,
      themeDefault: settings?.themeDefault ?? ("light" as const),
      notifications: {
        checkInsDue: prefs?.notifyCheckInsDue ?? true,
        questionsWaiting: prefs?.notifyQuestionsWaiting ?? true,
        reportReady: prefs?.notifyReportReady ?? true,
      },
      defaultResearchMode: settings?.defaultResearchMode ?? ("thorough" as const),
    };
  },
});

/** Keeps the member's sign-in email and name on their row so the People list can show them. Self only. */
export const rememberMe = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    const email = ctx.identity.email?.trim().toLowerCase();
    const name = ctx.identity.name?.trim();
    const patch: Partial<Doc<"members">> = {};
    if (email && ctx.member.email !== email) patch.email = email;
    if (name && ctx.member.displayName !== name) patch.displayName = name;
    if (Object.keys(patch).length > 0) await ctx.db.patch(ctx.member._id, patch);
    return null;
  },
});

/** The member's own theme and notice choices. Affects only them, so any role may change it. */
export const setMyPreferences = workspaceMutation({
  args: {
    theme: v.optional(themeChoice),
    checkInsDue: v.optional(v.boolean()),
    questionsWaiting: v.optional(v.boolean()),
    reportReady: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const fields = {
      ...(args.theme === undefined ? {} : { theme: args.theme }),
      ...(args.checkInsDue === undefined ? {} : { notifyCheckInsDue: args.checkInsDue }),
      ...(args.questionsWaiting === undefined ? {} : { notifyQuestionsWaiting: args.questionsWaiting }),
      ...(args.reportReady === undefined ? {} : { notifyReportReady: args.reportReady }),
      updatedAt: Date.now(),
    };
    const current = await ctx.db
      .query("memberPreferences")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .unique();
    if (current) await ctx.db.patch(current._id, fields);
    else await ctx.db.insert("memberPreferences", { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, ...fields });
    return null;
  },
});

/* ------------------------------------------------------------- Business */

export const business = managerQuery({
  args: {},
  handler: async (ctx) => {
    const workspace = await ctx.db.get(ctx.workspaceId);
    if (!workspace) notFound();
    const settings = await settingsRow(ctx, ctx.workspaceId);
    return {
      name: workspace.name,
      timezone: workspace.timezone,
      createdAt: workspace.createdAt,
      defaultCountry: settings?.defaultCountry?.trim().toUpperCase() || "US",
      canEdit: ctx.member.role === "owner",
    };
  },
});

export const renameWorkspace = ownerMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw userError("Name the workspace.");
    if (name.length > 80) throw userError("Keep the name under 80 characters.");
    await ctx.db.patch(ctx.workspaceId, { name });
    await audit(ctx, "workspace.renamed", ctx.workspaceId);
    return null;
  },
});

export const setCountry = ownerMutation({
  args: { country: v.string() },
  handler: async (ctx, args) => {
    const country = args.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw userError("Use a two letter country code.");
    const settings = await requireSettings(ctx, ctx.workspaceId);
    await ctx.db.patch(settings._id, { defaultCountry: country });
    await audit(ctx, "settings.country_updated", settings._id);
    return null;
  },
});

/* --------------------------------------------------------------- People */

export const people = managerQuery({
  args: {},
  handler: async (ctx) => {
    const members = await activeMembers(ctx, ctx.workspaceId);
    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(100);
    const now = Date.now();
    const settings = await settingsRow(ctx, ctx.workspaceId);
    const order: Record<Role, number> = { owner: 0, manager: 1, rep: 2 };
    return {
      canManage: ctx.member.role === "owner",
      me: ctx.member._id,
      members: members
        .map((row) => ({
          id: row._id,
          name: row.displayName,
          email: row.email ?? null,
          role: row.role,
          joinedAt: row._creationTime,
        }))
        .sort((a, b) => order[a.role] - order[b.role] || a.joinedAt - b.joinedAt),
      invites: invites
        .filter((row) => row.acceptedAt === undefined && row.canceledAt === undefined && row.expiresAt > now)
        .map((row) => ({ id: row._id, email: row.email, role: row.role, sentAt: row._creationTime, expiresAt: row.expiresAt }))
        .sort((a, b) => b.sentAt - a.sentAt),
      supportAccess: settings?.serviceTeamAccess !== false,
    };
  },
});

export const cancelInvite = ownerMutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.invitationId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (row.acceptedAt !== undefined) throw userError("That invite was already used.");
    if (row.canceledAt !== undefined) return null;
    await ctx.db.patch(row._id, { canceledAt: Date.now() });
    await audit(ctx, "invite.canceled", row._id);
    return null;
  },
});

export const setMemberRole = ownerMutation({
  args: { memberId: v.id("members"), role: memberRole },
  handler: async (ctx, args) => {
    const row = await memberHere(ctx, args.memberId);
    if (row.role === args.role) return null;
    const members = await activeMembers(ctx, ctx.workspaceId);
    if (ownersLeftAfter(members, { memberId: row._id, role: args.role }) === 0) {
      throw userError("A workspace needs at least one owner. Make someone else an owner first.");
    }
    await ctx.db.patch(row._id, { role: args.role });
    await audit(ctx, "member.role_changed", row._id, { owner: 0, manager: 1, rep: 2 }[args.role]);
    return null;
  },
});

export const removeMember = ownerMutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const row = await memberHere(ctx, args.memberId);
    const members = await activeMembers(ctx, ctx.workspaceId);
    if (ownersLeftAfter(members, { memberId: row._id, role: null }) === 0) {
      throw userError("A workspace needs at least one owner. Make someone else an owner first.");
    }
    await ctx.db.patch(row._id, { active: false, removedAt: Date.now() });
    await audit(ctx, "member.removed", row._id);
    return null;
  },
});

/* ------------------------------------------------------ Support access */

const STAFF_ROLE_WORDS = { platform_admin: "Vistrial admin", service_team: "Vistrial support" } as const;

/**
 * Every time Vistrial staff were let in: who, when, why, until when, and how often they opened the
 * workspace under that grant. Owners only; the reason text never leaves this query for anyone else.
 */
export const supportLog = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role !== "owner") notAllowed();
    const settings = await settingsRow(ctx, ctx.workspaceId);
    const grants = await ctx.db
      .query("staffAccessGrants")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(50);
    const auditRows = await ctx.db
      .query("auditLog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(500);
    const opens = new Map<string, { count: number; last: number }>();
    for (const row of auditRows) {
      if (row.action !== "staff.entered") continue;
      const seen = opens.get(row.subject);
      opens.set(row.subject, { count: (seen?.count ?? 0) + 1, last: Math.max(seen?.last ?? 0, row.createdAt) });
    }
    const now = Date.now();
    const rows = [];
    for (const grant of grants) {
      const staff = await ctx.db
        .query("staff")
        .withIndex("by_user", (q) => q.eq("userId", grant.staffUserId))
        .unique();
      const opened = opens.get(grant._id);
      rows.push({
        id: grant._id,
        who: staff ? STAFF_ROLE_WORDS[staff.role] : "Former Vistrial staff",
        staffRef: grant.staffUserId.slice(-6),
        reason: grant.reason,
        startsAt: grant.startsAt,
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt ?? null,
        open: grant.revokedAt === undefined && grant.startsAt <= now && grant.expiresAt > now,
        opens: opened?.count ?? 0,
        lastOpenedAt: opened?.last ?? null,
      });
    }
    return { on: settings?.serviceTeamAccess !== false, grants: rows };
  },
});

/** Turning support access off also ends any grant that is open now, so the change takes effect at once. */
export const setSupportAccess = ownerMutation({
  args: { on: v.boolean() },
  handler: async (ctx, args) => {
    const settings = await requireSettings(ctx, ctx.workspaceId);
    await ctx.db.patch(settings._id, { serviceTeamAccess: args.on });
    let ended = 0;
    if (!args.on) {
      const now = Date.now();
      const grants = await ctx.db
        .query("staffAccessGrants")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(100);
      for (const grant of grants) {
        if (grant.revokedAt === undefined && grant.expiresAt > now) {
          await ctx.db.patch(grant._id, { revokedAt: now });
          ended += 1;
        }
      }
    }
    await audit(ctx, args.on ? "workspace.service_team_access_on" : "workspace.service_team_access_off", settings._id, ended);
    return { ended };
  },
});

/* --------------------------------------------------------------- Agents */

export const agentDefaults = managerQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await settingsRow(ctx, ctx.workspaceId);
    return {
      defaultResearchMode: settings?.defaultResearchMode ?? ("thorough" as const),
      canEdit: ctx.member.role === "owner",
    };
  },
});

export const setDefaultResearchMode = ownerMutation({
  args: { mode: researchMode },
  handler: async (ctx, args) => {
    const settings = await requireSettings(ctx, ctx.workspaceId);
    await ctx.db.patch(settings._id, { defaultResearchMode: args.mode });
    await audit(ctx, "settings.research_mode_updated", settings._id, args.mode === "fast" ? 0 : 1);
    return null;
  },
});
