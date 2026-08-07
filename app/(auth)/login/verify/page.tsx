import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { AuthCard } from "@/components/auth/auth-card";
import { getCurrentUser, getTeamMembership, homeForTeamSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { teamMfaGate } from "@/lib/team/mfa-session";

export const metadata: Metadata = {
  title: `Two-factor — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

// Reads the live session's AAL — must not be prerendered as a baked /login redirect.
export const dynamic = "force-dynamic";

/**
 * The second half of a team sign-in. The password already succeeded, so a
 * session exists — but it sits at aal1 and no team surface will serve it until
 * the factor challenge here is answered.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const team = await getTeamMembership();
  if (!team) redirect("/login");

  const gate = await teamMfaGate(team);
  if (gate.state === "enrol") redirect("/onboarding/continue");
  if (gate.state === "satisfied") redirect(await homeForTeamSession());

  const { next } = await searchParams;

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle="One more step to finish signing in"
    >
      <p className="text-center text-sm text-silver">
        Signing in as <span className="text-white">{team.email}</span>
      </p>
      <MfaChallengeForm next={next} />
    </AuthCard>
  );
}
