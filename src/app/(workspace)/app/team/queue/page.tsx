import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatRelative } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Requests and escalations" };

type Escalation = { id: string; org_id: string; title: string; kind: string; status: string; created_at: string };
type Help = {
  id: string;
  org_id: string;
  message: string;
  status: string;
  created_by_name: string;
  waiting_since: string | null;
  flagged_at: string | null;
  escalated_at: string | null;
};
type DataReq = { id: string; org_id: string | null; org_name: string | null; kind: string; status: string; created_at: string };

function firstLine(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

/** Requests and escalations. The word for the nav item is Queue; the page says what it holds. */
export default async function QueuePage() {
  await requireStaff();
  const db = await staffDb();
  const now = new Date().toISOString();
  const [{ data: escalations }, { data: requests }, { data: dataRequests }, { data: orgs }] = await Promise.all([
    db.from("staff_escalations").select("id, org_id, title, kind, status, created_at").neq("status", "resolved").order("created_at", { ascending: false }).limit(80),
    db
      .from("help_requests")
      .select("id, org_id, message, status, created_by_name, waiting_since, flagged_at, escalated_at")
      .in("status", ["received", "in_progress"])
      .order("waiting_since", { ascending: true })
      .limit(80),
    db
      .from("data_requests")
      .select("id, org_id, org_name, kind, status, created_at")
      .in("status", ["received", "in_review", "approved", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(40),
    db.from("organizations").select("id, name"),
  ]);
  const names = new Map(((orgs ?? []) as Array<{ id: string; name: string }>).map((org) => [org.id, org.name]));

  return (
    <PageFrame title="Requests and escalations" description="Customer questions, alerts that reached the team, and asks for a copy or deletion.">
      <Panel className="p-6">
        <h2 className={cardTitle}>Escalations</h2>
        {(escalations ?? []).length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {((escalations ?? []) as Escalation[]).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/app/team/queue/${row.id}`} className="min-w-0">
                  <span className="block text-sm text-white">{row.title}</span>
                  <span className={helperClass}>
                    {names.get(row.org_id) ?? "A workspace"} · {row.kind.replaceAll("_", " ")} · {formatRelative(row.created_at, now)}
                  </span>
                </Link>
                <StatusBadge label={row.status} tone={row.status === "open" ? "critical" : "warning"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>No open escalations.</p>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Customer requests</h2>
        {(requests ?? []).length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {((requests ?? []) as Help[]).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/app/team/requests/${row.id}`} className="min-w-0">
                  <span className="block text-sm text-white">{firstLine(row.message)}</span>
                  <span className={helperClass}>
                    {names.get(row.org_id) ?? "A workspace"} · {row.created_by_name}
                    {row.waiting_since ? ` · waiting ${formatRelative(row.waiting_since, now)}` : ""}
                  </span>
                </Link>
                <span className="flex gap-2">
                  {row.escalated_at ? <StatusBadge label="With a Platform Admin" tone="critical" /> : null}
                  {row.flagged_at && !row.escalated_at ? <StatusBadge label="Overdue" tone="warning" /> : null}
                  <StatusBadge label={row.status === "received" ? "Waiting" : "In progress"} tone="neutral" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>No requests are waiting.</p>
        )}
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className={cardTitle}>Data requests</h2>
          <Link href="/app/team/data-requests" className="text-sm text-brand-300 underline">
            All data requests
          </Link>
        </div>
        {(dataRequests ?? []).length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {((dataRequests ?? []) as DataReq[]).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 py-3">
                <Link href={`/app/team/data-requests/${row.id}`} className="text-sm text-white">
                  {row.org_name ?? names.get(row.org_id ?? "") ?? "A workspace"} · {row.kind === "export" ? "Copy" : "Deletion"}
                </Link>
                <StatusBadge label={row.status.replaceAll("_", " ")} tone="warning" />
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>No open data requests.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
