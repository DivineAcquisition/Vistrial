import { PageFrame } from "@/components/app/page-frame";
import { requireStaff } from "@/lib/auth/gates";
import { loadStaffHealth } from "@/lib/live/load";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent health" };

function ago(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

function Count({ value, tone }: { value: number; tone?: "warning" | "critical" | "brand" }) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-right tabular-nums",
        value === 0 && "text-muted-foreground",
        value > 0 && tone === "critical" && "font-medium text-destructive",
        value > 0 && tone === "warning" && "font-medium text-warning",
        value > 0 && tone === "brand" && "text-brand-300"
      )}
    >
      {value}
    </td>
  );
}

/** Staff only: agent health in every workspace this person is assigned to, worst first. */
export default async function AgentHealthPage() {
  await requireStaff();
  const rows = await loadStaffHealth();

  return (
    <PageFrame
      title="Agent health"
      description="Every workspace you can enter, with agents that are stopped or erroring listed first. Counts cover the last 24 hours."
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: "/app/agents/health", label: "Health" },
      ]}
    >
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">Workspace</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Working</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Waiting on a person</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Paused or stopped</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Erroring or stuck</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orgId} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium text-card-foreground">
                  {row.name}
                  {row.status !== "active" ? <span className="ml-2 text-xs text-muted-foreground">({row.status})</span> : null}
                </th>
                <Count value={row.working} tone="brand" />
                <Count value={row.waiting} tone="warning" />
                <Count value={row.stopped} />
                <Count value={row.erroring} tone="critical" />
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {row.lastActivityAt ? ago(row.lastActivityAt) : "None today"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No workspaces assigned to you.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}
