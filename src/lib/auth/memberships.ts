import type { Membership, OrgSummary } from "@/lib/auth/types";
import type { OrgRole, SurfaceAccess } from "@/types/database";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  ghl_location_id: string | null;
};

export type MemberRow = {
  id: string;
  org_id: string;
  role: OrgRole;
  display_name: string;
  email: string;
  surface_access?: SurfaceAccess | null;
  organizations?: OrgRow | OrgRow[] | null;
};

export function unwrapOrg(value: OrgRow | OrgRow[] | null | undefined): OrgSummary | null {
  const row = !value ? null : Array.isArray(value) ? (value[0] ?? null) : value;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    ghlLocationId: row.ghl_location_id,
  };
}

export function membershipFromRow(
  row: MemberRow,
  orgsById?: ReadonlyMap<string, OrgSummary>
): Membership | null {
  const org = unwrapOrg(row.organizations) ?? orgsById?.get(row.org_id) ?? null;
  if (!org) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    surfaceAccess: row.surface_access === "portal" ? "portal" : "operator",
    org,
  };
}

export function membershipsFromRows(
  rows: MemberRow[],
  orgsById?: ReadonlyMap<string, OrgSummary>
): Membership[] {
  return rows
    .map((row) => membershipFromRow(row, orgsById))
    .filter((row): row is Membership => row !== null);
}

/**
 * Picks the active org from the memberships the caller actually holds.
 *
 * `cookieOrgId` is attacker-controlled, so it is only ever used to select from
 * that list — an org id the caller does not belong to is treated the same as no
 * cookie at all. `cookieNeedsReset` means the stored value disagrees with the
 * resolved org and should be rewritten.
 *
 * Callers must pass only active memberships; this does not filter them.
 */
export function resolveActiveMembership(
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
