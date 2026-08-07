"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin, requirePermission, type AdminUser } from "@/lib/auth";
import {
  countActiveOwners,
  getTeamUserByAuthId,
  getTeamUserByEmail,
  getTeamUserById,
  getTeamUserByInviteHash,
  insertTeamUser,
  listActiveOwners,
  refreshExpiredInvitations,
  revokeAllTeamSessions,
  revokeTeamSession,
  updateTeamUser,
} from "@/lib/db/team";
import { deliverTeamInvitation } from "@/lib/notifications/team";
import { baseUrl } from "@/lib/origin";
import { hashToken, mintToken } from "@/lib/portal/tokens";
import {
  cancelInviteSchema,
  changePasswordSchema,
  changeRoleSchema,
  inviteTeamSchema,
  onboardingMfaConfirmSchema,
  onboardingMfaSkipSchema,
  onboardingPasswordSchema,
  onboardingProfileSchema,
  resendInviteSchema,
  teamUserIdSchema,
  updateOwnProfileSchema,
} from "@/lib/schemas/team";
import { appendActivity } from "@/lib/team/activity";
import { authAddress, createAuthIdentity } from "@/lib/team/auth-identity";
import {
  generateRecoveryCodes,
  replaceRecoveryCodes,
} from "@/lib/team/mfa";
import { mfaMandatoryFor } from "@/lib/team/mfa-session";
import { isPasswordAcceptable } from "@/lib/team/password";
import { PermissionError, isPermissionError } from "@/lib/team/permissions";
import { requestMeta } from "@/lib/team/request-meta";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";
import type { TeamRole, TeamUser } from "@/types/database";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

const INVITE_DAYS = 7;

function describeIssues(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

function failureMessage(error: unknown): string {
  if (isPermissionError(error)) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

function refreshTeam(paths: string[] = []): void {
  revalidatePath("/team");
  revalidatePath("/team/activity");
  revalidatePath("/account");
  for (const path of paths) revalidatePath(path);
}

async function issueInviteToken(teamId: string): Promise<{
  token: string;
  expiresAt: string;
}> {
  const token = mintToken();
  const expiresAt = new Date(
    Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  await updateTeamUser(teamId, {
    invitation_token_hash: hashToken(token),
    invitation_expires_at: expiresAt,
    invitation_status: "pending",
    status: "pending",
  });
  return { token, expiresAt };
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                 */
/* -------------------------------------------------------------------------- */

export async function inviteTeamUserAction(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = inviteTeamSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    if (parsed.data.role === "owner" && admin.team.role !== "owner") {
      return { ok: false, error: "Only an Owner can invite another Owner." };
    }

    const existing = await getTeamUserByEmail(parsed.data.email);
    if (existing && (existing.status === "active" || existing.status === "locked")) {
      return {
        ok: false,
        error: "That address already holds an active team account.",
      };
    }
    if (existing && existing.status === "pending" && existing.invitation_status === "pending") {
      return {
        ok: false,
        error: "That address already has a pending invitation. Resend it instead.",
      };
    }

    // A client portal person may be invited here under the same address. The
    // two rows are never joined; onboarding gives the team side its own Auth
    // identity, aliased when Auth has already handed the plain address to the
    // portal (see lib/team/auth-identity.ts).

    const { ipAddress } = await requestMeta();
    let row: TeamUser;

    if (existing && existing.status === "deactivated") {
      row = await updateTeamUser(existing.id, {
        role: parsed.data.role,
        status: "pending",
        onboarding_step: "password",
        invitation_status: "pending",
        invited_by: admin.team.id,
        invited_by_label: admin.email,
        invited_at: new Date().toISOString(),
        deactivated_at: null,
        deactivated_by: null,
        user_id: existing.user_id,
        password_set_at: existing.password_set_at,
      });
    } else {
      row = await insertTeamUser({
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        status: "pending",
        onboarding_step: "password",
        invitation_status: "pending",
        invited_by: admin.team.id,
        invited_by_label: admin.email,
        invited_at: new Date().toISOString(),
      });
    }

    const { token, expiresAt } = await issueInviteToken(row.id);
    const origin = await baseUrl();
    const inviteUrl = `${origin}/onboarding/${token}`;

    const delivery = await deliverTeamInvitation({
      membership: { ...row, role: parsed.data.role },
      inviteUrl,
      expiresAt,
      invitedByLabel: admin.email,
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "invitation_sent",
      subjectTeamUserId: row.id,
      ipAddress,
      detail: { role: parsed.data.role, email: row.email },
    });

    refreshTeam([`/team/${row.id}`]);

    if (delivery.status === "failed") {
      return {
        ok: false,
        error: `The invitation was created, but the email did not send: ${delivery.error}`,
      };
    }

    return { ok: true, data: { email: row.email } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function resendTeamInviteAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = resendInviteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await getTeamUserById(parsed.data.id);
    if (!row || row.invitation_status === "cancelled") {
      return { ok: false, error: "That invitation is not pending." };
    }
    if (row.status === "active" && row.onboarding_step === "done") {
      return { ok: false, error: "That person already has an active account." };
    }

    const { token, expiresAt } = await issueInviteToken(row.id);
    const origin = await baseUrl();
    const delivery = await deliverTeamInvitation({
      membership: row,
      inviteUrl: `${origin}/onboarding/${token}`,
      expiresAt,
      invitedByLabel: admin.email,
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "invitation_resent",
      subjectTeamUserId: row.id,
    });

    refreshTeam();
    if (delivery.status === "failed") {
      return {
        ok: false,
        error: `A new link was issued, but the email did not send: ${delivery.error}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function cancelTeamInviteAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = cancelInviteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await getTeamUserById(parsed.data.id);
    if (!row) return { ok: false, error: "Invitation not found." };

    await updateTeamUser(row.id, {
      invitation_status: "cancelled",
      invitation_token_hash: null,
      invitation_expires_at: null,
      status: row.user_id ? row.status : "deactivated",
      deactivated_at: row.user_id ? row.deactivated_at : new Date().toISOString(),
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "invitation_cancelled",
      subjectTeamUserId: row.id,
    });

    refreshTeam();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

async function loadInvitee(token: string | undefined): Promise<TeamUser> {
  if (token) {
    const row = await getTeamUserByInviteHash(hashToken(token));
    if (!row) throw new Error("That invitation is not valid, or it has already been used.");
    if (
      row.invitation_expires_at &&
      Date.parse(row.invitation_expires_at) <= Date.now()
    ) {
      await updateTeamUser(row.id, { invitation_status: "expired" });
      throw new Error("That invitation has expired. Ask an Owner or Admin for a new one.");
    }
    return row;
  }

  // Migrated Owner / resume without token: session must already exist.
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) throw new Error("Sign in to continue onboarding.");
  const row = await getTeamUserByAuthId(user.id);
  if (!row) throw new Error("No team account found for this session.");
  return row;
}

export async function onboardingSetPasswordAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = onboardingPasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };
    if (!isPasswordAcceptable(parsed.data.password)) {
      return { ok: false, error: "Password must be at least 12 characters." };
    }

    const row = await loadInvitee(parsed.data.token);
    if (row.onboarding_step !== "password" && row.password_set_at) {
      // Password once set persists — advance if they revisit.
      return { ok: true };
    }

    const db = createServiceClient();

    // The address Auth will know this person by. Usually their own; a tagged
    // alias when the portal already holds the plain one.
    let identityAddress = authAddress(row);

    if (!row.user_id) {
      const created = await createAuthIdentity(db, {
        email: row.email,
        password: parsed.data.password,
        population: "team",
        appMetadata: { team_user_id: row.id },
      });

      if ("error" in created) return { ok: false, error: created.error };

      identityAddress = created.authEmail ?? row.email;
      await updateTeamUser(row.id, {
        user_id: created.userId,
        auth_email: created.authEmail,
        password_set_at: new Date().toISOString(),
        onboarding_step: "profile",
      });
    } else {
      const { error } = await db.auth.admin.updateUserById(row.user_id, {
        password: parsed.data.password,
      });
      if (error) return { ok: false, error: error.message };
      await updateTeamUser(row.id, {
        password_set_at: new Date().toISOString(),
        onboarding_step: "profile",
      });
    }

    // Sign them in so later steps have a session (MFA enroll needs one).
    const session = await createSessionClient();
    await session.auth.signInWithPassword({
      email: identityAddress,
      password: parsed.data.password,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function onboardingProfileAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = onboardingProfileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await loadInvitee(parsed.data.token);
    if (row.onboarding_step === "password" && !row.password_set_at) {
      return { ok: false, error: "Set a password before continuing." };
    }

    await updateTeamUser(row.id, {
      full_name: parsed.data.full_name,
      job_title: parsed.data.job_title || null,
      phone: parsed.data.phone || null,
      timezone: parsed.data.timezone,
      onboarding_step: "mfa",
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function onboardingStartMfaAction(input: unknown): Promise<
  ActionResult<{ factorId: string; qr: string; secret: string; recoveryCodes: string[] }>
> {
  try {
    const parsed = onboardingMfaSkipSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await loadInvitee(parsed.data.token);
    const session = await createSessionClient();
    const { data, error } = await session.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Vistrial",
    });
    if (error || !data) {
      return {
        ok: false,
        error:
          error?.message ??
          "Could not start two-factor setup. Confirm MFA is enabled in Supabase Auth.",
      };
    }

    const recoveryCodes = generateRecoveryCodes();
    await replaceRecoveryCodes(row.id, recoveryCodes);

    return {
      ok: true,
      data: {
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        recoveryCodes,
      },
    };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function onboardingConfirmMfaAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = onboardingMfaConfirmSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await loadInvitee(parsed.data.token);
    const session = await createSessionClient();

    const challenge = await session.auth.mfa.challenge({
      factorId: parsed.data.factor_id,
    });
    if (challenge.error || !challenge.data) {
      return { ok: false, error: challenge.error?.message ?? "Could not verify the code." };
    }

    const verified = await session.auth.mfa.verify({
      factorId: parsed.data.factor_id,
      challengeId: challenge.data.id,
      code: parsed.data.code,
    });
    if (verified.error) {
      return { ok: false, error: verified.error.message };
    }

    const alreadyActive = row.status === "active" && row.joined_at !== null;
    await updateTeamUser(row.id, {
      mfa_enabled: true,
      mfa_skipped: false,
      onboarding_step: alreadyActive ? "done" : "orientation",
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: row.id,
      actorEmail: row.email,
      action: "mfa_enabled",
      subjectTeamUserId: row.id,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function onboardingSkipMfaAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = onboardingMfaSkipSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await loadInvitee(parsed.data.token);
    if (mfaMandatoryFor(row.role)) {
      return {
        ok: false,
        error: "Owners and Admins must enable two-factor authentication.",
      };
    }

    const alreadyActive = row.status === "active" && row.joined_at !== null;
    await updateTeamUser(row.id, {
      mfa_skipped: true,
      mfa_enabled: false,
      // Re-prompt skip must not reopen onboarding for an active Member.
      onboarding_step: alreadyActive ? "done" : "orientation",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function onboardingCompleteAction(
  input: unknown
): Promise<ActionResult> {
  // Everything that can fail happens inside the try. The redirect is deliberately
  // outside it: Next signals redirects by throwing, and a catch here would turn a
  // successful hand-off into { ok: false } for an account already marked active.
  try {
    const parsed = onboardingMfaSkipSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const row = await loadInvitee(parsed.data.token);
    if (row.onboarding_step !== "orientation" && row.onboarding_step !== "done") {
      return { ok: false, error: "Finish the earlier onboarding steps first." };
    }

    // No exception for reaching orientation: an Owner or Admin without a factor
    // could not sign in afterwards anyway, so let them fix it here.
    if (mfaMandatoryFor(row.role) && !row.mfa_enabled) {
      return {
        ok: false,
        error: "Enable two-factor authentication before finishing.",
      };
    }

    const now = new Date().toISOString();
    await updateTeamUser(row.id, {
      status: "active",
      onboarding_step: "done",
      joined_at: row.joined_at ?? now,
      invitation_status: row.invitation_status === "pending" ? "accepted" : row.invitation_status,
      invitation_accepted_at: row.invitation_accepted_at ?? now,
      invitation_token_hash: null,
      invitation_expires_at: null,
    });

    // Ensure at least one Owner remains (bootstrap / invite Owner paths).
    const owners = await countActiveOwners();
    if (owners === 0) {
      await updateTeamUser(row.id, { role: "owner" });
    }

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: row.id,
      actorEmail: row.email,
      action: "invitation_accepted",
      subjectTeamUserId: row.id,
    });
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }

  redirect("/attention");
}

/* -------------------------------------------------------------------------- */
/* User management                                                             */
/* -------------------------------------------------------------------------- */

async function guardOwnerTarget(
  admin: AdminUser,
  target: TeamUser,
  action: "role" | "deactivate"
): Promise<string | null> {
  if (target.role !== "owner") return null;
  if (action === "role" && admin.team.role !== "owner") {
    return "Only an Owner can change an Owner's role.";
  }
  if (action === "deactivate") {
    if (admin.team.role !== "owner") {
      return "Only an Owner can deactivate an Owner.";
    }
    const owners = await countActiveOwners();
    if (owners <= 1 && target.status === "active") {
      return "The system refuses any action that would leave zero Owners.";
    }
  }
  return null;
}

export async function changeTeamRoleAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = changeRoleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    if (parsed.data.id === admin.team.id) {
      return { ok: false, error: "You cannot change your own role." };
    }

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    const denied = await guardOwnerTarget(admin, target, "role");
    if (denied) return { ok: false, error: denied };

    if (parsed.data.role !== "owner" && target.role === "owner") {
      const owners = await countActiveOwners();
      if (owners <= 1 && target.status === "active") {
        return {
          ok: false,
          error: "The system refuses any action that would leave zero Owners.",
        };
      }
    }

    if (parsed.data.role === "owner" && admin.team.role !== "owner") {
      return { ok: false, error: "Only an Owner can promote someone to Owner." };
    }

    const previous = target.role;
    await updateTeamUser(target.id, { role: parsed.data.role as TeamRole });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "role_changed",
      subjectTeamUserId: target.id,
      detail: { from: previous, to: parsed.data.role },
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function deactivateTeamUserAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    if (parsed.data.id === admin.team.id) {
      return { ok: false, error: "You cannot deactivate yourself." };
    }

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    const denied = await guardOwnerTarget(admin, target, "deactivate");
    if (denied) return { ok: false, error: denied };

    await updateTeamUser(target.id, {
      status: "deactivated",
      deactivated_at: new Date().toISOString(),
      deactivated_by: admin.team.id,
    });

    await revokeAllTeamSessions(target.id);
    if (target.user_id) {
      const db = createServiceClient();
      await db.auth.admin.signOut(target.user_id, "global");
    }

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "user_deactivated",
      subjectTeamUserId: target.id,
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function reactivateTeamUserAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    await updateTeamUser(target.id, {
      status: "active",
      deactivated_at: null,
      deactivated_by: null,
      locked_at: null,
      failed_sign_in_count: 0,
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "user_reactivated",
      subjectTeamUserId: target.id,
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function unlockTeamUserAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    await updateTeamUser(target.id, {
      status: "active",
      locked_at: null,
      failed_sign_in_count: 0,
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "account_unlocked",
      subjectTeamUserId: target.id,
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function forcePasswordResetAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    await updateTeamUser(target.id, { force_password_reset: true });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "force_password_reset",
      subjectTeamUserId: target.id,
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function requireMfaResetAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    // Leave onboarding_step alone. The account is still fully onboarded; it
    // simply owes a new factor, and requireAdmin will route it to enrolment.
    await updateTeamUser(target.id, {
      mfa_enabled: false,
      mfa_skipped: false,
    });

    if (target.user_id) {
      const auth = createServiceClient();
      const factors = await auth.auth.admin.mfa.listFactors({
        userId: target.user_id,
      });
      for (const factor of factors.data?.factors ?? []) {
        await auth.auth.admin.mfa.deleteFactor({
          id: factor.id,
          userId: target.user_id,
        });
      }
    }

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "mfa_disabled",
      subjectTeamUserId: target.id,
      detail: { required_reset: true },
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function revokeAllSessionsAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requirePermission("manage_users");
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const target = await getTeamUserById(parsed.data.id);
    if (!target) return { ok: false, error: "User not found." };

    await revokeAllTeamSessions(target.id);
    if (target.user_id) {
      const db = createServiceClient();
      await db.auth.admin.signOut(target.user_id, "global");
    }

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "sessions_revoked",
      subjectTeamUserId: target.id,
    });

    refreshTeam([`/team/${target.id}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Own account                                                                 */
/* -------------------------------------------------------------------------- */

export async function updateOwnProfileAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const parsed = updateOwnProfileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    await updateTeamUser(admin.team.id, {
      full_name: parsed.data.full_name,
      job_title: parsed.data.job_title || null,
      phone: parsed.data.phone || null,
      timezone: parsed.data.timezone,
    });

    refreshTeam();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function changeOwnPasswordAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    const session = await createSessionClient();
    const attempt = await session.auth.signInWithPassword({
      // The Auth address, which differs from the contact address whenever a
      // portal account already claimed this email.
      email: authAddress(admin.team),
      password: parsed.data.current_password,
    });
    if (attempt.error) {
      return { ok: false, error: "Current password is incorrect." };
    }

    const { error } = await session.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) return { ok: false, error: error.message };

    await updateTeamUser(admin.team.id, {
      password_set_at: new Date().toISOString(),
      force_password_reset: false,
    });

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "password_changed",
      subjectTeamUserId: admin.team.id,
    });

    refreshTeam();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function revokeOwnSessionAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const parsed = teamUserIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

    await revokeTeamSession(parsed.data.id, admin.team.id);

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "session_revoked",
      subjectTeamUserId: admin.team.id,
      detail: { session_id: parsed.data.id },
    });

    refreshTeam();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function regenerateOwnRecoveryCodesAction(): Promise<
  ActionResult<{ recoveryCodes: string[] }>
> {
  try {
    const admin = await requireAdmin();
    if (!admin.team.mfa_enabled) {
      return { ok: false, error: "Enable two-factor authentication first." };
    }
    const codes = generateRecoveryCodes();
    await replaceRecoveryCodes(admin.team.id, codes);

    const db = createServiceClient();
    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "mfa_recovery_regenerated",
      subjectTeamUserId: admin.team.id,
    });

    return { ok: true, data: { recoveryCodes: codes } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/** Used by pages that only need to tick expired invitation rows. */
export async function syncInvitationExpiry(): Promise<void> {
  await requirePermission("manage_users");
  await refreshExpiredInvitations();
}

export async function listOwnersForLockoutNotice(): Promise<string[]> {
  const owners = await listActiveOwners();
  return owners.map((o) => o.email);
}

export { PermissionError };
