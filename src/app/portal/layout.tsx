import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { requirePortalAccess } from "@/lib/portal/access";
import { enforceHostForPerson } from "@/lib/domains/host-guard";
import { loadAttentionCounts } from "@/lib/shell/attention";
import packageJson from "../../../package.json";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess();
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
