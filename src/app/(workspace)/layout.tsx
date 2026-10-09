import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { AgentPanelProvider } from "@/components/live/agent-panel";
import { LiveProvider } from "@/components/live/live-provider";
import { RunViewerProvider } from "@/components/live/run-viewer";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { enforceHostForPerson } from "@/lib/domains/host-guard";
import { loadCalmMode, loadLiveSnapshot, type LiveSnapshot } from "@/lib/live/load";
import { loadAttentionCounts } from "@/lib/shell/attention";
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
  const [counts, snapshot, calm] = await Promise.all([
    loadAttentionCounts(ctx),
    loadLiveSnapshot(ctx.org.id).catch(() => emptySnapshot),
    loadCalmMode(ctx.user.id).catch(() => false),
  ]);

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <LiveProvider orgId={ctx.org.id} workspaceStatus={ctx.org.status} initial={snapshot} initialCalm={calm}>
        <RunViewerProvider staff={ctx.isStaff}>
          <AgentPanelProvider>
            <AppShell counts={counts} lostWorkspace={ctx.lostWorkspace} version={packageJson.version}>
              {children}
            </AppShell>
          </AgentPanelProvider>
        </RunViewerProvider>
      </LiveProvider>
    </OrgProvider>
  );
}
