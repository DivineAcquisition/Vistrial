import { CoachingDisclosureNotice } from "@/components/app/coaching-disclosure";
import { MobileWalkthroughNotice } from "@/components/app/mobile-walkthrough";
import { RoleWelcome } from "@/components/app/role-welcome";
import { ROLE_WELCOME } from "@/lib/first-run";
import { getAuthContext } from "@/lib/auth/session";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  await redirectIfOnboardingIncomplete();
  const supabase = await createClient();
  const welcomeRole = !ctx.isStaff && (ctx.workspaceRole === "member" || ctx.workspaceRole === "operator") ? ctx.workspaceRole : null;
  const [{ data: training }, { data: welcome }] = await Promise.all([
    supabase
      .from("org_members")
      .select("logged_outcome_from_mobile_at, call_coaching_acknowledged_at")
      .eq("id", ctx.member.id)
      .maybeSingle(),
    welcomeRole
      ? (supabase as unknown as SupabaseClient)
          .from("onboarding_member_flags")
          .select("welcome_seen_at")
          .eq("org_id", ctx.org.id)
          .eq("member_id", ctx.member.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const showWelcome = welcomeRole !== null && !(welcome as { welcome_seen_at?: string | null } | null)?.welcome_seen_at;

  return (
    <>
      {showWelcome && welcomeRole ? <RoleWelcome copy={ROLE_WELCOME[welcomeRole]} /> : null}
      {isProductScopeEnabled("coaching") ? (
        <CoachingDisclosureNotice needed={!training?.call_coaching_acknowledged_at} />
      ) : null}
      <MobileWalkthroughNotice
        needed={(ctx.role === "setter" || ctx.role === "operator") && !training?.logged_outcome_from_mobile_at}
      />
      {children}
    </>
  );
}
