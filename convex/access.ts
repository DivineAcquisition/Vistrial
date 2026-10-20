import { ConvexError } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isPlacedOperatorRole } from "./seatMap";

export type WorkspaceRole = "platform_admin" | "service_team" | "owner" | "member" | "operator";

type Ctx = QueryCtx | MutationCtx;

export type Access =
  | { principal: "user"; userId: string; scope: "self" }
  | { principal: "user"; userId: string; scope: "platform"; role: "platform_admin" }
  | {
      principal: "user";
      userId: string;
      scope: "workspace";
      workspaceId: string;
      role: WorkspaceRole;
      memberLegacyId: string | null;
      canExport: boolean;
    }
  | { principal: "system"; job: string; scope: "workspace"; workspaceId: string }
  | { principal: "system"; job: string; scope: "platform" }
  | { principal: "import" };

/** Jobs that may touch platform-scope records. Every other system call names one workspace. */
const PLATFORM_JOBS = new Set(["notifications", "platform-halt", "deletion", "lead-access"]);

function systemKeyAccepted(key: string): boolean {
  const expected = process.env.CONVEX_SYSTEM_KEY;
  const importKey = process.env.DIRECTORY_IMPORT_KEY;
  if (!expected || key !== expected) return false;
  if (importKey && key === importKey) return false;
  return true;
}

export function denied(): never {
  throw new ConvexError({ code: "not_found", message: "Not found." });
}

async function staffFor(ctx: Ctx, userId: string): Promise<Doc<"platformStaff"> | null> {
  const row = await ctx.db
    .query("platformStaff")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!row || !row.active) return null;
  return row;
}

async function workspaceByLegacy(ctx: Ctx, workspaceId: string): Promise<Doc<"workspaces"> | null> {
  return await ctx.db
    .query("workspaces")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", workspaceId))
    .unique();
}

async function memberInWorkspace(ctx: Ctx, workspaceId: string, userId: string): Promise<Doc<"members"> | null> {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .take(2);
  return rows[0] ?? null;
}

async function assignmentActive(ctx: Ctx, workspaceId: string, userId: string): Promise<boolean> {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .take(5);
  return rows.some((row) => row.active);
}

function customerRole(role: string): WorkspaceRole | null {
  if (role === "owner") return "owner";
  if (role === "member" || role === "client_viewer") return "member";
  if (role === "setter" || role === "closer" || role === "operator") return "operator";
  return null;
}

/**
 * The one access check. Every Convex function calls this before it reads or
 * writes. Missing identity, missing membership, a closed workspace for a
 * customer, or an unassigned Service Team member is a denial.
 */
export function requireAccess(ctx: Ctx, request: { scope: "self" }): Promise<Extract<Access, { scope: "self" }>>;
export function requireAccess(ctx: Ctx, request: { scope: "platform" }): Promise<Extract<Access, { scope: "platform" }>>;
export function requireAccess(
  ctx: Ctx,
  request: { scope: "workspace"; workspaceId: string },
): Promise<Extract<Access, { principal: "user"; scope: "workspace" }>>;
export function requireAccess(ctx: Ctx, request: { scope: "import"; key: string }): Promise<Extract<Access, { principal: "import" }>>;
export function requireAccess(
  ctx: Ctx,
  request: { scope: "system"; key: string; job: string; workspaceId: string },
): Promise<Extract<Access, { principal: "system"; scope: "workspace" }>>;
export function requireAccess(
  ctx: Ctx,
  request: { scope: "system"; key: string; job: string; platform: true },
): Promise<Extract<Access, { principal: "system"; scope: "platform" }>>;
export async function requireAccess(
  ctx: Ctx,
  request:
    | { scope: "self" }
    | { scope: "platform" }
    | { scope: "workspace"; workspaceId: string }
    | { scope: "import"; key: string }
    | { scope: "system"; key: string; job: string; workspaceId: string }
    | { scope: "system"; key: string; job: string; platform: true },
): Promise<Access> {
  if (request.scope === "system") {
    const identity = await ctx.auth.getUserIdentity();
    if (identity || !systemKeyAccepted(request.key)) denied();
    const job = request.job.trim();
    if (!job || job.length > 80) denied();
    if ("platform" in request && request.platform === true) {
      if (!PLATFORM_JOBS.has(job)) denied();
      return { principal: "system", job, scope: "platform" };
    }
    if (!("workspaceId" in request) || !request.workspaceId) denied();
    const workspace = await workspaceByLegacy(ctx, request.workspaceId);
    if (!workspace) denied();
    return { principal: "system", job, scope: "workspace", workspaceId: request.workspaceId };
  }

  if (request.scope === "import") {
    const expected = process.env.DIRECTORY_IMPORT_KEY;
    const identity = await ctx.auth.getUserIdentity();
    if (!expected || request.key !== expected || identity) denied();
    return { principal: "import" };
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) denied();
  const userId = identity.subject;

  if (request.scope === "self") {
    return { principal: "user", userId, scope: "self" };
  }

  const staff = await staffFor(ctx, userId);

  if (request.scope === "platform") {
    if (staff?.role !== "platform_admin") denied();
    return { principal: "user", userId, scope: "platform", role: "platform_admin" };
  }

  const workspace = await workspaceByLegacy(ctx, request.workspaceId);
  if (!workspace) denied();

  if (staff?.role === "platform_admin") {
    return {
      principal: "user",
      userId,
      scope: "workspace",
      workspaceId: request.workspaceId,
      role: "platform_admin",
      memberLegacyId: (await memberInWorkspace(ctx, request.workspaceId, userId))?.legacyId ?? null,
      canExport: true,
    };
  }

  if (staff?.role === "service_team") {
    if (!(await assignmentActive(ctx, request.workspaceId, userId))) denied();
    return {
      principal: "user",
      userId,
      scope: "workspace",
      workspaceId: request.workspaceId,
      role: "service_team",
      memberLegacyId: (await memberInWorkspace(ctx, request.workspaceId, userId))?.legacyId ?? null,
      canExport: true,
    };
  }

  if (workspace.status === "closed") denied();

  const member = await memberInWorkspace(ctx, request.workspaceId, userId);
  if (!member || !member.active || member.seat !== "customer") denied();
  if (isPlacedOperatorRole(member.role)) denied();
  const role = customerRole(member.role);
  if (!role) denied();

  return {
    principal: "user",
    userId,
    scope: "workspace",
    workspaceId: request.workspaceId,
    role,
    memberLegacyId: member.legacyId,
    canExport: role === "owner" || (role === "member" && member.canExport),
  };
}

export function assertManager(access: Access): void {
  if (access.principal !== "user" || access.scope !== "workspace") denied();
  if (access.role !== "owner" && access.role !== "service_team" && access.role !== "platform_admin") denied();
}

export function assertPlatformAdmin(access: Access): void {
  if (access.principal !== "user") denied();
  if (access.scope === "platform" && access.role === "platform_admin") return;
  if (access.scope === "workspace" && access.role === "platform_admin") return;
  denied();
}
