import { redirect } from "next/navigation";

import { CoachingDisclosureNotice } from "@/components/app/coaching-disclosure";
import { MobileWalkthroughNotice } from "@/components/app/mobile-walkthrough";
import { getAuthContext } from "@/lib/auth/session";
import { canWorkOperatorApp } from "@/lib/auth/permissions";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isStaff)) {
    redirect("/portal");
  }
  await redirectIfOnboardingIncomplete();
  const supabase = await createClient();
  const { data: training } = await supabase
    .from("org_members")
    .select("logged_outcome_from_mobile_at, call_coaching_acknowledged_at")
    .eq("id", ctx.member.id)
    .maybeSingle();

  return (
    <>
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
