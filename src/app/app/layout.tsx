import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import { loadAttentionCounts } from "@/lib/shell/attention";
import { createClient } from "@/lib/supabase/server";
import { enforceHostForPerson } from "@/lib/domains/host-guard";
import packageJson from "../../../package.json";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  await enforceHostForPerson(ctx);
  await redirectIfOnboardingIncomplete();
  const supabase = await createClient();
  const { data: training } = await supabase
    .from("org_members")
    .select("logged_outcome_from_mobile_at, call_coaching_acknowledged_at")
    .eq("id", ctx.member.id)
    .maybeSingle();

  const counts = await loadAttentionCounts(ctx);

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <AppShell
        counts={counts}
        lostWorkspace={ctx.lostWorkspace}
        version={packageJson.version}
        needsMobileOutcomeTraining={
          (ctx.role === "setter" || ctx.role === "operator") && !training?.logged_outcome_from_mobile_at
        }
        needsCoachingAck={!training?.call_coaching_acknowledged_at}
      >
        {children}
      </AppShell>
    </OrgProvider>
  );
}

