import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { enforceHostForPerson } from "@/lib/domains/host-guard";
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
  const counts = await loadAttentionCounts(ctx);

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <AppShell counts={counts} lostWorkspace={ctx.lostWorkspace} version={packageJson.version}>
        {children}
      </AppShell>
    </OrgProvider>
  );
}
