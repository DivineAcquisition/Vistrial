"use server";

import { revalidatePath } from "next/cache";

import {
  buildInviteLink,
  inviteExpiryDate,
  newInviteToken,
  normalizeInviteEmail,
} from "@/lib/auth/invites";
import { canManageMembers, canWorkOperatorApp, isInvitableRole } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole, SurfaceAccess } from "@/types/database";

export type MemberActionResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isPlatformAdmin)) {
    return { ok: false as const, error: "Portal-only members cannot manage the operator app.", ctx };
  }
  if (!canManageMembers(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false as const, error: "You do not have permission to manage members.", ctx };
  }
  return { ok: true as const, ctx };
}

async function activeOwnerCount(orgId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner")
    .eq("active", true);

  if (error) return Number.NaN;
  return count ?? 0;
}

async function loadMember(orgId: string, memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("id, user_id, role, active, display_name, email, surface_access")
    .eq("org_id", orgId)
    .eq("id", memberId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function guardLastOwner(args: {
  orgId: string;
  member: { id: string; role: OrgRole; active: boolean };
  nextRole: OrgRole;
  nextActive: boolean;
}): Promise<string | null> {
  const staysOwner = args.nextRole === "owner" && args.nextActive;
  if (args.member.role !== "owner" || !args.member.active || staysOwner) {
    return null;
  }

  const owners = await activeOwnerCount(args.orgId);
  if (!Number.isFinite(owners) || owners <= 1) {
    return "The last active owner cannot be demoted or deactivated.";
  }
  return null;
}

export async function inviteMember(
  _prev: MemberActionResult,
  formData: FormData
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "");
  const portalOnly = String(formData.get("portal_only") ?? "") === "1";

  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!isInvitableRole(role)) {
    return { ok: false, error: "Invites can only be sent for admin, closer, or setter." };
  }
  const surfaceAccess: SurfaceAccess = portalOnly && role === "admin" ? "portal" : "operator";

  const supabase = await createClient();
  const token = newInviteToken();
  const { error } = await supabase.from("org_invites").insert({
    org_id: gate.ctx.org.id,
    email,
    role,
    token,
    invited_by: gate.ctx.member.id,
    expires_at: inviteExpiryDate().toISOString(),
    surface_access: surfaceAccess,
  });

  if (error) {
    return { ok: false, error: "Could not create the invite." };
  }

  // Email delivery lands in a later prompt. Return the link for manual sharing.
  revalidatePath("/app/settings/members");
  revalidatePath("/portal");
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

  revalidatePath("/app/settings/members");
  revalidatePath("/portal");
  return { ok: true };
}

export async function updateMemberRole(
  memberId: string,
  role: OrgRole
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  if (role === "owner" && gate.ctx.role !== "owner" && !gate.ctx.isPlatformAdmin) {
    return { ok: false, error: "Only an owner can grant the owner role." };
  }

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin_user", {
    p_user_id: member.user_id,
  });
  if (isAdmin) {
    return { ok: false, error: "Platform admins cannot be demoted or deactivated." };
  }

  const blocked = await guardLastOwner({
    orgId: gate.ctx.org.id,
    member,
    nextRole: role,
    nextActive: member.active,
  });
  if (blocked) return { ok: false, error: blocked };

  const staysOperatorManager =
    (role === "owner" || role === "admin") && (member.surface_access ?? "operator") === "operator";
  if (
    member.active &&
    (member.role === "owner" || member.role === "admin") &&
    (member.surface_access ?? "operator") === "operator" &&
    !staysOperatorManager
  ) {
    const managers = await operatorManagerCount(gate.ctx.org.id);
    if (!Number.isFinite(managers) || managers <= 1) {
      return {
        ok: false,
        error: "The last operator owner or admin cannot be demoted. Someone still has to reach People and Integrations.",
      };
    }
  }

  const nextSurface: SurfaceAccess =
    role === "owner" || role === "admin" ? member.surface_access ?? "operator" : "operator";

  const { error } = await supabase
    .from("org_members")
    .update({ role, surface_access: nextSurface })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: "Could not update the role." };
  }

  revalidatePath("/app/settings/members");
  revalidatePath("/app");
  revalidatePath("/portal");
  return { ok: true };
}

async function operatorManagerCount(orgId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .eq("surface_access", "operator");
  if (error) return Number.NaN;
  return count ?? 0;
}

export async function updateMemberSurfaceAccess(
  memberId: string,
  surface: SurfaceAccess
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (surface !== "operator" && surface !== "portal") {
    return { ok: false, error: "Surface must be operator or portal." };
  }

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.role !== "owner" && member.role !== "admin") {
    return { ok: false, error: "Portal-only access is for owners and admins." };
  }

  if (
    surface === "portal" &&
    member.active &&
    (member.surface_access ?? "operator") === "operator"
  ) {
    const managers = await operatorManagerCount(gate.ctx.org.id);
    if (!Number.isFinite(managers) || managers <= 1) {
      return {
        ok: false,
        error: "The last operator owner or admin cannot be portal-only. Someone still has to reach People and Integrations.",
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ surface_access: surface })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: "Could not update surface access." };
  }

  revalidatePath("/app/settings/members");
  revalidatePath("/app");
  revalidatePath("/portal");
  return { ok: true };
}

export async function setMemberActive(
  memberId: string,
  active: boolean
): Promise<MemberActionResult> {
  const gate = await requireManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const member = await loadMember(gate.ctx.org.id, memberId);
  if (!member) return { ok: false, error: "Member not found." };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin_user", {
    p_user_id: member.user_id,
  });
  if (isAdmin) {
    return { ok: false, error: "Platform admins cannot be demoted or deactivated." };
  }

  const blocked = await guardLastOwner({
    orgId: gate.ctx.org.id,
    member,
    nextRole: member.role,
    nextActive: active,
  });
  if (blocked) return { ok: false, error: blocked };

  if (
    !active &&
    member.active &&
    (member.role === "owner" || member.role === "admin") &&
    (member.surface_access ?? "operator") === "operator"
  ) {
    const managers = await operatorManagerCount(gate.ctx.org.id);
    if (!Number.isFinite(managers) || managers <= 1) {
      return {
        ok: false,
        error: "The last operator owner or admin cannot be deactivated. Someone still has to reach People and Integrations.",
      };
    }
  }

  const { error } = await supabase
    .from("org_members")
    .update({ active })
    .eq("id", memberId)
    .eq("org_id", gate.ctx.org.id);

  if (error) {
    return { ok: false, error: "Could not update membership status." };
  }

  revalidatePath("/app/settings/members");
  revalidatePath("/app");
  revalidatePath("/portal");
  return { ok: true };
}
