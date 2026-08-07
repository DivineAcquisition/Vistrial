import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, getTeamMembership, homeForTeamSession } from "@/lib/auth";
import { APP_NAME, APP_OWNER } from "@/lib/constants";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-[380px] rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <p className="mt-1.5 text-center text-xs text-dim">{APP_OWNER} team</p>

        <LoginForm next={next} lockedMessage={lockedMessage} />
      </div>
    </main>
  );
}
