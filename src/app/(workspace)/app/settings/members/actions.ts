"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildInviteLink,
  inviteExpiryDate,
  newInviteToken,
  normalizeInviteEmail,
} from "@/lib/auth/invites";
import {
  canManageMembers,
  invitableRolesFor,
  isInvitableRole,
  removesLastActiveOwner,
  roleLabel,
} from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { sendPortalMail } from "@/lib/portal/notices";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole, SurfaceAccess } from "@/types/database";

export type MemberActionResult =
  | { ok: true; url?: string; emailed?: boolean; emailError?: string }
  | { ok: false; error: string };

const LAST_OWNER =
  "A workspace must keep at least one owner. Make someone else an owner first, then try again.";

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canManageMembers(ctx.role, ctx.isStaff)) {
    return { ok: false as const, error: "Only owners can manage the people in this workspace.", ctx };
  }
  return { ok: true as const, ctx };
}

function revalidatePeople() {
  revalidatePath("/app/settings/members");
  revalidatePath("/app");
  revalidatePath("/portal");
}

/** Customer seats only: staff seats follow assignments and are never edited here. */
async function loadMember(orgId: string, memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("id, user_id, role, active, display_name, email, seat")
    .eq("org_id", orgId)
    .eq("id", memberId)
    .eq("seat", "customer")
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function activeOwnerCount(orgId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("seat", "customer")
    .eq("role", "owner")
    .eq("active", true);

  if (error) return Number.NaN;
  return count ?? 0;
}

async function guardLastOwner(args: {
  orgId: string;
  member: { role: OrgRole; active: boolean };
  nextRole: OrgRole;
  nextActive: boolean;
}): Promise<string | null> {
  if (args.member.role !== "owner" || !args.member.active) return null;
  const blocked = removesLastActiveOwner({
    role: args.member.role,
    active: args.member.active,
    nextRole: args.nextRole,
    nextActive: args.nextActive,
    activeOwners: await activeOwnerCount(args.orgId),
  });
  return blocked ? LAST_OWNER : null;
}

/** The database refuses the same changes; say why in words. */
function explain(error: { code?: string; hint?: string | null; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.hint === "last_owner") return LAST_OWNER;
  if (error.code === "42501" && error.message) return error.message;
  return fallback;
}

/** Members use the customer views; everyone else the working app. */
function surfaceFor(role: OrgRole): SurfaceAccess {
  return role === "member" ? "portal" : "operator";
}

export async function inviteMember(
  _prev: MemberActionResult,
  formData: FormData
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "");

  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!isInvitableRole(role) || !invitableRolesFor(gate.ctx.isStaff).includes(role)) {
    return {
      ok: false,
      error: gate.ctx.isStaff
        ? "Choose owner, member, or operator."
        : "Owners can invite members and operators. Ask the Vistrial team to add another owner.",
    };
  }

  const supabase = await createClient();
  const [{ data: existing }, { data: pending }] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, active")
      .eq("org_id", gate.ctx.org.id)
      .eq("seat", "customer")
      .ilike("email", email)
      .limit(1),
    supabase
      .from("org_invites")
      .select("id")
      .eq("org_id", gate.ctx.org.id)
      .ilike("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);
  if (existing?.[0]) {
    return {
      ok: false,
      error: existing[0].active
        ? `${email} is already in this workspace.`
        : `${email} was removed from this workspace. Restore them from the list below instead.`,
    };
  }
  if (pending?.[0]) {
    return { ok: false, error: `${email} already has an invite waiting. Resend it from the list below.` };
  }

  const token = newInviteToken();
  const { error } = await supabase.from("org_invites").insert({
    org_id: gate.ctx.org.id,
    email,
    role,
    token,
    invited_by: gate.ctx.member.id,
    expires_at: inviteExpiryDate().toISOString(),
    surface_access: surfaceFor(role),
  });

  if (error) {
    return { ok: false, error: explain(error, "Could not create the invite.") };
  }

  const url = buildInviteLink(token);
  const mail = await sendInviteEmail({
    to: email,
    url,
    role: role as OrgRole,
    orgName: gate.ctx.org.name,
    inviter: gate.ctx.member.displayName,
    key: `invite:${token}`,
  });
  revalidatePeople();
  return { ok: true, url, emailed: mail.ok, emailError: mail.ok ? undefined : mail.error };
}

function sendInviteEmail(args: {
  to: string;
  url: string;
  role: OrgRole;
  orgName: string;
  inviter: string;
  key: string;
}) {
  return sendPortalMail({
    to: args.to,
    subject: `${args.inviter} invited you to ${args.orgName} on Vistrial`,
    heading: `Join ${args.orgName} on Vistrial`,
    lines: [
      `${args.inviter} added you to ${args.orgName} as ${ROLE_WORDS[args.role] ?? roleLabel(args.role)}.`,
      "Use the button below to set up your sign-in. The link works for 7 days and only for this email address.",
    ],
    cta: { label: "Accept the invite", href: args.url },
    idempotencyKey: args.key,
  });
}

const ROLE_WORDS: Partial<Record<OrgRole, string>> = {
  owner: "an owner",
  member: "a member who sees results",
  operator: "an operator who works leads",
  setter: "a setter",
  closer: "a closer",
};

const RESEND_WAIT_MS = 5 * 60_000;

/** Sends the same invite again and gives it a fresh 7 days. */
export async function resendInvite(inviteId: string): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("org_invites")
    .select("id, email, role, token, expires_at")
    .eq("id", inviteId)
    .eq("org_id", gate.ctx.org.id)
    .is("accepted_at", null)
    .maybeSingle();
  if (!invite) return { ok: false, error: "That invite is no longer waiting." };

  const lastSent = Date.parse(invite.expires_at) - (inviteExpiryDate(new Date(0)).getTime());
  if (Date.now() - lastSent < RESEND_WAIT_MS) {
    return { ok: false, error: "It was sent a moment ago. Give it a few minutes before sending again." };
  }

  const expiresAt = inviteExpiryDate();
  const { error } = await supabase
    .from("org_invites")
    .update({ expires_at: expiresAt.toISOString() })
    .eq("id", invite.id)
    .eq("org_id", gate.ctx.org.id);
  if (error) return { ok: false, error: "Could not resend the invite." };

  const url = buildInviteLink(invite.token);
  const mail = await sendInviteEmail({
    to: invite.email,
    url,
    role: invite.role,
    orgName: gate.ctx.org.name,
    inviter: gate.ctx.member.displayName,
    key: `invite:${invite.token}:${expiresAt.getTime()}`,
  });
  revalidatePeople();
  if (!mail.ok) return { ok: false, error: `The invite has 7 more days, but the email did not send: ${mail.error}` };
  return { ok: true, emailed: true };
}

/** Lets a Member see money or export Results, or takes it back. Owners and staff always can. */
export async function setMemberGrant(
  memberId: string,
  grant: "money" | "export" | "transcripts",
  value: boolean
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };
  // Who reads call transcripts is the Owner's call alone; the database holds the same line.
  if (grant === "transcripts" && (gate.ctx.isStaff || gate.ctx.role !== "owner")) {
    return { ok: false, error: "Only an Owner can change who sees call transcripts." };
  }
  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.role !== "member") {
    return { ok: false, error: "These are for members. Owners already see money, transcripts, and can export." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update(grant === "money" ? { can_see_money: value } : grant === "export" ? { can_export: value } : { can_see_transcripts: value })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);
  if (error) return { ok: false, error: explain(error, "Could not change that for this member.") };
  revalidatePeople();
  return { ok: true };
}

export type OffboardResult =
  | { ok: true; leads: number; approvals: number; tasks: number }
  | { ok: false; error: string };

/**
 * Removes someone and hands their open work to another person first, so no
 * lead, approval, or task is left with nobody.
 */
export async function offboardMember(memberId: string, reassignTo: string | null): Promise<OffboardResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };
  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.user_id === gate.ctx.user.id) return { ok: false, error: "You cannot remove yourself." };
  const blocked = await guardLastOwner({ orgId: gate.ctx.org.id, member, nextRole: member.role, nextActive: false });
  if (blocked) return { ok: false, error: blocked };

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("member_offboard", { p_member_id: memberId, p_reassign_to: reassignTo });
  if (error) {
    return { ok: false, error: error.code === "22023" ? error.message : explain(error, "Could not remove this person.") };
  }
  const moved = (data ?? {}) as { leads?: number; approvals?: number; tasks?: number };
  revalidatePeople();
  return { ok: true, leads: moved.leads ?? 0, approvals: moved.approvals ?? 0, tasks: moved.tasks ?? 0 };
}

export async function revokeInvite(inviteId: string): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_invites")
    .delete()
    .eq("id", inviteId)
    .eq("org_id", gate.ctx.org.id)
    .is("accepted_at", null);

  if (error) {
    return { ok: false, error: "Could not revoke the invite." };
  }

  revalidatePeople();
  return { ok: true };
}

export async function updateMemberRole(memberId: string, role: OrgRole): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!isInvitableRole(role)) {
    return { ok: false, error: "Choose owner, member, or operator." };
  }
  if (role === "owner" && !gate.ctx.isStaff) {
    return { ok: false, error: "Ask the Vistrial team to make someone an owner." };
  }

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.role === "owner" && !gate.ctx.isStaff && member.user_id !== gate.ctx.user.id) {
    return { ok: false, error: "Ask the Vistrial team to change another owner's role." };
  }

  const blocked = await guardLastOwner({
    orgId: gate.ctx.org.id,
    member,
    nextRole: role,
    nextActive: member.active,
  });
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({
      role,
      surface_access: surfaceFor(role),
      ...(role === "member" ? {} : { can_approve: false }),
    })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: explain(error, `Could not change the role to ${roleLabel(role)}.`) };
  }

  revalidatePeople();
  return { ok: true };
}

/** An owner lets a Member approve drafts and gated actions, or takes it back. */
export async function setMemberApproval(memberId: string, canApprove: boolean): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.role !== "member") {
    return { ok: false, error: "Approval is granted to members. Owners already approve." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ can_approve: canApprove })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: explain(error, "Could not change approval for this member.") };
  }

  revalidatePeople();
  return { ok: true };
}

/**
 * Remove or restore someone. Removal takes effect on their next request and
 * keeps everything they did under their name.
 */
export async function setMemberActive(memberId: string, active: boolean): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };

  const blocked = await guardLastOwner({
    orgId: gate.ctx.org.id,
    member,
    nextRole: member.role,
    nextActive: active,
  });
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ active })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: explain(error, "Could not update membership status.") };
  }

  revalidatePeople();
  return { ok: true };
}
