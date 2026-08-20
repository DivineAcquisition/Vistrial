import "server-only";

import { randomBytes } from "node:crypto";

import { INVITE_TTL_DAYS } from "@/lib/auth/cookies";
import { emailsMatch } from "@/lib/auth/permissions";
import { inviteUrl } from "@/lib/auth/paths";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OrgRole } from "@/types/database";

export type InviteLookup =
  | { status: "missing" }
  | { status: "expired"; email: string; orgName: string }
  | { status: "accepted"; email: string; orgName: string }
  | {
      status: "valid";
      id: string;
      email: string;
      role: OrgRole;
      orgId: string;
      orgName: string;
      expiresAt: string;
    };

type InviteRow = {
  id: string;
  email: string;
  role: OrgRole;
  org_id: string;
  expires_at: string;
  accepted_at: string | null;
  organizations: { name: string } | { name: string }[] | null;
};

function orgNameOf(value: InviteRow["organizations"]): string {
  if (!value) return "this workspace";
  return Array.isArray(value) ? (value[0]?.name ?? "this workspace") : value.name;
}

export async function lookupInviteByToken(token: string): Promise<InviteLookup> {
  const { data, error } = await getSupabaseAdmin()
    .from("org_invites")
    .select("id, email, role, org_id, expires_at, accepted_at, organizations ( name )")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return { status: "missing" };
  }

  const row = data as InviteRow;
  const orgName = orgNameOf(row.organizations);

  if (row.accepted_at) {
    return { status: "accepted", email: row.email, orgName };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { status: "expired", email: row.email, orgName };
  }

  return {
    status: "valid",
    id: row.id,
    email: row.email,
    role: row.role,
    orgId: row.org_id,
    orgName,
    expiresAt: row.expires_at,
  };
}

export type RedeemResult =
  | { ok: true; orgId: string }
  | { ok: false; error: "not_found" | "expired" | "already_accepted" | "email_mismatch" | "user_not_found" | "unknown" };

export async function redeemInvite(
  token: string,
  userId: string,
  userEmail: string | null
): Promise<RedeemResult> {
  const invite = await lookupInviteByToken(token);
  if (invite.status === "missing") return { ok: false, error: "not_found" };
  if (invite.status === "expired") return { ok: false, error: "expired" };
  if (invite.status === "accepted") return { ok: false, error: "already_accepted" };

  if (!emailsMatch(invite.email, userEmail)) {
    return { ok: false, error: "email_mismatch" };
  }

  const { data, error } = await getSupabaseAdmin().rpc("redeem_org_invite", {
    p_token: token,
    p_user_id: userId,
  });

  if (error || !data || typeof data !== "object") {
    return { ok: false, error: "unknown" };
  }

  const payload = data as { ok?: boolean; error?: string; org_id?: string };
  if (!payload.ok) {
    const code = payload.error;
    if (
      code === "not_found" ||
      code === "expired" ||
      code === "already_accepted" ||
      code === "email_mismatch" ||
      code === "user_not_found"
    ) {
      return { ok: false, error: code };
    }
    return { ok: false, error: "unknown" };
  }

  return { ok: true, orgId: payload.org_id ?? invite.orgId };
}

export function newInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function inviteExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildInviteLink(token: string): string {
  return inviteUrl(token);
}
