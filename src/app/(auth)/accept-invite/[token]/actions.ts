"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ORG_COOKIE_NAME, PENDING_INVITE_COOKIE, orgCookieOptions, pendingInviteCookieOptions } from "@/lib/auth/cookies";
import { lookupInviteByToken, redeemInvite } from "@/lib/auth/invites";
import { listActiveMemberships } from "@/lib/auth/session";
import { landingPath } from "@/lib/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AcceptInviteState = { error: string | null };

function displayNameFromEmail(email: string) {
  return email.split("@")[0] ?? "Member";
}

export async function createAccountFromInvite(
  _prev: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!token || !email || password.length < 8) {
    return { error: "Use the invited email and a password of at least 8 characters." };
  }

  const invite = await lookupInviteByToken(token);
  if (invite.status !== "valid") {
    return { error: "This invite is not valid. Ask an owner to send a new one." };
  }
  if (invite.email !== email) {
    return { error: "This invite belongs to a different email address." };
  }

  const { data: created, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayNameFromEmail(email) },
  });

  if (createError || !created.user) {
    const message = createError?.message.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) {
      return { error: "An account with this email already exists. Sign in instead." };
    }
    return { error: "Could not create the account. Sign in if you already have one." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: "Account created, but sign-in failed. Go to login and try again." };
  }

  const result = await redeemInvite(token, created.user.id, email);
  if (!result.ok) {
    if (result.error === "email_mismatch") {
      return { error: "This invite belongs to a different email address." };
    }
    return { error: "The invite could not be accepted. It may have expired." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, result.orgId, orgCookieOptions);
  cookieStore.delete(PENDING_INVITE_COOKIE);
  const memberships = await listActiveMemberships(created.user.id);
  const membership = memberships.find((m) => m.orgId === result.orgId);
  redirect(landingPath(membership?.surfaceAccess, membership?.role));
}

export async function markPendingInvite(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions);
}
