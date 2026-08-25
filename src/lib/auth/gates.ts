import "server-only";

import { redirect } from "next/navigation";

import { canManageMembers, canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH, firstSettingsPath } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requireOrgSettingsManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    redirect(firstSettingsPath(ctx.role, ctx.isPlatformAdmin));
  }
  return ctx;
}

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

export async function requireMembersManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageMembers(ctx.role, ctx.isPlatformAdmin)) {
    redirect(firstSettingsPath(ctx.role, ctx.isPlatformAdmin));
  }
  return ctx;
}
