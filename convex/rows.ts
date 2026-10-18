import type { MutationCtx } from "./_generated/server";
import { canonicalRole } from "./seatMap";

type Row = Record<string, unknown>;

function text(row: Row, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function bool(row: Row, key: string, fallback = false): boolean {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

export function memberFields(row: Row) {
  const role = canonicalRole(text(row, "role"));
  const next = { ...row, role };
  return {
    legacyId: text(next, "id"),
    workspaceId: text(next, "org_id"),
    userId: text(next, "user_id"),
    role,
    seat: text(next, "seat", "customer"),
    active: bool(next, "active", true),
    email: text(next, "email").toLowerCase(),
    displayName: text(next, "display_name"),
    canExport: bool(next, "can_export"),
    canApprove: bool(next, "can_approve"),
    row: next,
  };
}

export function workspaceFields(row: Row) {
  return {
    legacyId: text(row, "id"),
    name: text(row, "name"),
    slug: text(row, "slug"),
    timezone: text(row, "timezone", "America/New_York"),
    status: text(row, "status", "onboarding"),
    product: text(row, "product", "core"),
    isPlatformWorkspace: bool(row, "is_platform_workspace"),
    row,
  };
}

export function assignmentFields(row: Row) {
  return {
    legacyId: text(row, "id"),
    workspaceId: text(row, "org_id"),
    userId: text(row, "user_id"),
    active: row.ended_at == null || row.ended_at === "",
    row,
  };
}

export function inviteFields(row: Row) {
  const role = canonicalRole(text(row, "role"));
  const next: Row = { ...row, role };
  return {
    legacyId: text(next, "id"),
    workspaceId: text(next, "org_id"),
    email: text(next, "email").toLowerCase(),
    role,
    token: text(next, "token"),
    accepted: next.accepted_at != null && next.accepted_at !== "",
    row: next,
  };
}

export function staffFields(row: Row) {
  return {
    userId: text(row, "user_id"),
    role: text(row, "role"),
    active: bool(row, "active", true),
    templateAccess: bool(row, "template_access"),
    billingAccess: bool(row, "billing_access"),
    canCreateWorkspaces: bool(row, "can_create_workspaces"),
    displayName: text(row, "display_name"),
    email: text(row, "email").toLowerCase(),
    row,
  };
}

export async function upsertMember(ctx: MutationCtx, row: Row) {
  const fields = memberFields(row);
  const existing = await ctx.db
    .query("members")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("members", fields);
  return fields;
}

export async function upsertWorkspace(ctx: MutationCtx, row: Row) {
  const fields = workspaceFields(row);
  const existing = await ctx.db
    .query("workspaces")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("workspaces", fields);
  return fields;
}

export async function upsertAssignment(ctx: MutationCtx, row: Row) {
  const fields = assignmentFields(row);
  const existing = await ctx.db
    .query("assignments")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("assignments", fields);
  return fields;
}

export async function upsertInvite(ctx: MutationCtx, row: Row) {
  const fields = inviteFields(row);
  const existing = await ctx.db
    .query("invites")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("invites", fields);
  return fields;
}

export async function upsertStaff(ctx: MutationCtx, row: Row) {
  const fields = staffFields(row);
  const existing = await ctx.db
    .query("platformStaff")
    .withIndex("by_userId", (q) => q.eq("userId", fields.userId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("platformStaff", fields);
  return fields;
}

export function newId(): string {
  return crypto.randomUUID();
}
