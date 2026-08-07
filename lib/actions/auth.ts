"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getTeamMembership,
  homeForPortalSession,
  homeForTeamSession,
} from "@/lib/auth";
import {
  getTeamUserByEmail,
  insertTeamSession,
  revokeAllTeamSessions,
  updateTeamUser,
} from "@/lib/db/team";
import { deliverTeamPasswordReset } from "@/lib/notifications/team";
import { baseUrl } from "@/lib/origin";
import { hashToken, mintToken } from "@/lib/portal/tokens";
import {
  completeResetSchema,
  requestResetSchema,
} from "@/lib/schemas/team";
import { appendActivity } from "@/lib/team/activity";
import { clearFailedSignIns, recordFailedSignIn } from "@/lib/team/lockout";
import { isPasswordAcceptable } from "@/lib/team/password";
import { requestMeta } from "@/lib/team/request-meta";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";

const TEAM_HOME = "/attention";
const PORTAL_HOME = "/portal";

/** One message for every failure. Anything more tells an attacker which email
 * addresses have accounts. */
const GENERIC_FAILURE = "Invalid email or password.";
const LOCKED_MESSAGE =
  "This account is locked after too many failed sign-in attempts. An Owner has been notified.";

const credentialsSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export type SignInState = { error: string | null };

function safeDestination(
  value: FormDataEntryValue | null,
  fallback: string
): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/**
 * Team sign-in only. Portal members must use /portal/login — populations stay
 * separate even when Supabase Auth happens to share an email identity.
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: GENERIC_FAILURE };

  const { ipAddress, userAgent } = await requestMeta();
  const team = await getTeamUserByEmail(parsed.data.email);

  if (team?.status === "locked") {
    return { error: LOCKED_MESSAGE };
  }

  if (team?.status === "deactivated") {
    // Same generic copy — do not confirm the account exists as deactivated.
    return { error: GENERIC_FAILURE };
  }

  const requested = safeDestination(formData.get("next"), TEAM_HOME);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    if (team && team.status !== "pending") {
      const { locked } = await recordFailedSignIn(team, ipAddress);
      if (locked) return { error: LOCKED_MESSAGE };
    }
    return { error: GENERIC_FAILURE };
  }

  // Must be a team user. A pure portal identity using the team form fails
  // generically — never reveal which population an address belongs to.
  const membership =
    team ??
    (await getTeamUserByEmail(parsed.data.email).catch(() => null)) ??
    (data.user
      ? await import("@/lib/db/team").then((m) =>
          m.getTeamUserByAuthId(data.user!.id)
        )
      : null);

  if (!membership || membership.status === "deactivated") {
    await supabase.auth.signOut();
    return { error: GENERIC_FAILURE };
  }

  if (membership.status === "locked") {
    await supabase.auth.signOut();
    return { error: LOCKED_MESSAGE };
  }

  await clearFailedSignIns(membership.id);
  await updateTeamUser(membership.id, {
    last_sign_in_at: new Date().toISOString(),
    failed_sign_in_count: 0,
  });

  const db = createServiceClient();
  await appendActivity(db, {
    actorTeamUserId: membership.id,
    actorEmail: membership.email,
    action: "sign_in",
    subjectTeamUserId: membership.id,
    ipAddress,
  });

  await insertTeamSession({
    team_user_id: membership.id,
    auth_session_id: data.session?.access_token
      ? hashToken(data.session.access_token.slice(0, 32))
      : null,
    user_agent: userAgent,
    ip_address: ipAddress,
    // GAP: no geo-IP provider configured; approximate location left null.
    approx_location: null,
  });

  const home = await homeForTeamSession();
  if (home.startsWith("/login")) {
    await supabase.auth.signOut();
    const err = new URL(home, "http://local").searchParams.get("error");
    if (err === "locked") return { error: LOCKED_MESSAGE };
    return { error: GENERIC_FAILURE };
  }

  redirect(requested === TEAM_HOME ? home : requested);
}

/** Portal sign-in — separate surface from the team form. */
export async function signInPortalAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: GENERIC_FAILURE };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: GENERIC_FAILURE };

  const home = await homeForPortalSession();
  if (home !== PORTAL_HOME) {
    await supabase.auth.signOut();
    return { error: "This account no longer has access." };
  }

  redirect(PORTAL_HOME);
}

export async function signOutAction(): Promise<void> {
  const team = await getTeamMembership();
  const { ipAddress } = await requestMeta();
  if (team) {
    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: team.id,
      actorEmail: team.email,
      action: "sign_out",
      subjectTeamUserId: team.id,
      ipAddress,
    });
  }

  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect(team ? "/login" : "/portal/login");
}

export async function signOutPortalAction(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}

const RESET_CONFIRM =
  "If that address has a team account, a reset link is on its way.";

export type ResetRequestState = { message: string | null };

export async function requestPasswordResetAction(
  _previous: ResetRequestState,
  formData: FormData
): Promise<ResetRequestState> {
  const parsed = requestResetSchema.safeParse({
    email: formData.get("email"),
  });
  // Always the same confirmation.
  if (!parsed.success) return { message: RESET_CONFIRM };

  const team = await getTeamUserByEmail(parsed.data.email);
  if (!team || team.status === "deactivated" || !team.user_id) {
    return { message: RESET_CONFIRM };
  }

  const token = mintToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const db = createServiceClient();

  await db.from("team_password_resets").insert({
    team_user_id: team.id,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  const origin = await baseUrl();
  await deliverTeamPasswordReset({
    email: team.email,
    resetUrl: `${origin}/login/reset/${token}`,
    expiresAt,
  });

  await appendActivity(db, {
    actorEmail: team.email,
    action: "password_reset_requested",
    subjectTeamUserId: team.id,
  });

  return { message: RESET_CONFIRM };
}

export type ResetCompleteState = { error: string | null };

export async function completePasswordResetAction(
  _previous: ResetCompleteState,
  formData: FormData
): Promise<ResetCompleteState> {
  const parsed = completeResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  if (!isPasswordAcceptable(parsed.data.password)) {
    return { error: "Password does not meet the minimum requirements." };
  }

  const db = createServiceClient();
  const hash = hashToken(parsed.data.token);
  const { data: reset } = await db
    .from("team_password_resets")
    .select("*")
    .eq("token_hash", hash)
    .is("used_at", null)
    .maybeSingle();

  if (!reset || Date.parse(reset.expires_at) <= Date.now()) {
    return { error: "That reset link is not valid, or it has already been used." };
  }

  const team = await import("@/lib/db/team").then((m) =>
    m.getTeamUserById(reset.team_user_id)
  );
  if (!team?.user_id) {
    return { error: "That reset link is not valid, or it has already been used." };
  }

  const { error } = await db.auth.admin.updateUserById(team.user_id, {
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  await db
    .from("team_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", reset.id);

  await updateTeamUser(team.id, {
    force_password_reset: false,
    password_set_at: new Date().toISOString(),
  });

  // Using the link revokes every existing session for that account.
  await revokeAllTeamSessions(team.id);
  await db.auth.admin.signOut(team.user_id, "global");

  await appendActivity(db, {
    actorEmail: team.email,
    action: "password_reset_completed",
    subjectTeamUserId: team.id,
  });

  redirect("/login");
}
