import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { canWorkOperatorApp } from "@/lib/auth/permissions";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isPlatformAdmin)) {
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
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <AppShell
        needsMobileOutcomeTraining={
          ctx.role === "setter" && !training?.logged_outcome_from_mobile_at
        }
        needsCoachingAck={!training?.call_coaching_acknowledged_at}
      >
        {children}
      </AppShell>
    </OrgProvider>
  );
}

