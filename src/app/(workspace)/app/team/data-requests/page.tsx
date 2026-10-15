import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Data requests" };

type Row = {
  id: string;
  org_name: string | null;
  kind: string;
  status: string;
  requested_by_name: string | null;
  created_at: string;
  scheduled_for: string | null;
};

export default async function DataRequestsPage() {
  await requireStaff();
  const db = await staffDb();
  const { data } = await db.from("data_requests").select("id, org_name, kind, status, requested_by_name, created_at, scheduled_for").order("created_at", { ascending: false }).limit(100);
  return (
    <PageFrame title="Data requests" description="A copy or a deletion. Nothing runs until a Platform Admin approves it.">
      <ul className="grid gap-3">
        {((data ?? []) as Row[]).map((row) => (
          <li key={row.id}>
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
              <Link href={`/app/team/data-requests/${row.id}`}>
                <span className="block text-sm text-white">
                  {row.org_name ?? "Deleted workspace"} · {row.kind === "export" ? "Copy" : "Deletion"}
                </span>
                <span className={helperClass}>
                  {row.requested_by_name ?? "Owner"}, {formatDayLong(row.created_at)}
                  {` · ${requestAgeDays(row.created_at)} days old`}
                  {requestNeedsAttention(row.status, row.created_at) ? " · older than 30 days" : ""}
                  {row.scheduled_for ? ` · scheduled ${formatDayLong(row.scheduled_for)}` : ""}
                </span>
              </Link>
              <StatusBadge label={row.status.replaceAll("_", " ")} tone={row.status === "completed" ? "good" : "warning"} />
            </Panel>
          </li>
        ))}
      </ul>
      {(data ?? []).length === 0 ? <p className={helperClass}>No data requests.</p> : null}
    </PageFrame>
  );
}
