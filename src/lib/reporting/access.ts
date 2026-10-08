import "server-only";

import { notFound } from "next/navigation";

import { canViewReporting } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";

export async function requireReportingAccess(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canViewReporting(ctx.role, ctx.isStaff)) {
    notFound();
  }
  return ctx;
}

export async function assertReportingAccess(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  if (!canViewReporting(ctx.role, ctx.isStaff)) {
    return { ok: false, error: "Reporting is owner and admin only." };
  }
  return { ok: true, ctx };
}
