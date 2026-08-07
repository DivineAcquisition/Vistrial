import "server-only";

import { cache } from "react";

import { createSessionClient } from "@/lib/supabase/session";
import type { TeamRole, TeamUser } from "@/types/database";

/**
 * Two-factor authentication as a control rather than a checkbox.
 *
 * Enrolling a factor during onboarding only records intent. What makes it real
 * is this gate: every team surface asks whether the *current session* reached
 * `aal2`, and refuses to serve the ledger until it has. Owners and Admins may
 * not hold a session without a factor at all.
 */

export const MFA_CHALLENGE_PATH = "/login/verify";

/** Owners and Admins must hold a factor; Members may choose to. */
export function mfaMandatoryFor(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

export type SessionAssurance = {
  currentLevel: string | null;
  nextLevel: string | null;
  /** The session carries at least one verified factor that can be challenged. */
  hasVerifiedFactor: boolean;
  /** The session has already answered a factor challenge. */
  elevated: boolean;
};

/**
 * Reads the assurance level off the access token. This decodes the JWT the
 * session already holds, so it is cheap enough to run on every guarded page.
 */
export const sessionAssurance = cache(async (): Promise<SessionAssurance> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const currentLevel = data?.currentLevel ?? null;
  const nextLevel = data?.nextLevel ?? null;

  return {
    currentLevel,
    nextLevel,
    hasVerifiedFactor: nextLevel === "aal2",
    elevated: currentLevel === "aal2",
  };
});

export type MfaGate =
  /** Nothing owed: either elevated, or no factor is required of this role. */
  | { state: "satisfied" }
  /** A factor exists and the session has not answered it yet. */
  | { state: "challenge" }
  /** The role requires a factor and none is enrolled. */
  | { state: "enrol" };

export async function teamMfaGate(team: TeamUser): Promise<MfaGate> {
  const assurance = await sessionAssurance();

  if (assurance.hasVerifiedFactor) {
    return assurance.elevated ? { state: "satisfied" } : { state: "challenge" };
  }

  // No verified factor on the identity. `mfa_enabled` may still be true if the
  // factor was deleted out from under us (recovery code, admin reset); trust
  // Auth over the flag and send mandatory roles back to enrolment.
  if (mfaMandatoryFor(team.role)) return { state: "enrol" };

  return { state: "satisfied" };
}

/** Where a session owing two-factor work has to go before anything else. */
export function mfaDetour(gate: MfaGate): string | null {
  if (gate.state === "challenge") return MFA_CHALLENGE_PATH;
  if (gate.state === "enrol") return "/onboarding/continue";
  return null;
}
