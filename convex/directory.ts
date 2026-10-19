import { v } from "convex/values";

import { assertManager, assertPlatformAdmin, denied, requireAccess } from "./access";
import { mutation, query } from "./_generated/server";
import { newId, upsertAssignment, upsertInvite, upsertMember, upsertStaff, upsertWorkspace } from "./rows";
import { canonicalRole, isPlacedOperatorRole } from "./seatMap";

const SELF_FIELDS = new Set([
  "display_name",
  "email",
  "phone",
  "timezone",
  "working_hours_start",
  "working_hours_end",
  "working_days",
  "notification_quiet_start",
  "notification_quiet_end",
  "notification_delivery",
  "text_opt_in_at",
  "text_opt_in_wording",
  "text_opted_out_at",
  "avatar_path",
  "ghl_user_id",
]);

const CONTACT_FIELDS = new Set([
  "owner_contact_name",
  "owner_contact_email",
  "owner_contact_phone",
  "business_address",
]);

function publicMember(row: { legacyId: string; workspaceId: string; role: string; seat: string; active: boolean; email: string; displayName: string; canExport: boolean; canApprove: boolean }) {
  return {
    id: row.legacyId,
    workspaceId: row.workspaceId,
    role: row.role,
    seat: row.seat,
    active: row.active,
    email: row.email,
    displayName: row.displayName,
    canExport: row.canExport,
    canApprove: row.canApprove,
  };
}

async function membersIn(ctx: Parameters<typeof requireAccess>[0], workspaceId: string) {
  return await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(500);
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireAccess(ctx, { scope: "self" });
    const staff = await ctx.db
      .query("platformStaff")
      .withIndex("by_userId", (q) => q.eq("userId", access.userId))
      .unique();
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", access.userId))
      .take(200);
    const visible = [];
    for (const member of memberships) {
      if (!member.active || member.seat === "agent") continue;
      const workspace = await ctx.db
        .query("workspaces")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", member.workspaceId))
        .unique();
      if (!workspace) continue;
      if (member.seat === "customer" && (workspace.status === "closed" || isPlacedOperatorRole(member.role))) continue;
      if (member.seat === "staff") {
        if (!staff?.active) continue;
        if (staff.role === "service_team") {
          const assignments = await ctx.db
            .query("assignments")
            .withIndex("by_workspace_user", (q) => q.eq("workspaceId", member.workspaceId).eq("userId", access.userId))
            .take(5);
          if (!assignments.some((row) => row.active)) continue;
        }
      }
      visible.push({
        member,
        workspace: {
          id: workspace.legacyId,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          status: workspace.status,
          product: workspace.product,
          isPlatformWorkspace: workspace.isPlatformWorkspace,
          ghlLocationId: (workspace.row as { ghl_location_id?: string | null }).ghl_location_id ?? null,
        },
      });
    }
    return {
      staff: staff?.active
        ? {
            role: staff.role,
            templateAccess: staff.templateAccess,
            billingAccess: staff.billingAccess,
            displayName: staff.displayName,
            email: staff.email,
          }
        : null,
      memberships: visible.map(({ member, workspace }) => ({
        ...publicMember(member),
        userId: member.userId,
        canSeeMoney: Boolean((member.row as { can_see_money?: boolean }).can_see_money),
        canManageConnections: Boolean((member.row as { can_manage_connections?: boolean }).can_manage_connections),
        avatarPath: (member.row as { avatar_path?: string | null }).avatar_path ?? null,
        surfaceAccess: (member.row as { surface_access?: string }).surface_access ?? "operator",
        workspace,
      })),
    };
  },
});

export const listMembers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const rows = await membersIn(ctx, args.workspaceId);
    return rows.map(publicMember);
  },
});

export const countMembers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const rows = await membersIn(ctx, args.workspaceId);
    return { count: rows.length };
  },
});

export const searchMembers = query({
  args: { workspaceId: v.string(), term: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const term = args.term.trim();
    if (term.length < 1) return [];
    const byName = await ctx.db
      .query("members")
      .withSearchIndex("search_name", (q) => q.search("displayName", term).eq("workspaceId", args.workspaceId))
      .take(20);
    const byEmail = await ctx.db
      .query("members")
      .withSearchIndex("search_email", (q) => q.search("email", term).eq("workspaceId", args.workspaceId))
      .take(20);
    const seen = new Set<string>();
    const merged = [];
    for (const row of [...byName, ...byEmail]) {
      if (seen.has(row.legacyId)) continue;
      seen.add(row.legacyId);
      merged.push(publicMember(row));
    }
    return merged;
  },
});

export const exportMembers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.scope !== "workspace" || !access.canExport) denied();
    const rows = await membersIn(ctx, args.workspaceId);
    return rows.map((row) => ({
      id: row.legacyId,
      workspaceId: row.workspaceId,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
      seat: row.seat,
      active: row.active,
    }));
  },
});

export const listAssignments = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.scope !== "workspace" || (access.role !== "platform_admin" && access.role !== "service_team" && access.role !== "owner")) {
      denied();
    }
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    return rows.map((row) => ({
      id: row.legacyId,
      workspaceId: row.workspaceId,
      userId: row.userId,
      active: row.active,
    }));
  },
});

export const listPlatformStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireAccess(ctx, { scope: "platform" });
    const rows = await ctx.db.query("platformStaff").take(200);
    return rows.map((row) => ({
      userId: row.userId,
      role: row.role,
      active: row.active,
      displayName: row.displayName,
      email: row.email,
    }));
  },
});

export const patchSelf = mutation({
  args: { workspaceId: v.string(), legacyId: v.string(), fields: v.any() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.scope !== "workspace" || access.memberLegacyId !== args.legacyId) denied();
    const existing = await ctx.db
      .query("members")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!existing || existing.workspaceId !== args.workspaceId || existing.userId !== access.userId) denied();
    const incoming = args.fields as Record<string, unknown>;
    const next = { ...(existing.row as Record<string, unknown>) };
    for (const [key, value] of Object.entries(incoming)) {
      if (!SELF_FIELDS.has(key)) denied();
      next[key] = value;
    }
    const saved = await upsertMember(ctx, next);
    return saved.row;
  },
});

export const patchMember = mutation({
  args: { workspaceId: v.string(), legacyId: v.string(), fields: v.any() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertManager(access);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!existing || existing.workspaceId !== args.workspaceId) denied();
    const incoming = { ...(args.fields as Record<string, unknown>) };
    if (typeof incoming.role === "string") incoming.role = canonicalRole(incoming.role);
    if (incoming.role === "owner" && access.scope === "workspace" && access.role === "owner") denied();
    const next: Record<string, unknown> = {
      ...(existing.row as Record<string, unknown>),
      ...incoming,
      id: existing.legacyId,
      org_id: existing.workspaceId,
    };
    if (existing.role === "owner" && existing.active && existing.seat === "customer") {
      const losing =
        next.role !== "owner" || next.active === false || (typeof next.seat === "string" && next.seat !== "customer");
      if (losing) {
        const others = await membersIn(ctx, args.workspaceId);
        const owners = others.filter((row) => row.legacyId !== existing.legacyId && row.active && row.seat === "customer" && row.role === "owner");
        if (owners.length === 0) throw new Error("A workspace must keep at least one owner. Make someone else an owner first.");
      }
    }
    const saved = await upsertMember(ctx, next);
    return saved.row;
  },
});

export const patchWorkspace = mutation({
  args: { workspaceId: v.string(), fields: v.any() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const incoming = args.fields as Record<string, unknown>;
    const keys = Object.keys(incoming);
    const staff = access.scope === "workspace" && (access.role === "platform_admin" || access.role === "service_team");
    const ownerContactOnly = keys.every((key) => CONTACT_FIELDS.has(key));
    const presenceTouch = keys.length === 1 && keys[0] === "last_interactive_at";
    if (!presenceTouch && !staff && !(access.scope === "workspace" && access.role === "owner" && ownerContactOnly)) denied();
    if (
      keys.some((key) => key === "status" || key === "status_reason" || key === "is_test_workspace") &&
      access.scope === "workspace" &&
      access.role !== "platform_admin"
    ) {
      denied();
    }
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.workspaceId))
      .unique();
    if (!existing) denied();
    const next = { ...(existing.row as Record<string, unknown>), ...incoming, id: existing.legacyId };
    const saved = await upsertWorkspace(ctx, next);
    return saved.row;
  },
});

export const setAgentIdentity = mutation({
  args: { workspaceId: v.string(), legacyId: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.scope !== "workspace" || (access.role !== "platform_admin" && access.role !== "service_team")) denied();
    const members = await membersIn(ctx, args.workspaceId);
    const savedMembers = [];
    for (const member of members) {
      const row = { ...(member.row as Record<string, unknown>), is_agent_identity: member.legacyId === args.legacyId };
      savedMembers.push((await upsertMember(ctx, row)).row);
    }
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.workspaceId))
      .unique();
    if (!workspace) denied();
    const saved = await upsertWorkspace(ctx, {
      ...(workspace.row as Record<string, unknown>),
      agent_run_as_member_id: args.legacyId,
    });
    return { workspace: saved.row, members: savedMembers };
  },
});

export const createInvite = mutation({
  args: {
    workspaceId: v.string(),
    email: v.string(),
    role: v.string(),
    invitedBy: v.string(),
    surfaceAccess: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertManager(access);
    const role = canonicalRole(args.role);
    if (role === "owner" && access.scope === "workspace" && access.role !== "platform_admin" && access.role !== "service_team") {
      denied();
    }
    const legacyId = newId();
    const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const row = {
      id: legacyId,
      org_id: args.workspaceId,
      email: args.email.toLowerCase(),
      role,
      token,
      invited_by: args.invitedBy,
      expires_at: expires,
      surface_access: args.surfaceAccess,
      accepted_at: null,
      created_at: new Date().toISOString(),
    };
    const saved = await upsertInvite(ctx, row);
    return saved.row;
  },
});

export const refreshInvite = mutation({
  args: { workspaceId: v.string(), legacyId: v.string(), expiresAt: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertManager(access);
    const existing = await ctx.db
      .query("invites")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!existing || existing.workspaceId !== args.workspaceId || existing.accepted) denied();
    const saved = await upsertInvite(ctx, { ...(existing.row as Record<string, unknown>), expires_at: args.expiresAt });
    return saved.row;
  },
});

export const revokeInvite = mutation({
  args: { workspaceId: v.string(), legacyId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertManager(access);
    const existing = await ctx.db
      .query("invites")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!existing || existing.workspaceId !== args.workspaceId || existing.accepted) denied();
    await ctx.db.delete(existing._id);
    return { id: existing.legacyId, deleted: true };
  },
});

async function writeAssignment(
  ctx: Parameters<typeof upsertAssignment>[0],
  workspaceId: string,
  userId: string,
  assignedBy: string,
) {
  const staff = await ctx.db
    .query("platformStaff")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!staff || !staff.active || staff.role !== "service_team") {
    throw new Error("Only active Service Team members are assigned to workspaces.");
  }
  const customer = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .take(2);
  if (customer.some((row) => row.seat !== "staff")) {
    throw new Error("This person is a customer user of that workspace.");
  }
  const staffSeat = customer.find((row) => row.seat === "staff");
  const open = await ctx.db
    .query("assignments")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .take(5);
  const current = open.find((row) => row.active);
  if (current) return { assignment: current.row, member: staffSeat?.row ?? null };
  const legacyId = newId();
  const row = {
    id: legacyId,
    org_id: workspaceId,
    user_id: userId,
    assigned_at: new Date().toISOString(),
    assigned_by: assignedBy,
    ended_at: null,
    ended_by: null,
    note: null,
  };
  const saved = await upsertAssignment(ctx, row);
  const member = await upsertMember(ctx, {
    id: staffSeat?.legacyId ?? newId(),
    org_id: workspaceId,
    user_id: userId,
    role: "admin",
    seat: "staff",
    display_name: staff.displayName,
    email: staff.email,
    active: true,
    surface_access: "operator",
    can_approve: false,
    can_export: false,
    can_see_money: false,
    can_manage_connections: false,
  });
  return { assignment: saved.row, member: member.row };
}

export const assignStaff = mutation({
  args: { workspaceId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertPlatformAdmin(access);
    return await writeAssignment(ctx, args.workspaceId, args.userId, access.userId);
  },
});

export const endAssignment = mutation({
  args: { workspaceId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertPlatformAdmin(access);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", args.userId))
      .take(5);
    const current = rows.find((row) => row.active);
    if (!current) return null;
    const row = {
      ...(current.row as Record<string, unknown>),
      ended_at: new Date().toISOString(),
      ended_by: access.userId,
    };
    await upsertAssignment(ctx, row);
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", args.userId))
      .take(2);
    const staffSeat = member.find((item) => item.seat === "staff");
    const memberRow = staffSeat
      ? (await upsertMember(ctx, { ...(staffSeat.row as Record<string, unknown>), active: false })).row
      : null;
    return { assignment: row, member: memberRow };
  },
});

export const upsertPlatformStaff = mutation({
  args: { row: v.any() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "platform" });
    const incoming = args.row as Record<string, unknown>;
    const userId = String(incoming.user_id ?? "");
    const existing = await ctx.db
      .query("platformStaff")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return await upsertStaff(ctx, { ...((existing?.row as Record<string, unknown> | undefined) ?? {}), ...incoming });
  },
});
