import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type {
  TeamActivityLogEntry,
  TeamRole,
  TeamSessionRow,
  TeamUser,
  TeamUserStatus,
} from "@/types/database";

function db() {
  return createServiceClient();
}

export async function getTeamUserByAuthId(
  userId: string
): Promise<TeamUser | null> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .eq("user_id", userId)
    .returns<TeamUser[]>()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getTeamUserById(id: string): Promise<TeamUser | null> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .eq("id", id)
    .returns<TeamUser[]>()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getTeamUserByEmail(
  email: string
): Promise<TeamUser | null> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .ilike("email", email.trim())
    .returns<TeamUser[]>()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getTeamUserByInviteHash(
  hash: string
): Promise<TeamUser | null> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .eq("invitation_token_hash", hash)
    .returns<TeamUser[]>()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function countActiveOwners(): Promise<number> {
  const { count, error } = await db()
    .from("team_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listActiveOwners(): Promise<TeamUser[]> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .eq("role", "owner")
    .eq("status", "active")
    .returns<TeamUser[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTeamUsers(): Promise<TeamUser[]> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<TeamUser[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInvitations(): Promise<TeamUser[]> {
  const { data, error } = await db()
    .from("team_users")
    .select("*")
    .not("invitation_status", "is", null)
    .order("invited_at", { ascending: false })
    .returns<TeamUser[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertTeamUser(
  row: Partial<TeamUser> & { email: string; role: TeamRole }
): Promise<TeamUser> {
  const { data, error } = await db()
    .from("team_users")
    .insert(row)
    .select("*")
    .returns<TeamUser[]>()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTeamUser(
  id: string,
  patch: Partial<TeamUser>
): Promise<TeamUser> {
  const { data, error } = await db()
    .from("team_users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .returns<TeamUser[]>()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listTeamSessions(
  teamUserId: string
): Promise<TeamSessionRow[]> {
  const { data, error } = await db()
    .from("team_sessions")
    .select("*")
    .eq("team_user_id", teamUserId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .returns<TeamSessionRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertTeamSession(row: {
  team_user_id: string;
  auth_session_id?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  approx_location?: string | null;
}): Promise<TeamSessionRow> {
  const { data, error } = await db()
    .from("team_sessions")
    .insert(row)
    .select("*")
    .returns<TeamSessionRow[]>()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeTeamSession(id: string, teamUserId: string) {
  const { error } = await db()
    .from("team_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("team_user_id", teamUserId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

export async function revokeAllTeamSessions(teamUserId: string) {
  const { error } = await db()
    .from("team_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("team_user_id", teamUserId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

export async function listActivityLog(filters?: {
  teamUserId?: string;
  action?: string;
  limit?: number;
}): Promise<TeamActivityLogEntry[]> {
  let query = db()
    .from("team_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.teamUserId) {
    query = query.or(
      `actor_team_user_id.eq.${filters.teamUserId},subject_team_user_id.eq.${filters.teamUserId}`
    );
  }
  if (filters?.action) {
    query = query.eq("action", filters.action);
  }

  const { data, error } = await query.returns<TeamActivityLogEntry[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countWorkByActor(authUserId: string): Promise<{
  confirmed: number;
  rejected: number;
  disputesResolved: number;
  chargesProcessed: number;
}> {
  const client = db();

  // Attribution ids survive deactivation — users are never deleted.
  const [confirmed, rejected, disputes, credits] = await Promise.all([
    client
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("last_actor_id", authUserId)
      .eq("status", "confirmed"),
    client
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("last_actor_id", authUserId)
      .eq("status", "rejected"),
    client
      .from("appointment_disputes")
      .select("id", { count: "exact", head: true })
      .eq("resolved_by", authUserId),
    client
      .from("credits")
      .select("id", { count: "exact", head: true })
      .eq("created_by", authUserId),
  ]);

  return {
    confirmed: confirmed.count ?? 0,
    rejected: rejected.count ?? 0,
    disputesResolved: disputes.count ?? 0,
    chargesProcessed: credits.count ?? 0,
  };
}

/** Display status for the users list, folding invitation expiry. */
export function displayStatus(user: TeamUser, now = Date.now()): TeamUserStatus | "pending" {
  if (user.status === "active" || user.status === "deactivated" || user.status === "locked") {
    return user.status;
  }
  if (
    user.invitation_status === "pending" &&
    user.invitation_expires_at &&
    Date.parse(user.invitation_expires_at) <= now
  ) {
    return "pending";
  }
  return user.status;
}

export async function refreshExpiredInvitations(): Promise<void> {
  const { error } = await db()
    .from("team_users")
    .update({ invitation_status: "expired" })
    .eq("invitation_status", "pending")
    .lt("invitation_expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
}
