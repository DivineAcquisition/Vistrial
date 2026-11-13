/**
 * Settings: the workspace's business details, its people, its agents' defaults, Vistrial support access,
 * and each member's own choices. Owners and Admins change what belongs to the organization; only an Owner changes an Owner or Vistrial
 * support access. Members and Viewers only reach their own section ("You").
 * Every workspace-wide change writes an audit row with ids and counts only.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { adminMutation, adminQuery, ownerMutation, selfMutation, workspaceQuery, type MemberAccess } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { accountMember, activeAccountOwners, closeAccountMemberIfUnused, organizationsOf, upsertAccountMember } from "./lib/organizations";
import { ROLE_ORDER, isAdmin, isOwner, roleOf, storedRoleValidator } from "./lib/roles";

const researchMode = v.union(v.literal("fast"), v.literal("thorough"));
const themeChoice = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));

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
      role: ctx.role,
      joinedAt: ctx.member._creationTime,
      theme: prefs?.theme ?? null,
      themeDefault: settings?.themeDefault ?? ("light" as const),
      notifications: {
        checkInsDue: prefs?.notifyCheckInsDue ?? true,
        questionsWaiting: prefs?.notifyQuestionsWaiting ?? true,
        reportReady: prefs?.notifyReportReady ?? true,
        /** Whether the notices above also go out by email. Members and Viewers get no email either way. */
        email: prefs?.notifyByEmail ?? true,
      },
      defaultResearchMode: settings?.defaultResearchMode ?? ("thorough" as const),
    };
  },
});

/** Keeps the member's sign-in email and name on their row so the People list can show them. Self only. */
export const rememberMe = selfMutation({
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
export const setMyPreferences = selfMutation({
  args: {
    theme: v.optional(themeChoice),
    checkInsDue: v.optional(v.boolean()),
    questionsWaiting: v.optional(v.boolean()),
    reportReady: v.optional(v.boolean()),
    email: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const fields = {
      ...(args.theme === undefined ? {} : { theme: args.theme }),
      ...(args.checkInsDue === undefined ? {} : { notifyCheckInsDue: args.checkInsDue }),
      ...(args.questionsWaiting === undefined ? {} : { notifyQuestionsWaiting: args.questionsWaiting }),
      ...(args.reportReady === undefined ? {} : { notifyReportReady: args.reportReady }),
      ...(args.email === undefined ? {} : { notifyByEmail: args.email }),
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

export const business = adminQuery({
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
      canEdit: isAdmin(ctx.member.role),
    };
  },
});

export const renameWorkspace = adminMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw userError("Name the organization.");
    if (name.length > 80) throw userError("Keep the name under 80 characters.");
    const workspace = await ctx.db.get(ctx.workspaceId);
    await ctx.db.patch(ctx.workspaceId, { name });
    // While an account has one organization its name follows it, as it did when the two were one thing.
    if (workspace?.accountId) {
      const account = await ctx.db.get(workspace.accountId);
      if (account && account.name === workspace.name && (await organizationsOf(ctx, account._id)).length === 1) await ctx.db.patch(account._id, { name });
    }
    await audit(ctx, "workspace.renamed", ctx.workspaceId);
    return null;
  },
});

export const setCountry = adminMutation({
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

/**
 * Who is in this organization, with their role here. Owners and Admins. `grantable` lists the account's
 * other organizations the caller also runs, so one invite can open several.
 */
export const people = adminQuery({
  args: {},
  handler: async (ctx) => {
    const members = await activeMembers(ctx, ctx.workspaceId);
    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(100);
    const now = Date.now();
    const settings = await settingsRow(ctx, ctx.workspaceId);
    const workspace = await ctx.db.get(ctx.workspaceId);
    const grantable: { workspaceId: Id<"workspaces">; name: string }[] = [];
    const names = new Map<Id<"workspaces">, string>();
    if (workspace) names.set(workspace._id, workspace.name);
    if (workspace?.accountId) {
      for (const organization of await organizationsOf(ctx, workspace.accountId)) {
        if (organization._id === ctx.workspaceId) continue;
        const mine = await ctx.db
          .query("members")
          .withIndex("by_workspace_user", (q) => q.eq("workspaceId", organization._id).eq("userId", ctx.identity.subject))
          .unique();
        if (!mine?.active || !isAdmin(mine.role)) continue;
        grantable.push({ workspaceId: organization._id, name: organization.name });
        names.set(organization._id, organization.name);
      }
    }
    return {
      canManage: true,
      /** Only an Owner makes another Owner, changes one, or switches Vistrial support access. */
      isOwner: ctx.role === "owner",
      me: ctx.member._id,
      organizationName: workspace?.name ?? "",
      grantable,
      members: members
        .map((row) => ({
          id: row._id,
          name: row.displayName,
          email: row.email ?? null,
          role: roleOf(row.role),
          joinedAt: row._creationTime,
        }))
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt - b.joinedAt),
      invites: invites
        .filter((row) => row.acceptedAt === undefined && row.canceledAt === undefined && row.expiresAt > now)
        .map((row) => ({
          id: row._id,
          email: row.email,
          role: roleOf(row.role),
          /** Every organization the invite opens that the caller can also see, this one first. */
          organizations: (row.grants ?? [{ workspaceId: row.workspaceId, role: row.role }])
            .filter((grant) => names.has(grant.workspaceId))
            .map((grant) => ({ name: names.get(grant.workspaceId) ?? "", role: roleOf(grant.role) })),
          sentAt: row._creationTime,
          expiresAt: row.expiresAt,
        }))
        .sort((a, b) => b.sentAt - a.sentAt),
      supportAccess: settings?.serviceTeamAccess !== false,
    };
  },
});

export const cancelInvite = adminMutation({
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

const LAST_OWNER = "An account needs at least one owner. Make someone else an owner first.";
const OWNERS_ONLY = "Only an Owner can change an Owner or make one.";

/** The account's active Owners, or this organization's when it has no account yet. */
async function ownerUserIds(ctx: MutationCtx & MemberAccess): Promise<string[]> {
  const workspace = await ctx.db.get(ctx.workspaceId);
  if (workspace?.accountId) return (await activeAccountOwners(ctx, workspace.accountId)).map((row) => row.userId);
  return (await activeMembers(ctx, ctx.workspaceId)).filter((row) => isOwner(row.role)).map((row) => row.userId);
}

/**
 * Changes a person's role in this organization. Owners and Admins; only an Owner touches an Owner.
 * Owner is a role on the whole account: making someone an Owner makes them one in every organization of
 * the account, and lowering an Owner here leaves them an Admin in the others.
 */
export const setMemberRole = adminMutation({
  args: { memberId: v.id("members"), role: storedRoleValidator },
  handler: async (ctx, args) => {
    const row = await memberHere(ctx, args.memberId);
    const from = roleOf(row.role);
    const to = roleOf(args.role);
    if (from === to) return null;
    if ((from === "owner" || to === "owner") && ctx.role !== "owner") throw userError(OWNERS_ONLY, "not_allowed");
    const workspace = await ctx.db.get(ctx.workspaceId);
    const accountId = workspace?.accountId;
    if (from === "owner") {
      const owners = await ownerUserIds(ctx);
      if (owners.filter((userId) => userId !== row.userId).length === 0) throw userError(LAST_OWNER);
    }
    await ctx.db.patch(row._id, { role: to });
    if (accountId && (from === "owner" || to === "owner")) {
      await upsertAccountMember(ctx, { accountId, userId: row.userId, role: "member", displayName: row.displayName, email: row.email });
      const accountRow = await accountMember(ctx, accountId, row.userId);
      if (accountRow) await ctx.db.patch(accountRow._id, { role: to === "owner" ? "owner" : "member" });
      for (const organization of await organizationsOf(ctx, accountId)) {
        if (organization._id === ctx.workspaceId) continue;
        const other = await ctx.db
          .query("members")
          .withIndex("by_workspace_user", (q) => q.eq("workspaceId", organization._id).eq("userId", row.userId))
          .unique();
        if (to === "owner") {
          if (other) await ctx.db.patch(other._id, { role: "owner", active: true, removedAt: undefined });
          else await ctx.db.insert("members", { workspaceId: organization._id, userId: row.userId, role: "owner", displayName: row.displayName, active: true, ...(row.email ? { email: row.email } : {}) });
        } else if (other?.active && isOwner(other.role)) {
          await ctx.db.patch(other._id, { role: "admin" });
        }
        await writeAudit(ctx, { workspaceId: organization._id, actorType: "user", actorId: ctx.identity.subject, action: "member.role_changed", subject: other?._id ?? row._id, count: ROLE_ORDER[to === "owner" ? "owner" : "admin"] });
      }
    }
    await audit(ctx, "member.role_changed", row._id, ROLE_ORDER[to]);
    return null;
  },
});

/** Removes a person from this organization. Their roles in other organizations are not touched. */
export const removeMember = adminMutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const row = await memberHere(ctx, args.memberId);
    if (isOwner(row.role)) {
      if (ctx.role !== "owner") throw userError(OWNERS_ONLY, "not_allowed");
      const owners = await ownerUserIds(ctx);
      if (owners.filter((userId) => userId !== row.userId).length === 0) throw userError(LAST_OWNER);
      const workspace = await ctx.db.get(ctx.workspaceId);
      // An Owner is one in every organization, so they cannot be taken out of just this one.
      if (workspace?.accountId && (await organizationsOf(ctx, workspace.accountId)).length > 1) {
        throw userError("An Owner is an Owner in every organization. Change their role first, then remove them.");
      }
    }
    await ctx.db.patch(row._id, { active: false, removedAt: Date.now() });
    const workspace = await ctx.db.get(ctx.workspaceId);
    if (workspace?.accountId) await closeAccountMemberIfUnused(ctx, workspace.accountId, row.userId);
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
    if (!isOwner(ctx.member.role)) notAllowed();
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

export const agentDefaults = adminQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await settingsRow(ctx, ctx.workspaceId);
    return {
      defaultResearchMode: settings?.defaultResearchMode ?? ("thorough" as const),
      canEdit: isAdmin(ctx.member.role),
    };
  },
});

export const setDefaultResearchMode = adminMutation({
  args: { mode: researchMode },
  handler: async (ctx, args) => {
    const settings = await requireSettings(ctx, ctx.workspaceId);
    await ctx.db.patch(settings._id, { defaultResearchMode: args.mode });
    await audit(ctx, "settings.research_mode_updated", settings._id, args.mode === "fast" ? 0 : 1);
    return null;
  },
});
