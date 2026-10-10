import Link from "next/link";

import { DataRequestUpdateForm } from "@/app/(workspace)/app/team/requests/request-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { DATA_REQUEST_STATUS, HELP_STATUS, HELP_TOPICS, type HelpTopic } from "@/lib/portal/requests";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Requests" };

type HelpRow = {
  id: string;
  topic: HelpTopic;
  message: string;
  status: string;
  created_by_name: string;
  created_at: string;
  organizations: { name: string } | { name: string }[] | null;
};

type DataRow = {
  id: string;
  kind: "export" | "deletion";
  status: string;
  note: string | null;
  requested_by_name: string;
  created_at: string;
  organizations: { name: string } | { name: string }[] | null;
};

function orgName(value: { name: string } | { name: string }[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "A workspace";
  return value?.name ?? "A workspace";
}

function firstLine(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

/** Help and data requests across the workspaces this person works. Row security limits the list. */
export default async function TeamRequestsPage() {
  await requireStaff();
  const db = await portalDb();
  const [{ data: help }, { data: dataRequests }] = await Promise.all([
    db
      .from("help_requests")
      .select("id, topic, message, status, created_by_name, created_at, organizations(name)")
      .order("updated_at", { ascending: false })
      .limit(40),
    db
      .from("data_requests")
      .select("id, kind, status, note, requested_by_name, created_at, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <PageFrame title="Requests" description="Questions from workspaces, and asks for a copy or deletion of their data.">
      <Panel className="p-6">
        <h2 className={cardTitle}>Help</h2>
        {(help ?? []).length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {((help ?? []) as HelpRow[]).map((row) => {
              const status = HELP_STATUS[row.status] ?? HELP_STATUS.received!;
              return (
                <li key={row.id} className="py-3">
                  <Link href={`/app/team/requests/${row.id}`} className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-white">{firstLine(row.message)}</span>
                      <span className={helperClass}>
                        {orgName(row.organizations)} · {row.created_by_name} · {HELP_TOPICS[row.topic] ?? HELP_TOPICS.general} ·{" "}
                        {formatDayLong(row.created_at)}
                      </span>
                    </span>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>No help requests.</p>
        )}
      </Panel>

      <Panel className="space-y-4 p-6">
        <h2 className={cardTitle}>Data</h2>
        <p className={helperClass}>Mark these as you handle them. Nothing here exports or deletes data on its own.</p>
        {(dataRequests ?? []).length ? (
          <ul className="divide-y divide-white/[0.06]">
            {((dataRequests ?? []) as DataRow[]).map((row) => {
              const status = DATA_REQUEST_STATUS[row.status] ?? DATA_REQUEST_STATUS.received!;
              const open = row.status === "received" || row.status === "in_progress";
              return (
                <li key={row.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="block text-sm text-white">
                        {orgName(row.organizations)} asked for {row.kind === "export" ? "a copy" : "deletion"}
                      </span>
                      <span className={helperClass}>
                        {row.requested_by_name}, {formatDayLong(row.created_at)}
                        {row.note ? ` · ${row.note}` : ""}
                      </span>
                    </span>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </div>
                  {open ? <DataRequestUpdateForm requestId={row.id} status={row.status} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={helperClass}>No data requests.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
