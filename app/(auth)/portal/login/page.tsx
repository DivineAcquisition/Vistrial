import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { getCurrentUser, homeForPortalSession } from "@/lib/auth";
import { APP_NAME, APP_OWNER } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Client sign in — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    const home = await homeForPortalSession();
    if (home === "/portal") redirect(home);
  }

  const { error } = await searchParams;

  return (
    <AuthCard
      eyebrowLabel={`${APP_OWNER} · Client portal`}
      title="Client sign in"
      subtitle="Your appointments, your definition, and what you have been charged."
    >
      {error === "closed" ? (
        <p role="alert" className="text-center text-sm text-flag-critical">
          This account no longer has access.
        </p>
      ) : null}

      <PortalLoginForm />

      <p className="mt-4 text-center text-xs text-dim">
        Part of the Divine Acquisition team?{" "}
        <Link
          href="/login"
          className="text-brand-300 transition-colors hover:text-brand-200"
        >
          Sign in here
        </Link>
      </p>
    </AuthCard>
  );
}
