import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getCurrentUser, getTeamMembership } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Continue setup — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

/** Migrated Owner (and MFA re-prompts) resume here without an invite token. */
export default async function OnboardingContinuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const team = await getTeamMembership();
  if (!team) redirect("/login");
  if (team.onboarding_step === "done" && team.mfa_enabled) {
    redirect("/attention");
  }

  const step =
    team.migrated_from_single_admin && team.onboarding_step === "password"
      ? "profile"
      : team.onboarding_step === "done" && !team.mfa_enabled
        ? "mfa"
        : team.onboarding_step;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="panel w-full max-w-xl rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <div className="mt-8">
          <OnboardingWizard
            initialStep={step === "done" ? "mfa" : step}
            role={team.role}
            email={team.email}
            skipPassword
            resumeOnly
            defaultTimezone={team.timezone ?? "America/New_York"}
          />
        </div>
      </div>
    </main>
  );
}
