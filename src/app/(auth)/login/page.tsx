import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { safeInternalPath } from "@/lib/auth/paths";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { defaultInternalPath, signedInPath } from "@/lib/domains/landing";
import { classifyProductHost } from "@/lib/marketing/hosts";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkIsStellarDaOperator } from "@/lib/stellar/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  const headerStore = await headers();
  const product = classifyProductHost(
    headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  );
  const redirectTo = safeInternalPath(params.redirect, defaultInternalPath(product));

  let user = null;
  if (isSupabaseConfigured()) {
    try {
      user = await getSessionUser();
    } catch {
      user = null;
    }
  }

  if (user) {
    const memberships = await listActiveMemberships(user.id);
    if (memberships.length > 0) {
      redirect(
        signedInPath({
          product,
          next: redirectTo,
          surfaceAccess: memberships[0]?.surfaceAccess,
        })
      );
    }
    if (await checkIsStellarDaOperator()) {
      redirect(signedInPath({ product, next: redirectTo, stellarDaOperator: true }));
    }
    redirect("/no-access");
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle={`Sign in to continue to ${APP_NAME}`}
      eyebrowLabel="Private access"
    >
      <LoginForm redirectTo={redirectTo} callbackError={params.error === "callback"} />
    </AuthCard>
  );
}
