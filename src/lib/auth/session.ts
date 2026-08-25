import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { membershipsFromRows, type MemberRow } from "@/lib/auth/memberships";
import { safeInternalPath } from "@/lib/auth/paths";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";

export type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";

const MEMBER_COLUMNS = "id, org_id, role, display_name, email" as const;

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

async function orgsByIds(
  db: Awaited<ReturnType<typeof createClient>>,
  orgIds: string[]
): Promise<Map<string, OrgSummary>> {
  if (orgIds.length === 0) return new Map();
  const { data, error } = await db
    .from("organizations")
    .select("id, name, slug, timezone, ghl_location_id")
    .in("id", orgIds);
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
      },
    ])
  );
}

async function membershipsViaAdmin(userId: string): Promise<Membership[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return [];
  const orgs = await orgsByIds(admin, [...new Set(data.map((row) => row.org_id))]);
  return membershipsFromRows(data as MemberRow[], orgs);
}

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
      .order("created_at", { ascending: true });

    if (!error && data && data.length > 0) {
      const orgs = await orgsByIds(
        supabase,
        [...new Set(data.map((row) => row.org_id))]
      );
      const scoped = membershipsFromRows(data as MemberRow[], orgs);
      if (scoped.length > 0) return scoped;
    }

    // User id is from getUser(). If RLS hid the member or org row, do not
    // send a signed-in member to /no-access.
    return membershipsViaAdmin(userId);
  }
);

function resolveActiveMembership(
  memberships: Membership[],
  cookieOrgId: string | undefined
): { active: Membership; cookieNeedsReset: boolean } {
  if (memberships.length === 1) {
    const only = memberships[0];
    return {
      active: only,
      cookieNeedsReset: cookieOrgId !== only.orgId,
    };
  }

  const fromCookie = cookieOrgId
    ? memberships.find((membership) => membership.orgId === cookieOrgId)
    : undefined;

  if (fromCookie) {
    return { active: fromCookie, cookieNeedsReset: false };
  }

  return { active: memberships[0], cookieNeedsReset: true };
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
 * Current user, active org, and role. Cached per request — call this from
 * server components and server actions instead of re-deriving membership.
 */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const user = await getSessionUser();
  if (!user) {
    const headerStore = await headers();
    const fromHeader = headerStore.get("x-vistrial-pathname");
    const dest = safeInternalPath(fromHeader, DEFAULT_APP_PATH);
    redirect(`/login?redirect=${encodeURIComponent(dest)}`);
  }

  const supabase = await createClient();
  const { data: platformAdminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  let isPlatformAdmin = Boolean(platformAdminRow);
  if (!isPlatformAdmin) {
    const { data: adminRow } = await getSupabaseAdmin()
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    isPlatformAdmin = Boolean(adminRow);
  }

  const memberships = await listActiveMemberships(user.id);
  if (memberships.length === 0) {
    redirect("/no-access");
  }

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const { active, cookieNeedsReset } = resolveActiveMembership(
    memberships,
    cookieOrgId
  );

  if (cookieNeedsReset) {
    await writeOrgCookie(active.orgId);
  }

  return {
    user,
    member: active,
    org: active.org,
    role: active.role,
    isPlatformAdmin,
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
    isPlatformAdmin: ctx.isPlatformAdmin,
    memberId: ctx.member.id,
    memberships: ctx.memberships.map((membership) => ({
      memberId: membership.id,
      role: membership.role,
      org: membership.org,
    })),
    cookieNeedsReset: ctx.cookieNeedsReset,
  };
}
