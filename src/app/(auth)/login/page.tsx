import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { landingPath } from "@/lib/navigation";
import { safeInternalPath } from "@/lib/auth/paths";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeInternalPath(params.redirect);

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
        memberships[0]?.surfaceAccess === "portal" && !redirectTo.startsWith("/portal")
          ? "/portal"
          : redirectTo.startsWith("/app") || redirectTo.startsWith("/portal")
            ? redirectTo
            : landingPath(memberships[0]?.surfaceAccess)
      );
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
