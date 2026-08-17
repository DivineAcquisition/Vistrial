import { AppSidebar } from "@/components/app/app-sidebar";
import { OrgProvider } from "@/components/app/org-provider";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();

  return (
    <OrgProvider value={toClientOrgState(ctx)}>
      <div className="flex min-h-screen bg-ink-950 text-white">
        <AppSidebar />
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-8">{children}</main>
      </div>
    </OrgProvider>
  );
}
