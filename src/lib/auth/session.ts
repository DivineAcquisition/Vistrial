import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";
import type { OrgRole } from "@/types/database";

export type { AuthContext, ClientOrgState, Membership, OrgSummary } from "@/lib/auth/types";

type MemberRow = {
  id: string;
  org_id: string;
  role: OrgRole;
  display_name: string;
  email: string;
  organizations: OrgSummary | OrgSummary[] | null;
};

function unwrapOrg(value: OrgSummary | OrgSummary[] | null): OrgSummary | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toMembership(row: MemberRow): Membership | null {
  const org = unwrapOrg(row.organizations);
  if (!org) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    org,
  };
}

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const listActiveMemberships = cache(
  async (userId: string): Promise<Membership[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("org_members")
      .select(
        "id, org_id, role, display_name, email, organizations ( id, name, slug, timezone )"
      )
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    return (data as MemberRow[])
      .map(toMembership)
      .filter((row): row is Membership => row !== null);
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
    redirect("/login");
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
    memberId: ctx.member.id,
    memberships: ctx.memberships.map((membership) => ({
      memberId: membership.id,
      role: membership.role,
      org: membership.org,
    })),
    cookieNeedsReset: ctx.cookieNeedsReset,
  };
}
