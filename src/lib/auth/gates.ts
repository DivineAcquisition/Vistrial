import "server-only";

import { notFound, redirect } from "next/navigation";

import { canManageMembers, canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { isOwner } from "@/lib/settings/managed";
import type { AuthContext } from "@/lib/auth/types";

export async function requireOrgSettingsManager(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    notFound();
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
    notFound();
  }
  return ctx;
}

export async function requireOwner(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) {
    notFound();
  }
  return ctx;
}
