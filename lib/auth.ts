import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { supabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";
import type { ClientUser } from "@/types/database";

export type SessionUser = { id: string; email: string };

export type AdminUser = SessionUser;

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
 * The portal membership for the current auth user, if any. An authenticated
 * user with no row here is an administrator — that is the invite-only
 * invariant, and it is what keeps public signup from ever opening an admin
 * session by accident.
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

/** Any authenticated session. Prefer requireAdmin / requireClient at boundaries. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * An administrator: authenticated, and not a portal member. Portal members who
 * hit an admin route are sent to their own dashboard rather than seeing data
 * for every client.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await requireUser();
  const membership = await getPortalMembership();

  if (membership && accessOpen(membership)) {
    redirect("/portal");
  }

  // A closed or expired membership still blocks the admin surface: the account
  // was created for a client, not for Divine Acquisition.
  if (membership) {
    redirect("/login?error=closed");
  }

  return user;
}

/** A portal member with an open access window, scoped to one client. */
export async function requireClient(): Promise<PortalSession> {
  const user = await requireUser();
  const membership = await getPortalMembership();

  if (!membership || !accessOpen(membership)) {
    // An admin who wanders into the portal goes back to the ledger.
    if (!membership) redirect("/attention");
    redirect("/login?error=closed");
  }

  return {
    user,
    membership,
    readOnly: membership.status === "archived",
  };
}

/** Where a successful sign-in should land for this session. */
export async function homeForSession(): Promise<string> {
  const membership = await getPortalMembership();
  if (membership && accessOpen(membership)) return "/portal";
  if (membership) return "/login";
  return "/attention";
}
