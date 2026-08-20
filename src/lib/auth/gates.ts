import "server-only";

import { redirect } from "next/navigation";

import { canManageMembers, canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { firstSettingsPath } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requireOrgSettingsManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role)) {
    redirect(firstSettingsPath(ctx.role));
  }
  return ctx;
}

export async function requireMembersManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageMembers(ctx.role)) {
    redirect(firstSettingsPath(ctx.role));
  }
  return ctx;
}
