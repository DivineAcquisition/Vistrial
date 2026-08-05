import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { APP_NAME, APP_OWNER } from "@/lib/constants";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-950 text-white antialiased">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-col pl-60">
        <Topbar />

        <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>

        <footer className="border-t border-white/[0.06] px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">
              {APP_NAME} appointment ledger · internal to {APP_OWNER}
            </p>
            <p className="text-xs text-neutral-600">
              Paid per confirmed appointment
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
