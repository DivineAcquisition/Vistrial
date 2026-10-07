import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import {
  isStaffRole,
  membershipsFromRows,
  resolveActiveMembership,
  workspaceRoleFor,
  type MemberRow,
} from "@/lib/auth/memberships";
import { safeInternalPath } from "@/lib/auth/paths";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";
import type { PlatformRole } from "@/types/database";

export type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";

const MEMBER_COLUMNS = "id, org_id, role, seat, can_approve, display_name, email, surface_access" as const;
const ORG_COLUMNS = "id, name, slug, timezone, ghl_location_id, status, is_platform_workspace" as const;

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
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_staff")
    .select("role, template_access, display_name, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || !data.active) return null;
  return {
    role: data.role,
    templateAccess: data.template_access,
    displayName: data.display_name,
  };
});

async function orgsByIds(
  db: Awaited<ReturnType<typeof createClient>>,
  orgIds: string[]
): Promise<Map<string, OrgSummary>> {
  if (orgIds.length === 0) return new Map();
  const { data, error } = await db.from("organizations").select(ORG_COLUMNS).in("id", orgIds);
  if (error || !data) return new Map();
  return new Map(
    data.map((org) => [
      org.id,
      {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        ghlLocationId: org.ghl_location_id,
        status: org.status,
        isPlatformWorkspace: org.is_platform_workspace,
      },
    ])
  );
}

/**
 * Every workspace the caller can enter right now, read through their own
 * session. Row-level security is the whole rule: closed workspaces drop out
 * for customers, ended assignments drop out for staff, and a seat whose
 * workspace the caller cannot see is not returned. There is deliberately no
 * service-role fallback, which could resurrect a seat the database has hidden.
 */
export const listActiveMemberships = cache(
  async (userId: string): Promise<Membership[]> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== userId) return [];

    const { data, error } = await supabase
      .from("org_members")
      .select(MEMBER_COLUMNS)
      .eq("user_id", userId)
      .eq("active", true)
      .neq("seat", "agent")
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) return [];
    const orgs = await orgsByIds(supabase, [...new Set(data.map((row) => row.org_id))]);
    return membershipsFromRows(data as MemberRow[], orgs).sort((a, b) =>
      a.org.name.localeCompare(b.org.name)
    );
  }
);

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

  const staff = await getPlatformStaff();
  const memberships = await listActiveMemberships(user.id);
  if (memberships.length === 0) {
    redirect(staff ? "/no-access?reason=unassigned" : "/no-access");
  }

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const { active, cookieNeedsReset } = resolveActiveMembership(memberships, cookieOrgId);

  if (cookieNeedsReset) {
    await writeOrgCookie(active.orgId);
  }

  const platformRole = staff?.role ?? null;
  const workspaceRole = workspaceRoleFor(active, platformRole);

  return {
    user,
    member: active,
    org: active.org,
    role: active.role,
    workspaceRole,
    isStaff: isStaffRole(workspaceRole),
    isPlatformAdmin: platformRole === "platform_admin",
    platformRole,
    templateAccess: platformRole === "platform_admin" || Boolean(staff?.templateAccess),
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
    canApprove: ctx.isStaff || ctx.role === "owner" || ctx.member.canApprove,
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
