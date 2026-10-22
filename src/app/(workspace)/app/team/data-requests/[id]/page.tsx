import Link from "next/link";
import { notFound } from "next/navigation";

import { NoteBox, ResultButton } from "@/components/staff/result-button";
import { actOnDataRequest } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { deletionTerms, exportTerms } from "@/lib/staff/copy";
import { staffDb } from "@/lib/staff/db";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

type RequestRow = {
  id: string;
  org_id: string | null;
  org_name: string | null;
  kind: "export" | "deletion";
  status: string;
  note: string | null;
  requested_by_name: string | null;
  staff_created: boolean;
  verification_note: string | null;
  approval_note: string | null;
  scheduled_for: string | null;
  failure: string | null;
  team_note: string | null;
  updated_at: string;
  created_at: string;
  export_expires_at: string | null;
};

export default async function DataRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireStaff();
  const db = await staffDb();
  const { data } = await db.from("data_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as RequestRow;
  const { data: settings } = await db.from("staff_support_settings").select("deletion_wait_days, export_link_days").eq("id", true).maybeSingle();
  const waitDays = Number((settings as { deletion_wait_days?: number } | null)?.deletion_wait_days ?? 14);
  const linkDays = Number((settings as { export_link_days?: number } | null)?.export_link_days ?? 7);
  const block = row.org_id ? (await db.rpc("data_request_billing_block", { p_org_id: row.org_id })).data : null;
  const terms = row.kind === "deletion" ? deletionTerms(waitDays) : exportTerms(linkDays);

  return (
    <PageFrame
      title={row.kind === "deletion" ? "Deletion request" : "Copy request"}
      description={row.org_name ?? "The workspace has been deleted"}
      actions={<StatusBadge label={row.status.replaceAll("_", " ")} tone={row.status === "completed" ? "good" : "warning"} />}
    >
      <Panel className="space-y-2 p-6">
        <p className="text-sm text-strong">Asked by {row.requested_by_name ?? "an Owner"}{row.staff_created ? ", recorded by the team" : ""}.</p>
        <p className={requestNeedsAttention(row.status, row.created_at) ? "text-sm text-strong" : helperClass}>
          Opened {formatDateTime(row.created_at)}. {requestAgeDays(row.created_at)} days old.
          {requestNeedsAttention(row.status, row.created_at) ? " Older than the 30 day response aim." : ""}
        </p>
        {row.note ? <p className={helperClass}>{row.note}</p> : null}
        <ul className={`${helperClass} list-disc space-y-1 pl-5`}>
          {terms.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {typeof block === "string" ? <p className="text-sm text-strong">{block}</p> : null}
        {row.failure ? <p className="text-sm text-destructive">{row.failure}</p> : null}
        {row.scheduled_for ? <p className={helperClass}>Scheduled for {formatDateTime(row.scheduled_for)}.</p> : null}
        {row.verification_note ? <p className={helperClass}>Verified: {row.verification_note}</p> : null}
        {row.approval_note ? <p className={helperClass}>Approved: {row.approval_note}</p> : null}
        {row.team_note ? <p className={helperClass}>Note for the Owner: {row.team_note}</p> : null}
        {row.export_expires_at ? <p className={helperClass}>Download available until {formatDateTime(row.export_expires_at)}.</p> : null}
      </Panel>

      <Panel className="space-y-4 p-6">
        {row.status === "received" || row.status === "in_review" ? (
          <NoteBox
            label="How you confirmed this came from the Owner"
            action={(note) => actOnDataRequest({ id, action: "verify", note, expected: row.updated_at })}
          />
        ) : null}
        {ctx.isPlatformAdmin && row.status === "in_review" ? (
          <NoteBox
            label="Approval note"
            action={(note) => actOnDataRequest({ id, action: "approve", note, expected: row.updated_at })}
          />
        ) : null}
        {row.status !== "completed" && row.status !== "declined" && row.status !== "cancelled" && row.status !== "in_progress" ? (
          <>
            <NoteBox
              label="Decline, and say why. The Owner sees this."
              action={(note) => actOnDataRequest({ id, action: "decline", note, expected: row.updated_at })}
            />
            <ResultButton label="Cancel" variant="outline" action={() => actOnDataRequest({ id, action: "cancel", expected: row.updated_at })} />
          </>
        ) : null}
        <NoteBox label="Internal note" action={(note) => actOnDataRequest({ id, action: "note", note, expected: row.updated_at })} />
      </Panel>
      <Link href="/app/team/data-requests" className="text-sm text-brand-300 underline">
        All data requests
      </Link>
    </PageFrame>
  );
}
