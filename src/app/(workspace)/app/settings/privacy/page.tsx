import { cancelDataRequestForm } from "@/app/(workspace)/app/settings/privacy/actions";
import { DataRequestForm } from "@/app/(workspace)/app/settings/privacy/privacy-form";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOwnerOrStaff } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { deletionTerms } from "@/lib/staff/copy";
import { staffDb } from "@/lib/staff/db";
import { DATA_REQUEST_STATUS, OPEN_DATA_REQUEST } from "@/lib/portal/requests";
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
  scheduled_for: string | null;
  export_expires_at: string | null;
  failure: string | null;
};

export default async function PrivacyPage() {
  const ctx = await requireOwnerOrStaff();
  const db = await portalDb();
  const staff = await staffDb();
  const [{ data }, { data: settings }] = await Promise.all([
    db
      .from("data_requests")
      .select("id, kind, status, note, team_note, requested_by_name, created_at, resolved_at, scheduled_for, export_expires_at, failure")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: false })
      .limit(20),
    staff.from("staff_support_settings").select("deletion_wait_days, export_link_days").eq("id", true).maybeSingle(),
  ]);
  const rows = (data ?? []) as DataRequestRow[];
  const open = rows.filter((row) => OPEN_DATA_REQUEST.has(row.status)).map((row) => row.kind);
  const waitDays = Number((settings as { deletion_wait_days?: number } | null)?.deletion_wait_days ?? 14);
  const linkDays = Number((settings as { export_link_days?: number } | null)?.export_link_days ?? 7);

  return (
    <PageFrame title="Privacy" description="What Vistrial keeps for this workspace, and how to get a copy or have it deleted.">
      <Panel className="space-y-3 p-6">
        <h2 className={cardTitle}>What Vistrial keeps</h2>
        <ul className={`${helperClass} list-disc space-y-2 pl-5`}>
          <li>The lead details your CRM sends, and the case files, response times, and follow-up clocks built from them.</li>
          <li>Drafts Relay prepared, and who approved, changed, or turned each one down.</li>
          <li>Who did what in this workspace, so history stays under each person&apos;s name.</li>
          <li>The wording of notices Vistrial sends you, for 90 days. The record that a notice was sent is kept for one year.</li>
        </ul>
        <p className={helperClass}>
          Vistrial reads from your CRM and never writes back to it. Deleting data here does not touch your CRM.
        </p>
        <ul className={`${helperClass} list-disc space-y-2 pl-5`}>
          {deletionTerms(waitDays).map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>A copy&apos;s download link works for {linkDays} days.</li>
        </ul>
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
                    {row.scheduled_for && row.status === "approved" ? (
                      <span className={`block ${helperClass}`}>Scheduled for {formatDayLong(row.scheduled_for)}. You can cancel before then.</span>
                    ) : null}
                    {row.failure ? <span className={`block ${helperClass}`}>{row.failure}</span> : null}
                    {row.kind === "export" && row.status === "completed" && row.export_expires_at && Date.parse(row.export_expires_at) > Date.parse(new Date().toISOString()) ? (
                      <a href={`/app/settings/privacy/export?id=${row.id}`} className="text-sm text-brand-300 underline">
                        Download
                      </a>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-end gap-2">
                    <StatusBadge label={status.label} tone={status.tone} />
                    {ctx.role === "owner" && (row.status === "received" || row.status === "in_review" || row.status === "approved") ? (
                      <form action={cancelDataRequestForm}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" className="text-sm text-brand-300 underline">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
