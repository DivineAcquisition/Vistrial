import { PageFrame } from "@/components/app/page-frame";
import { requireStaff } from "@/lib/auth/gates";
import { loadCopyHealth, loadStaffHealth, type CopyHealth } from "@/lib/live/load";
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

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums text-card-foreground", warn && "font-medium text-warning")}>{value}</dd>
    </div>
  );
}

/** How fast agent changes reach the screens, and whether the two records agree. */
function CopyPanel({ copy }: { copy: CopyHealth }) {
  const delay = copy.delay;
  const drift = copy.drift;
  return (
    <section aria-labelledby="copy-health" className="mb-4 rounded-2xl border border-border bg-card p-4">
      <h2 id="copy-health" className="text-sm font-medium text-card-foreground">Agent record copy</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Screens read a copy of the agent record. Delay is from a change to the copy, over the last hour. Drift is checked hourly.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact label="Changes copied" value={delay ? String(delay.events) : "Not available"} />
        <Fact label="Typical delay" value={delay ? `${delay.p50Ms} ms` : "Not available"} />
        <Fact label="Slowest 5 percent" value={delay ? `${delay.p95Ms} ms` : "Not available"} warn={Boolean(delay && delay.p95Ms > 2000)} />
        <Fact label="Over 2 seconds" value={delay ? String(delay.over2s) : "Not available"} warn={Boolean(delay && delay.over2s > 0)} />
        <Fact label="Waiting to copy" value={delay ? String(delay.backlog) : "Not available"} warn={Boolean(delay && delay.backlog > 0)} />
        <Fact label="Last drift check" value={drift ? ago(drift.checkedAt) : "Not run yet"} />
        <Fact label="Workspaces that disagree" value={drift ? `${drift.drifted} of ${drift.workspaces}` : "Not run yet"} warn={Boolean(drift && drift.drifted > 0)} />
        <Fact
          label="Runs missing or different"
          value={drift ? String(drift.missingInPostgres + drift.missingInConvex + drift.statusMismatch) : "Not run yet"}
          warn={Boolean(drift && drift.missingInPostgres + drift.missingInConvex + drift.statusMismatch > 0)}
        />
      </dl>
    </section>
  );
}

/** Staff only: agent health in every workspace this person is assigned to, worst first. */
export default async function AgentHealthPage() {
  await requireStaff();
  const [rows, copy] = await Promise.all([loadStaffHealth(), loadCopyHealth()]);

  return (
    <PageFrame
      title="Agent health"
      description="Every workspace you can enter, with agents that are stopped or erroring listed first. Counts cover the last 24 hours."
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: "/app/agents/health", label: "Health" },
      ]}
    >
      <CopyPanel copy={copy} />
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
