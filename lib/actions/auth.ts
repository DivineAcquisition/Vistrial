"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  bootstrapOwnerIfNeeded,
  getTeamMembership,
  homeForPortalSession,
  homeForTeamSession,
} from "@/lib/auth";
import { listClientUsersByEmail } from "@/lib/db/portal";
import {
  getTeamUserByAuthId,
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
import { authAddress } from "@/lib/team/auth-identity";
import { clearFailedSignIns, recordFailedSignIn } from "@/lib/team/lockout";
import { consumeRecoveryCode } from "@/lib/team/mfa";
import { MFA_CHALLENGE_PATH, teamMfaGate } from "@/lib/team/mfa-session";
import { isPasswordAcceptable } from "@/lib/team/password";
import { requestMeta } from "@/lib/team/request-meta";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";
import type { TeamUser } from "@/types/database";

const TEAM_HOME = "/attention";
const PORTAL_HOME = "/portal";

/** One message for every failure. Anything more tells an attacker which email
 * addresses have accounts. */
const GENERIC_FAILURE = "Invalid email or password.";
const LOCKED_MESSAGE =
  "This account is locked after too many failed sign-in attempts. An Owner has been notified.";
const CONFIG_FAILURE =
  "Sign-in is unavailable: SUPABASE_SERVICE_ROLE_KEY is not set on this deployment.";

export type SignInState = { error: string | null };

function failureState(error: unknown): SignInState {
  const message = error instanceof Error ? error.message : "";
  if (/SUPABASE_SERVICE_ROLE_KEY|Supabase is not configured/i.test(message)) {
    console.error("sign-in blocked by missing Supabase server config:", message);
    return { error: CONFIG_FAILURE };
  }
  console.error("sign-in failed:", message || error);
  return { error: GENERIC_FAILURE };
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

function safeDestination(
  value: FormDataEntryValue | null,
  fallback: string
): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/**
 * Supabase Auth holds one identity per address, so the same human email may be
 * stored under a tagged alias on one side (see lib/team/auth-identity.ts). The
 * person types their contact address; these are the Auth addresses it can mean,
 * team side first because this is the team form.
 */
async function authCandidates(
  typed: string,
  team: TeamUser | null
): Promise<string[]> {
  const ordered = [
    ...(team ? [authAddress(team)] : []),
    typed.trim(),
    ...(await listClientUsersByEmail(typed)
      .then((rows) => rows.map(authAddress))
      .catch(() => [])),
  ];

  return [...new Set(ordered.map((address) => address.toLowerCase()))];
}

/** Bookkeeping that only belongs to a sign-in that actually finished. */
async function recordTeamSignIn(
  membership: TeamUser,
  accessToken: string | null
): Promise<void> {
  const { ipAddress, userAgent } = await requestMeta();

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
    auth_session_id: accessToken ? hashToken(accessToken.slice(0, 32)) : null,
    user_agent: userAgent,
    ip_address: ipAddress,
    // GAP: no geo-IP provider configured; approximate location left null.
    approx_location: null,
  });
}

/**
 * The team sign-in surface. A password alone never completes a team sign-in:
 * an identity carrying a verified factor is handed to /login/verify, and the
 * session stays at aal1 until that challenge is answered.
 *
 * Client portal people may also sign in here — the portal has worked this way
 * since it shipped, and /portal/login is an additional door, not a replacement.
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  try {
    const parsed = credentialsSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) return { error: GENERIC_FAILURE };

    const { ipAddress } = await requestMeta();
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

    let signedIn: Awaited<
      ReturnType<typeof supabase.auth.signInWithPassword>
    >["data"] | null = null;

    for (const address of await authCandidates(parsed.data.email, team)) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: address,
        password: parsed.data.password,
      });
      if (!error && data.user) {
        signedIn = data;
        break;
      }
    }

    if (!signedIn?.user) {
      if (team && team.status !== "pending") {
        const { locked } = await recordFailedSignIn(team, ipAddress);
        if (locked) return { error: LOCKED_MESSAGE };
      }
      return { error: GENERIC_FAILURE };
    }

    let membership = team ?? (await getTeamUserByAuthId(signedIn.user.id));

    // Not a team identity. If it is a portal one with an open window, send them
    // to the portal rather than rejecting a password that was correct.
    if (!membership) {
      const home = await homeForPortalSession();
      if (home === PORTAL_HOME) redirect(PORTAL_HOME);

      // The very first administrator, hand-made in the Supabase dashboard before
      // team accounts existed, has no row yet. This is the one path that makes one.
      membership = await bootstrapOwnerIfNeeded({
        id: signedIn.user.id,
        email: signedIn.user.email ?? parsed.data.email,
      });
    }

    if (!membership) {
      await supabase.auth.signOut();
      return { error: GENERIC_FAILURE };
    }

    if (membership.status === "deactivated") {
      await supabase.auth.signOut();
      return { error: GENERIC_FAILURE };
    }

    if (membership.status === "locked") {
      await supabase.auth.signOut();
      return { error: LOCKED_MESSAGE };
    }

    // A verified factor exists but this session has not answered it. Hold the
    // sign-in — no activity entry, no tracked session — until it does.
    const gate = await teamMfaGate(membership);
    if (gate.state === "challenge") {
      const url = new URL(MFA_CHALLENGE_PATH, "http://local");
      if (requested !== TEAM_HOME) url.searchParams.set("next", requested);
      redirect(`${url.pathname}${url.search}`);
    }

    await recordTeamSignIn(membership, signedIn.session?.access_token ?? null);

    const home = await homeForTeamSession();
    if (home.startsWith("/login")) {
      await supabase.auth.signOut();
      const err = new URL(home, "http://local").searchParams.get("error");
      if (err === "locked") return { error: LOCKED_MESSAGE };
      return { error: GENERIC_FAILURE };
    }

    redirect(requested === TEAM_HOME ? home : requested);
  } catch (error) {
    // redirect() throws; that is success, not a failed action.
    if (isRedirectError(error)) throw error;
    return failureState(error);
  }
}

/** Portal sign-in — the dedicated client surface. */
export async function signInPortalAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  try {
    const parsed = credentialsSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) return { error: GENERIC_FAILURE };

    const supabase = await createSessionClient();
    const portalFirst = [
      ...(await listClientUsersByEmail(parsed.data.email)
        .then((rows) => rows.map(authAddress))
        .catch(() => [])),
      parsed.data.email.trim(),
    ];

    let signedIn = false;
    for (const address of [...new Set(portalFirst.map((a) => a.toLowerCase()))]) {
      const { error } = await supabase.auth.signInWithPassword({
        email: address,
        password: parsed.data.password,
      });
      if (!error) {
        signedIn = true;
        break;
      }
    }

    if (!signedIn) return { error: GENERIC_FAILURE };

    const home = await homeForPortalSession();
    if (home !== PORTAL_HOME) {
      await supabase.auth.signOut();
      return { error: "This account no longer has access." };
    }

    redirect(PORTAL_HOME);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return failureState(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Two-factor challenge — the step that makes enrolment a control              */
/* -------------------------------------------------------------------------- */

const challengeSchema = z.object({
  code: z.string().trim().min(6).max(10),
  next: z.string().optional(),
});

export type ChallengeState = { error: string | null; notice: string | null };

async function challengedMembership(): Promise<TeamUser | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getTeamUserByAuthId(user.id);
}

/** Answer the authenticator challenge and finish the held sign-in. */
export async function verifyMfaAction(
  _previous: ChallengeState,
  formData: FormData
): Promise<ChallengeState> {
  const parsed = challengeSchema.safeParse({
    code: formData.get("code"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { error: "Enter the six-digit code from your authenticator.", notice: null };
  }

  const membership = await challengedMembership();
  if (!membership) redirect("/login");

  const supabase = await createSessionClient();
  const factors = await supabase.auth.mfa.listFactors();
  const totp = factors.data?.totp?.[0] ?? null;

  if (!totp) {
    // The factor vanished between the password step and here.
    redirect("/onboarding/continue");
  }

  const { ipAddress } = await requestMeta();
  const db = createServiceClient();

  const verified = await supabase.auth.mfa.challengeAndVerify({
    factorId: totp.id,
    code: parsed.data.code,
  });

  if (verified.error) {
    await appendActivity(db, {
      actorTeamUserId: membership.id,
      actorEmail: membership.email,
      action: "mfa_challenge_failed",
      subjectTeamUserId: membership.id,
      ipAddress,
    });
    return { error: "That code is not valid. Try the current one.", notice: null };
  }

  await appendActivity(db, {
    actorTeamUserId: membership.id,
    actorEmail: membership.email,
    action: "mfa_challenge_passed",
    subjectTeamUserId: membership.id,
    ipAddress,
  });

  if (!membership.mfa_enabled) {
    await updateTeamUser(membership.id, { mfa_enabled: true, mfa_skipped: false });
  }

  await recordTeamSignIn(membership, verified.data?.access_token ?? null);

  const requested = safeDestination(parsed.data.next ?? null, TEAM_HOME);
  const home = await homeForTeamSession();
  if (home.startsWith("/login")) {
    await supabase.auth.signOut();
    return { error: GENERIC_FAILURE, notice: null };
  }

  redirect(requested === TEAM_HOME ? home : requested);
}

/**
 * A recovery code does not stand in for the authenticator — it retires it. The
 * code is spent, every factor on the identity is deleted, and the account is
 * sent back to enrolment, which is the only path that can raise a session to
 * aal2 again.
 */
export async function useRecoveryCodeAction(
  _previous: ChallengeState,
  formData: FormData
): Promise<ChallengeState> {
  const parsed = challengeSchema.safeParse({
    code: formData.get("code"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { error: "Enter one of your recovery codes.", notice: null };
  }

  const membership = await challengedMembership();
  if (!membership) redirect("/login");

  const spent = await consumeRecoveryCode(membership.id, parsed.data.code);
  if (!spent) {
    return { error: "That recovery code is not valid, or it is already used.", notice: null };
  }

  const db = createServiceClient();

  if (membership.user_id) {
    const factors = await db.auth.admin.mfa.listFactors({
      userId: membership.user_id,
    });
    for (const factor of factors.data?.factors ?? []) {
      await db.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: membership.user_id,
      });
    }
  }

  // Leave onboarding_step alone — the account is still fully onboarded, it
  // just owes a new factor before requireAdmin will let it through.
  await updateTeamUser(membership.id, {
    mfa_enabled: false,
    mfa_skipped: false,
  });

  const { ipAddress } = await requestMeta();
  await appendActivity(db, {
    actorTeamUserId: membership.id,
    actorEmail: membership.email,
    action: "mfa_recovery_used",
    subjectTeamUserId: membership.id,
    ipAddress,
  });

  redirect("/onboarding/continue");
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
