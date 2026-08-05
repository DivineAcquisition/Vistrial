import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-[240px] flex min-h-screen flex-1 flex-col">
        <Topbar />
        <div className="mx-auto w-full max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
