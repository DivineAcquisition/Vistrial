import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { isOpsPath, safeInternalPath } from "@/lib/auth/paths";
import { isPlatformAdminUser } from "@/lib/auth/staff";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
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
    const platformAdmin = await isPlatformAdminUser(user.id);
    if (isOpsPath(redirectTo) && platformAdmin) {
      redirect(redirectTo);
    }
    if (memberships.length > 0) {
      redirect(redirectTo.startsWith("/app") ? redirectTo : "/app/queue");
    }
    if (platformAdmin) {
      redirect("/ops");
    }
    redirect("/no-access");
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Invite only. Use the email you were invited with."
      eyebrowLabel="Vistrial"
    >
      <LoginForm redirectTo={redirectTo} callbackError={params.error === "callback"} />
    </AuthCard>
  );
}
