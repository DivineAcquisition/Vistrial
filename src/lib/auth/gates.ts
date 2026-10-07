import "server-only";

import { redirect } from "next/navigation";

import { canManageMembers, canManageOrgSettings, canWorkOperatorApp } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH, firstSettingsPath } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requireOrgSettingsManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isStaff)) {
    redirect("/portal");
  }
  if (!canManageOrgSettings(ctx.role, ctx.isStaff)) {
    redirect(firstSettingsPath(ctx.role, ctx.isStaff));
  }
  return ctx;
}

/** Platform-wide screens: every workspace, staff, assignments, system health. */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

/** Vistrial staff working the current workspace: Platform Admin, or assigned Service Team. */
export async function requireStaff(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

export async function requireMembersManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isStaff)) {
    redirect("/portal");
  }
  if (!canManageMembers(ctx.role, ctx.isStaff)) {
    redirect(firstSettingsPath(ctx.role, ctx.isStaff));
  }
  return ctx;
}

/** Owners and staff: the business's own details and people. */
export async function requireOwnerOrStaff(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff && ctx.role !== "owner") {
    redirect(firstSettingsPath(ctx.role, ctx.isStaff));
  }
  return ctx;
}
