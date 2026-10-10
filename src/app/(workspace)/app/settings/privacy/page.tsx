import { DataRequestForm } from "@/app/(workspace)/app/settings/privacy/privacy-form";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOwnerOrStaff } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { DATA_REQUEST_STATUS } from "@/lib/portal/requests";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Privacy" };

type DataRequestRow = {
  id: string;
  kind: "export" | "deletion";
  status: string;
  note: string | null;
  team_note: string | null;
  requested_by_name: string;
  created_at: string;
  resolved_at: string | null;
};

export default async function PrivacyPage() {
  const ctx = await requireOwnerOrStaff();
  const db = await portalDb();
  const { data } = await db
    .from("data_requests")
    .select("id, kind, status, note, team_note, requested_by_name, created_at, resolved_at")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as DataRequestRow[];
  const open = rows.filter((row) => row.status === "received" || row.status === "in_progress").map((row) => row.kind);

  return (
    <PageFrame title="Privacy" description="What Vistrial keeps for this workspace, and how to get a copy or have it deleted.">
      <Panel className="space-y-3 p-6">
        <h2 className={cardTitle}>What Vistrial keeps</h2>
        <ul className={`${helperClass} list-disc space-y-2 pl-5`}>
          <li>The lead details your CRM sends, and the case files, response times, and follow-up clocks built from them.</li>
          <li>Drafts Relay prepared, and who approved, changed, or turned each one down.</li>
          <li>Who did what in this workspace, so history stays under each person&apos;s name.</li>
        </ul>
        <p className={helperClass}>
          Vistrial reads from your CRM and never writes back to it. Deleting data here does not touch your CRM.
        </p>
      </Panel>

      <h2 className={cardTitle}>Ask for a copy or deletion</h2>
      <DataRequestForm openKinds={open} />

      {rows.length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Requests</h2>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {rows.map((row) => {
              const status = DATA_REQUEST_STATUS[row.status] ?? DATA_REQUEST_STATUS.received!;
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-white">
                      {row.kind === "export" ? "Copy of the data" : "Delete the data"}
                    </span>
                    <span className={helperClass}>
                      {row.requested_by_name}, {formatDayLong(row.created_at)}
                    </span>
                    {row.team_note ? <span className={`block ${helperClass}`}>Your team: {row.team_note}</span> : null}
                  </span>
                  <StatusBadge label={status.label} tone={status.tone} />
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
