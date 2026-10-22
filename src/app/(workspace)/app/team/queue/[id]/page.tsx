import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultButton, NoteBox } from "@/components/staff/result-button";
import { actOnEscalation } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

type Escalation = {
  id: string;
  org_id: string;
  title: string;
  kind: string;
  rule: string | null;
  status: string;
  next_step: string | null;
  outcome: string | null;
  notified: Array<{ who?: string; at?: string }>;
  affected: number;
  created_at: string;
  updated_at: string;
  snoozed_until: string | null;
  snooze_reason: string | null;
};

export default async function EscalationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireStaff();
  const db = await staffDb();
  const [{ data }, { data: notes }, { data: org }] = await Promise.all([
    db.from("staff_escalations").select("*").eq("id", id).maybeSingle(),
    db.from("staff_item_notes").select("id, author_name, body, created_at").eq("item_kind", "escalation").eq("item_id", id).order("created_at"),
    db.from("staff_escalations").select("org_id, organizations(name)").eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const row = data as Escalation;
  const named = org as { organizations: { name: string } | { name: string }[] | null } | null;
  const workspace = Array.isArray(named?.organizations) ? named?.organizations[0]?.name : named?.organizations?.name;

  return (
    <PageFrame
      title={row.title}
      description={[workspace, row.kind.replaceAll("_", " ")].filter(Boolean).join(" · ")}
      actions={<StatusBadge label={row.status} tone={row.status === "resolved" ? "good" : row.status === "open" ? "critical" : "warning"} />}
    >
      <Panel className="space-y-3 p-6">
        {row.rule ? <p className="text-sm text-strong">{row.rule}</p> : null}
        {row.next_step ? <p className={helperClass}>Next: {row.next_step}</p> : null}
        <p className={helperClass}>
          {row.affected} affected · opened {formatDateTime(row.created_at)}
        </p>
        {Array.isArray(row.notified) && row.notified.length ? (
          <div>
            <h2 className={cardTitle}>Who was already told</h2>
            <ul className={`mt-2 ${helperClass} list-disc pl-5`}>
              {row.notified.map((item, index) => (
                <li key={index}>
                  {item.who ?? "Someone"}
                  {item.at ? ` · ${formatDateTime(item.at)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {row.outcome ? <p className="text-sm text-strong">Outcome: {row.outcome}</p> : null}
        {row.snooze_reason ? (
          <p className={helperClass}>
            Snoozed{row.snoozed_until ? ` until ${formatDateTime(row.snoozed_until)}` : ""}: {row.snooze_reason}
          </p>
        ) : null}
      </Panel>

      <Panel className="space-y-4 p-6">
        <h2 className={cardTitle}>Update</h2>
        <div className="flex flex-wrap gap-2">
          {row.status === "open" ? (
            <ResultButton label="Acknowledge" action={() => actOnEscalation({ id, action: "acknowledge", expected: row.updated_at })} />
          ) : null}
          {row.status !== "resolved" ? (
            <ResultButton label="I am working on this" variant="outline" action={() => actOnEscalation({ id, action: "working" })} />
          ) : (
            <ResultButton label="Reopen" action={() => actOnEscalation({ id, action: "reopen", expected: row.updated_at })} />
          )}
        </div>
        {row.status !== "resolved" ? (
          <NoteBox
            label="Resolve, with a short outcome"
            action={(note) => actOnEscalation({ id, action: "resolve", note, expected: row.updated_at })}
          />
        ) : null}
        <NoteBox label="Internal note" action={(note) => actOnEscalation({ id, action: "note", note, expected: row.updated_at })} />
        <p className={helperClass}>Notes here stay with the team. Customers do not see them.</p>
      </Panel>

      {(notes ?? []).length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Notes</h2>
          <ul className="mt-3 divide-y divide-overlay/[0.06]">
            {((notes ?? []) as Array<{ id: string; author_name: string; body: string; created_at: string }>).map((note) => (
              <li key={note.id} className="py-3">
                <p className="text-sm text-strong">{note.body}</p>
                <p className={helperClass}>
                  {note.author_name} · {formatDateTime(note.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Link href={`/app/team/workspaces/${row.org_id}`} className="text-sm text-brand-300 underline">
        Workspace overview
      </Link>
    </PageFrame>
  );
}
