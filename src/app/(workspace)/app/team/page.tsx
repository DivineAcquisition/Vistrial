import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatRelative } from "@/lib/format";
import { HEALTH_LABEL, HEALTH_ORDER, HEALTH_TONE } from "@/lib/staff/health";
import { loadQueueCounts, loadRoster } from "@/lib/staff/load";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass, metricValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Today" };

/** What changed, and what needs a person, across the workspaces this person works. */
export default async function StaffTodayPage() {
  const ctx = await requireStaff();
  const scope = ctx.isPlatformAdmin ? "all" : "mine";
  const db = await staffDb();
  const [{ rows }, counts, sinceResult, statesResult] = await Promise.all([
    loadRoster(scope),
    loadQueueCounts(scope),
    db.rpc("staff_mark_home_seen"),
    db.from("workspace_health_state").select("org_id, level, previous_level, changed_at"),
  ]);
  const since = typeof sinceResult.data === "string" ? sinceResult.data : new Date(0).toISOString();
  const now = new Date().toISOString();
  const changed = new Set(
    ((statesResult.data ?? []) as Array<{ org_id: string; level: string; previous_level: string | null; changed_at: string }>)
      .filter((row) => row.changed_at > since && row.previous_level && row.previous_level !== row.level)
      .map((row) => row.org_id)
  );
  const attention = [...rows]
    .filter((row) => row.health.level === "needs_attention" || row.health.level === "watch")
    .sort((a, b) => HEALTH_ORDER[a.health.level] - HEALTH_ORDER[b.health.level] || a.name.localeCompare(b.name));

  const figures = [
    { label: "Escalations", value: counts.escalations, href: "/app/team/queue" },
    { label: "Requests waiting", value: counts.requests, href: "/app/team/queue" },
    { label: "Overdue", value: counts.requests_overdue, href: "/app/team/queue" },
    { label: "Data requests", value: counts.data_requests, href: "/app/team/data-requests" },
    { label: "Runs to review", value: counts.failed_runs, href: "/app/team/agents" },
  ];

  return (
    <PageFrame
      title="Today"
      description={ctx.isPlatformAdmin ? "Every workspace." : "The workspaces assigned to you."}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {figures.map((figure) => (
          <Link key={figure.label} href={figure.href}>
            <Panel className="p-4">
              <p className={metricValue}>{figure.value}</p>
              <p className={helperClass}>{figure.label}</p>
            </Panel>
          </Link>
        ))}
      </div>

      <Panel className="p-6">
        <h2 className={cardTitle}>Needs a look</h2>
        {attention.length ? (
          <ul className="mt-3 divide-y divide-overlay/[0.06]">
            {attention.map((row) => (
              <li key={row.org_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <Link href={`/app/team/workspaces/${row.org_id}`} className="text-sm font-medium text-strong">
                    {row.name}
                  </Link>
                  <span className={`block ${helperClass}`}>
                    {row.health.factors[0]?.label ?? HEALTH_LABEL[row.health.level]}
                    {row.last_activity_at ? ` · last activity ${formatRelative(row.last_activity_at, now)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {changed.has(row.org_id) ? <StatusBadge label="Changed" tone="brand" /> : null}
                  <StatusBadge label={HEALTH_LABEL[row.health.level]} tone={HEALTH_TONE[row.health.level]} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>Nothing is flagged. Open the roster to look through the workspaces.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
