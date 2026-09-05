import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { StellarAuthContext, StellarMember, StellarMemberRole } from "@/lib/stellar/types";

const STELLAR_MEMBER_ROLES: StellarMemberRole[] = ["setter", "client_viewer"];

function isStellarMemberRole(role: string): role is StellarMemberRole {
  return (STELLAR_MEMBER_ROLES as string[]).includes(role);
}

/**
 * A Stellar member row for the current user, if any, scoped to orgs whose
 * product includes stellar. Uses the admin client as a fallback the same
 * way core Vistrial's session helper does, so an RLS gap never sends a
 * signed-in member to /no-access.
 */
async function findStellarMember(userId: string): Promise<StellarMember | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("id, org_id, role, display_name, email, organizations(id, name, timezone, product)")
    .eq("user_id", userId)
    .eq("active", true);

  const rows = data ?? [];
  const admin = getSupabaseAdmin();
  const fallbackRows = rows.length
    ? rows
    : (
        await admin
          .from("org_members")
          .select("id, org_id, role, display_name, email, organizations(id, name, timezone, product)")
          .eq("user_id", userId)
          .eq("active", true)
      ).data ?? [];

  for (const row of fallbackRows) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) continue;
    if (org.product !== "stellar" && org.product !== "both") continue;
    if (!isStellarMemberRole(row.role)) continue;
    return {
      id: row.id,
      orgId: row.org_id,
      orgName: org.name,
      orgTimezone: org.timezone,
      role: row.role,
      displayName: row.display_name,
      email: row.email,
    };
  }

  return null;
}

export async function checkIsStellarDaOperator(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_stellar_da_operator");
  if (error) return false;
  return Boolean(data);
}

/**
 * Current user's Stellar identity: either a da_operator (standing,
 * cross-org, never a membership row) or a single-org member (setter or
 * client_viewer). Redirects to /login if signed out, /no-access if neither
 * applies.
 */
export const getStellarAuthContext = cache(async (): Promise<StellarAuthContext> => {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?redirect=%2Fstellar");
  }

  const isDaOperator = await checkIsStellarDaOperator();
  if (isDaOperator) {
    return { kind: "da_operator", user };
  }

  const member = await findStellarMember(user.id);
  if (!member) {
    redirect("/no-access");
  }

  return { kind: "member", user, member };
});
