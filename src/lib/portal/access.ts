import "server-only";

import { redirect } from "next/navigation";

import { canViewPortal } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import type { AuthContext } from "@/lib/auth/types";

export async function requirePortalAccess(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canViewPortal(ctx.role, ctx.isStaff)) {
    redirect(DEFAULT_APP_PATH);
  }
  return ctx;
}

export async function assertPortalAccess(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string; status: 403 }
> {
  const ctx = await getAuthContext();
  if (!canViewPortal(ctx.role, ctx.isStaff)) {
    return { ok: false, error: "The owner portal is owner and admin only.", status: 403 };
  }
  return { ok: true, ctx };
}

/** Data connections are staff-written: the database refuses anyone else. */
export async function assertConnectionManager(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string; status: 403 }
> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) {
    return { ok: false, error: "The Vistrial team manages data connections for this workspace.", status: 403 };
  }
  return { ok: true, ctx };
}

/** The owner's report schedule: owners and staff. */
export async function assertPortalOwner(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string; status: 403 }
> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff && ctx.role !== "owner") {
    return { ok: false, error: "Only an owner can change the report schedule.", status: 403 };
  }
  return { ok: true, ctx };
}
