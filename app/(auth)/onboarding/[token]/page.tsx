import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel max-w-md rounded-2xl px-7 py-8 text-center">
          <p className="text-sm text-flag-critical">
            That invitation is not valid, or it has already been used.
          </p>
        </div>
      </main>
    );
  }

  if (
    row.invitation_expires_at &&
    Date.parse(row.invitation_expires_at) <= Date.now()
  ) {
    await updateTeamUser(row.id, { invitation_status: "expired" });
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel max-w-md rounded-2xl px-7 py-8 text-center">
          <p className="text-sm text-flag-critical">
            That invitation has expired. Ask an Owner or Admin to resend it.
          </p>
        </div>
      </main>
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="panel w-full max-w-xl rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <div className="mt-8">
          <OnboardingWizard
            token={token}
            initialStep={step}
            role={row.role}
            email={row.email}
            skipPassword={Boolean(row.password_set_at)}
            defaultTimezone="America/New_York"
          />
        </div>
      </div>
    </main>
  );
}
