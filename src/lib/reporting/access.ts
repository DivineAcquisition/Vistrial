import "server-only";

import { redirect } from "next/navigation";

import { canViewReporting } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requireReportingAccess(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canViewReporting(ctx.role, ctx.isPlatformAdmin)) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

export async function assertReportingAccess(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  if (!canViewReporting(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false, error: "Reporting is owner and admin only." };
  }
  return { ok: true, ctx };
}
