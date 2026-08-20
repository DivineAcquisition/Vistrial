import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <AppShell>{children}</AppShell>
    </OrgProvider>
  );
}
