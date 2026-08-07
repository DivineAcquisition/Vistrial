import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getCurrentUser, getTeamMembership } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { MFA_CHALLENGE_PATH, teamMfaGate } from "@/lib/team/mfa-session";

export const metadata: Metadata = {
  title: `Continue setup — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

// Session + MFA gate — must not be prerendered as a baked redirect to /login.
export const dynamic = "force-dynamic";

/** Migrated Owner (and MFA re-prompts) resume here without an invite token. */
export default async function OnboardingContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const team = await getTeamMembership();
  if (!team) redirect("/login");

  // Ask Auth, not the stored flag: a factor deleted by a recovery code or an
  // Admin reset leaves `mfa_enabled` true while the identity has nothing to
  // challenge. Reading the gate here is what keeps this page and requireAdmin
  // from bouncing a session back and forth between them.
  const gate = await teamMfaGate(team);
  if (gate.state === "challenge") redirect(MFA_CHALLENGE_PATH);

  // Members who skipped are asked once more at sign-in; that ask arrives with
  // ?prompt=mfa, and is the one case where a settled account still stops here.
  const { prompt } = await searchParams;
  const invited = prompt === "mfa" && !team.mfa_enabled;

  if (team.onboarding_step === "done" && gate.state === "satisfied" && !invited) {
    redirect("/attention");
  }

  const step =
    team.migrated_from_single_admin && team.onboarding_step === "password"
      ? "profile"
      : team.onboarding_step === "done"
        ? "mfa"
        : team.onboarding_step;

  return (
    <AuthCard
      width="wide"
      title="Finish setting up your account"
      subtitle={
        gate.state === "enrol"
          ? "Your role requires two-factor authentication before the ledger will open."
          : "Pick up where you left off."
      }
    >
      <OnboardingWizard
        initialStep={step}
        role={team.role}
        email={team.email}
        skipPassword
        resumeOnly
        defaultTimezone={team.timezone ?? "America/New_York"}
      />
    </AuthCard>
  );
}
