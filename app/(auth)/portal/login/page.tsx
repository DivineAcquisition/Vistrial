import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-[380px] rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <p className="mt-1.5 text-center text-xs text-dim">
          {APP_OWNER} client portal
        </p>

        {error === "closed" ? (
          <p role="alert" className="mt-4 text-center text-sm text-flag-critical">
            This account no longer has access.
          </p>
        ) : null}

        <PortalLoginForm />
      </div>
    </main>
  );
}
