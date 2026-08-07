import Logo from "@/components/brand/logo";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Backdrop } from "@/components/ui/backdrop";
import { APP_NAME, APP_OWNER } from "@/lib/constants";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <div className="relative z-10">
        <Sidebar />

        <div className="flex min-h-screen min-w-0 flex-col pl-60">
          <Topbar />

          <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>

          <footer className="hairline-glow relative border-t border-white/[0.06] px-4 py-8 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Logo markOnly className="h-6 w-auto opacity-70" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {APP_NAME} appointment ledger
                  </p>
                  <p className="text-xs text-dim">Internal to {APP_OWNER}</p>
                </div>
              </div>
              <p className="text-xs text-dim">Paid per confirmed appointment</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
