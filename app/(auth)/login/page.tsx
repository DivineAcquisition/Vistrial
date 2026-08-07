import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, getTeamMembership, homeForTeamSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Sign in — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    const team = await getTeamMembership();
    if (team) {
      const home = await homeForTeamSession();
      if (!home.startsWith("/login")) redirect(home);
    }
  }

  const { next, error } = await searchParams;

  const lockedMessage =
    error === "locked"
      ? "This account is locked after too many failed sign-in attempts. An Owner has been notified."
      : error === "deactivated"
        ? "Invalid email or password."
        : error === "pending"
          ? "Finish your invitation onboarding using the link from your email."
          : null;

  return (
    <AuthCard
      title="Sign in"
      subtitle="For the Divine Acquisition team and for client portal accounts."
    >
      <LoginForm next={next} lockedMessage={lockedMessage} />
    </AuthCard>
  );
}
