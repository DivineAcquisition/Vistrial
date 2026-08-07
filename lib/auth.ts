import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import {
  countActiveOwners,
  getTeamUserByAuthId,
  insertTeamUser,
} from "@/lib/db/team";
import { appendActivity } from "@/lib/team/activity";
import { mfaDetour, teamMfaGate } from "@/lib/team/mfa-session";
import {
  assertRoleHas,
  PermissionError,
  type Permission,
} from "@/lib/team/permissions";
import { supabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";
import type { ClientUser, TeamUser } from "@/types/database";

export type SessionUser = { id: string; email: string };

/** Authenticated team member. Replaces the Prompt-2 single-administrator model. */
export type AdminUser = SessionUser & { team: TeamUser };

export type PortalSession = {
  user: SessionUser;
  membership: ClientUser;
  /** True while the engagement has ended but the 90-day read window remains. */
  readOnly: boolean;
};

/**
 * Resolves the caller from the session cookie. Uses getUser() rather than
 * getSession() so the token is validated against the auth server instead of
 * being trusted from a cookie.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!supabaseEnv()) return null;

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
});

/**
 * The portal membership for the current auth user, if any. Portal and team
 * populations are separate; having a row here never grants team access.
 */
export const getPortalMembership = cache(async (): Promise<ClientUser | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = createServiceClient();
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("user_id", user.id)
    .returns<ClientUser[]>()
    .maybeSingle();

  if (error) {
    throw new Error(`Could not resolve the portal membership: ${error.message}`);
  }

  return data ?? null;
});

export const getTeamMembership = cache(async (): Promise<TeamUser | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getTeamUserByAuthId(user.id);
});

function accessOpen(membership: ClientUser, now = Date.now()): boolean {
  if (membership.status === "closed") return false;
  if (membership.status === "invited") return false;
  if (membership.status === "active") return true;
  if (membership.status === "archived") {
    if (membership.access_ends_at === null) return false;
    return Date.parse(membership.access_ends_at) > now;
  }
  return false;
}

/**
 * One-time path for the Prompt-2 hand-created administrator. Creates the first
 * Owner without ever leaving the system at zero Owners. Skips the password
 * onboarding step because a password already exists.
 *
 * Exported so the sign-in action can take the same path: without it, the very
 * first administrator authenticates correctly and is then refused for having no
 * `team_users` row — the row this creates.
 */
export async function bootstrapOwnerIfNeeded(user: SessionUser): Promise<TeamUser | null> {
  const existing = await getTeamUserByAuthId(user.id);
  if (existing) return existing;

  const owners = await countActiveOwners();
  if (owners > 0) return null;

  // A portal member must never be bootstrapped into the team population.
  const portal = await getPortalMembership();
  if (portal) return null;

  const team = await insertTeamUser({
    user_id: user.id,
    email: user.email,
    role: "owner",
    status: "active",
    onboarding_step: "profile",
    password_set_at: new Date().toISOString(),
    migrated_from_single_admin: true,
    joined_at: new Date().toISOString(),
    full_name: null,
  });

  const db = createServiceClient();
  await appendActivity(db, {
    actorTeamUserId: team.id,
    actorEmail: team.email,
    action: "owner_bootstrapped",
    subjectTeamUserId: team.id,
    detail: { source: "prompt_2_migration" },
  });

  // Never zero Owners: the insert above is the first active Owner.
  return team;
}

/** Any authenticated session. Prefer requireAdmin / requireClient at boundaries. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * An active team member whose session has satisfied two-factor authentication.
 * Portal members are sent to their own surface. Pending onboarding is sent back
 * to the invite flow. Locked / deactivated accounts are signed out of the team
 * surface.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await requireUser();

  // Prefer an existing team row; otherwise attempt the one-time Owner bootstrap.
  let team = await getTeamUserByAuthId(user.id);
  if (!team) {
    team = await bootstrapOwnerIfNeeded(user);
  }

  if (!team) {
    const membership = await getPortalMembership();
    if (membership && accessOpen(membership)) redirect("/portal");
    if (membership) redirect("/portal/login?error=closed");
    redirect("/login");
  }

  if (team.status === "locked") {
    redirect("/login?error=locked");
  }

  if (team.status === "deactivated") {
    redirect("/login?error=deactivated");
  }

  if (team.status === "pending" || team.onboarding_step !== "done") {
    // Resume onboarding via the invite token route when possible; otherwise the
    // migrated Owner continues at /onboarding/continue.
    if (team.migrated_from_single_admin && team.onboarding_step !== "done") {
      redirect("/onboarding/continue");
    }
    redirect("/login?error=pending");
  }

  if (team.status !== "active") {
    redirect("/login");
  }

  // Two-factor is enforced here, not only at the sign-in form: a session that
  // never answered its factor challenge cannot reach a team surface by any
  // route, and Owners and Admins without a factor are sent back to enrol.
  const detour = mfaDetour(await teamMfaGate(team));
  if (detour) redirect(detour);

  // The contact address, not the Supabase Auth address — the two differ when a
  // portal account already claimed this email (see lib/team/auth-identity.ts).
  return { id: user.id, email: team.email, team };
}

/** Same as requireAdmin, then refuses when the role lacks the permission. */
export async function requirePermission(
  permission: Permission
): Promise<AdminUser> {
  const admin = await requireAdmin();
  assertRoleHas(admin.team.role, permission);
  return admin;
}

/** A portal member with an open access window, scoped to one client. */
export async function requireClient(): Promise<PortalSession> {
  const user = await requireUser();
  const membership = await getPortalMembership();

  if (!membership || !accessOpen(membership)) {
    // A team member who wanders into the portal goes back to the ledger.
    const team = await getTeamUserByAuthId(user.id);
    if (team && team.status === "active" && team.onboarding_step === "done") {
      redirect("/attention");
    }
    redirect("/portal/login?error=closed");
  }

  return {
    user,
    membership,
    readOnly: membership.status === "archived",
  };
}

/** Where a successful team sign-in should land. */
export async function homeForTeamSession(): Promise<string> {
  const team = await getTeamMembership();
  if (!team) return "/login";
  if (team.status === "locked") return "/login?error=locked";
  if (team.status === "deactivated") return "/login?error=deactivated";
  if (team.status === "pending" || team.onboarding_step !== "done") {
    if (team.migrated_from_single_admin) return "/onboarding/continue";
    return "/login?error=pending";
  }

  // Two-factor comes before everything else a signed-in session can reach.
  const detour = mfaDetour(await teamMfaGate(team));
  if (detour) return detour;

  if (team.force_password_reset) return "/account/password";
  if (team.role === "member" && !team.mfa_enabled && team.mfa_skipped) {
    // Members may skip, and are asked again at the next sign-in.
    return "/onboarding/continue?prompt=mfa";
  }
  return "/attention";
}

/** Where a successful portal sign-in should land. */
export async function homeForPortalSession(): Promise<string> {
  const membership = await getPortalMembership();
  if (membership && accessOpen(membership)) return "/portal";
  return "/portal/login";
}

/** @deprecated Use homeForTeamSession / homeForPortalSession. Kept for call sites mid-migration. */
export async function homeForSession(): Promise<string> {
  const team = await getTeamMembership();
  if (team) return homeForTeamSession();
  return homeForPortalSession();
}

export { PermissionError };
