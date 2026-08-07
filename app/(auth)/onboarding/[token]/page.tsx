import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getTeamUserByInviteHash, updateTeamUser } from "@/lib/db/team";
import { APP_NAME } from "@/lib/constants";
import { hashToken } from "@/lib/portal/tokens";

export const metadata: Metadata = {
  title: `Team onboarding — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function OnboardingInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await getTeamUserByInviteHash(hashToken(token));

  if (!row) {
    return (
      <AuthCard title="That invitation is not valid">
        <p className="text-center text-sm text-flag-critical">
          It may already have been used. Ask an Owner or Admin to resend it.
        </p>
      </AuthCard>
    );
  }

  if (
    row.invitation_expires_at &&
    Date.parse(row.invitation_expires_at) <= Date.now()
  ) {
    await updateTeamUser(row.id, { invitation_status: "expired" });
    return (
      <AuthCard title="That invitation has expired">
        <p className="text-center text-sm text-flag-critical">
          Ask an Owner or Admin to resend it. Invitations last seven days.
        </p>
      </AuthCard>
    );
  }

  if (row.onboarding_step === "done" && row.status === "active") {
    redirect("/attention");
  }

  const step =
    row.password_set_at && row.onboarding_step === "password"
      ? "profile"
      : row.onboarding_step;

  return (
    <AuthCard
      width="wide"
      title="Set up your team account"
      subtitle="Four steps: a password, who you are, two-factor, and what the work is."
    >
      <OnboardingWizard
        token={token}
        initialStep={step}
        role={row.role}
        email={row.email}
        skipPassword={Boolean(row.password_set_at)}
        defaultTimezone="America/New_York"
      />
    </AuthCard>
  );
}
