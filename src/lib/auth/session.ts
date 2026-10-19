import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { isStaffRole, resolveActiveMembership, workspaceRoleFor } from "@/lib/auth/memberships";
import { safeInternalPath } from "@/lib/auth/paths";
import { canExport, canSeeMoney } from "@/lib/auth/portal-access";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { loadConvexDirectory } from "@/lib/directory/load";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, ClientOrgState, Membership } from "@/lib/auth/types";
import type { PlatformRole } from "@/types/database";

export type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type PlatformStaffRecord = {
  role: PlatformRole;
  templateAccess: boolean;
  displayName: string;
};

/**
 * The caller's platform staff record, read through their own session (the
 * policy lets anyone read only their own row). Null for customers and for
 * deactivated staff.
 */
export const getPlatformStaff = cache(async (): Promise<PlatformStaffRecord | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const directory = await loadConvexDirectory();
  return directory.staff;
});

/**
 * Every workspace the caller can enter right now. Convex is the source once
 * it has the caller's seats. A failed or empty Convex read uses the Postgres
 * seats the caller can already see, so sign-in still opens the workspace.
 */
export const listActiveMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const user = await getSessionUser();
  if (!user || user.id !== userId) return [];
  const directory = await loadConvexDirectory();
  return directory.memberships;
});

async function loadStaffMayApprove(orgId: string): Promise<boolean> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("staff_may_approve", { p_org_id: orgId });
  return !error && data === true;
}

async function writeOrgCookie(orgId: string) {
  const cookieStore = await cookies();
  try {
    cookieStore.set(ORG_COOKIE_NAME, orgId, orgCookieOptions);
  } catch {
    // Server Components cannot always persist cookies; OrgProvider syncs.
  }
}

/**
 * Current user, active workspace, and role. Cached per request — call this
 * from server components and server actions instead of re-deriving membership.
 * Role and assignment changes apply on the next request, not the next login.
 */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const user = await getSessionUser();
  if (!user) {
    const headerStore = await headers();
    const fromHeader = headerStore.get("x-vistrial-pathname");
    const dest = safeInternalPath(fromHeader, DEFAULT_APP_PATH);
    redirect(`/login?redirect=${encodeURIComponent(dest)}`);
  }

  const directory = await loadConvexDirectory();
  const staff = directory.staff;
  const memberships = directory.memberships;
  if (memberships.length === 0) {
    redirect(directory.legacyStillHasSeats ? "/no-access?reason=directory" : staff ? "/no-access?reason=unassigned" : "/no-access");
  }

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const { active, cookieNeedsReset } = resolveActiveMembership(memberships, cookieOrgId);
  const lostWorkspace = Boolean(cookieOrgId && !memberships.some((membership) => membership.orgId === cookieOrgId));

  if (cookieNeedsReset) {
    await writeOrgCookie(active.orgId);
  }

  const platformRole = staff?.role ?? null;
  const workspaceRole = workspaceRoleFor(active, platformRole);
  const isStaff = isStaffRole(workspaceRole);

  return {
    user,
    member: active,
    org: active.org,
    role: active.role,
    workspaceRole,
    isStaff,
    isPlatformAdmin: platformRole === "platform_admin",
    staffMayApprove: isStaff ? await loadStaffMayApprove(active.orgId) : false,
    platformRole,
    templateAccess: platformRole === "platform_admin" || Boolean(staff?.templateAccess),
    lostWorkspace,
    memberships,
    cookieNeedsReset,
  };
});

export function toClientOrgState(ctx: AuthContext): ClientOrgState {
  return {
    user: {
      id: ctx.user.id,
      email: ctx.user.email ?? ctx.member.email,
      displayName: ctx.member.displayName,
    },
    org: ctx.org,
    role: ctx.role,
    workspaceRole: ctx.workspaceRole,
    isStaff: ctx.isStaff,
    isPlatformAdmin: ctx.isPlatformAdmin,
    canApprove: ctx.isStaff ? ctx.staffMayApprove : ctx.role === "owner" || ctx.member.canApprove,
    canSeeMoney: canSeeMoney(ctx),
    canExport: canExport(ctx),
    avatarPath: ctx.member.avatarPath,
    templateAccess: ctx.templateAccess,
    lostWorkspace: ctx.lostWorkspace,
    memberId: ctx.member.id,
    surfaceAccess: ctx.member.surfaceAccess,
    memberships: ctx.memberships.map((membership) => ({
      memberId: membership.id,
      role: membership.role,
      org: membership.org,
    })),
    cookieNeedsReset: ctx.cookieNeedsReset,
  };
}
