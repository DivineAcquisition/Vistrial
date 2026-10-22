import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { AgentSummaryProvider } from "@/components/agents/summary-provider";
import { AgentPanelProvider } from "@/components/live/agent-panel";
import { LiveProvider } from "@/components/live/live-provider";
import { RunViewerProvider } from "@/components/live/run-viewer";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { enforceHostForPerson } from "@/lib/domains/host-guard";
import { loadAgentSummary } from "@/lib/agents/summary-load";
import { loadCalmMode, loadLiveSnapshot, type LiveSnapshot } from "@/lib/live/load";
import { loadAttentionCounts } from "@/lib/shell/attention";
import { loadPaymentProblem } from "@/lib/billing/banner";
import { mfaPrompt, mfaSelf } from "@/lib/staff/mfa-check";
import { guardStaffSession } from "@/lib/staff/session";
import { loadHomeState } from "@/lib/workspace/home-state";
import { isTeamManager, salesOsEnabled } from "@/lib/sales-os/flag";
import { welcomeTourLink } from "@/lib/workspace/state";
import { redirect } from "next/navigation";
import packageJson from "../../../package.json";

export const dynamic = "force-dynamic";

/**
 * One shell for /app and /portal. Owners and staff move between the two all
 * the time (Overview to Results), so the sidebar must survive that hop
 * instead of unmounting and rebuilding. Each section gates access in its own
 * layout below this one.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  await enforceHostForPerson(ctx);
  const emptySnapshot: LiveSnapshot = {
    orgId: ctx.org.id,
    runs: [],
    events: [],
    controls: [],
    waiting: [],
    loadedAt: new Date().toISOString(),
  };
  const [counts, snapshot, calm, paymentProblem, session, mfa, home, summary, salesOs, manager] = await Promise.all([
    loadAttentionCounts(ctx),
    loadLiveSnapshot(ctx.org.id).catch(() => emptySnapshot),
    loadCalmMode(ctx.user.id).catch(() => false),
    loadPaymentProblem(ctx).catch(() => null),
    guardStaffSession(ctx),
    ctx.platformRole ? mfaSelf() : Promise.resolve(null),
    loadHomeState(ctx).catch(() => null),
    loadAgentSummary(ctx.org.id).catch(() => null),
    salesOsEnabled(ctx.org.id),
    isTeamManager(ctx.org.id).catch(() => false),
  ]);
  const agentic = Boolean(home?.available && home.enabled);
  const welcomeTour = home
    ? welcomeTourLink({
        role: ctx.workspaceRole,
        enabled: agentic,
        firstSeenAt: home.prefs.firstSeenAt,
        dismissedAt: home.prefs.welcomeDismissedAt,
        now: home.now,
      })
    : false;
  const prompt = mfaPrompt(mfa);
  if (prompt.lock) redirect("/security/setup?next=/app/team");

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <LiveProvider orgId={ctx.org.id} workspaceStatus={ctx.org.status} initial={snapshot} initialCalm={calm}>
        <AgentSummaryProvider orgId={ctx.org.id} initial={summary} salesOs={salesOs}>
        <RunViewerProvider staff={ctx.isStaff}>
          <AgentPanelProvider>
            <AppShell
              counts={counts}
              lostWorkspace={ctx.lostWorkspace}
              paymentProblem={paymentProblem}
              version={packageJson.version}
              staffSessionEndsAt={session?.state === "active" ? session.ends_at : null}
              mfaGraceUntil={prompt.graceUntil}
              agentic={agentic}
              welcomeTour={welcomeTour}
              salesOs={salesOs}
              manager={manager}
            >
              {children}
            </AppShell>
          </AgentPanelProvider>
        </RunViewerProvider>
        </AgentSummaryProvider>
      </LiveProvider>
    </OrgProvider>
  );
}
