import "server-only";

import { redirect } from "next/navigation";

import { canViewPortal } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requirePortalAccess(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canViewPortal(ctx.role, ctx.isPlatformAdmin)) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

export async function assertPortalAccess(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string; status: 403 }
> {
  const ctx = await getAuthContext();
  if (!canViewPortal(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false, error: "The owner portal is owner and admin only.", status: 403 };
  }
  return { ok: true, ctx };
}
