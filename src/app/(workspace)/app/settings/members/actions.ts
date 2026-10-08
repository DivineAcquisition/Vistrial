"use server";

import { revalidatePath } from "next/cache";

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
import { createClient } from "@/lib/supabase/server";
import type { OrgRole, SurfaceAccess } from "@/types/database";

export type MemberActionResult =
  | { ok: true; url?: string }
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

  // Email delivery lands in a later prompt. Return the link for manual sharing.
  revalidatePeople();
  return { ok: true, url: buildInviteLink(token) };
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
