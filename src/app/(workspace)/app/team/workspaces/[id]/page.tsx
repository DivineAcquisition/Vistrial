import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { NoteBox, ResultButton } from "@/components/staff/result-button";
import { addStaffNote, archiveStaffNote } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { STAGE_STATUS_LABEL, readSteps } from "@/lib/onboarding/stages";
import { requireStaff } from "@/lib/auth/gates";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { formatDateTime, formatRelative, orGap } from "@/lib/format";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/staff/health";
import { loadConnections, loadRoster } from "@/lib/staff/load";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";
import { workspaceStatus } from "@/lib/workspaces/status";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function WorkspaceOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireStaff();
  const { rows } = await loadRoster(ctx.isPlatformAdmin ? "all" : "mine", id);
  const row = rows[0];
  if (!row) notFound();
  const now = new Date().toISOString();
  const status = workspaceStatus(row.status);
  const response =
    row.response_decided > 0 ? `${Math.round((row.response_within / row.response_decided) * 100)}% of ${row.response_decided}` : "Not enough leads yet";

  return (
    <PageFrame
      title={row.name}
      description={row.template_name ? `Template: ${row.template_name}` : row.slug}
      status={HEALTH_LABEL[row.health.level]}
      statusTone={HEALTH_TONE[row.health.level]}
      actions={
        row.is_platform_workspace ? null : (
          <Link href={`/app/team/enter?org=${row.org_id}&next=/app/home`} className="text-sm font-medium text-brand-300 underline">
            Enter workspace
          </Link>
        )
      }
    >
      <Panel className="p-6">
        <h2 className={cardTitle}>1. Status</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          {row.is_test_workspace ? <StatusBadge label="Test" tone="neutral" /> : null}
        </div>
        {row.status_reason ? <p className={`mt-2 ${helperClass}`}>{row.status_reason}</p> : null}
        <ul className="mt-3 space-y-1">
          {row.health.factors.map((factor) => (
            <li key={factor.key} className="text-sm text-strong">
              {factor.label}
              <span className={`block ${helperClass}`}>{factor.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>2. People</h2>
        <KeyValue label="Primary contact">
          {row.primary_contact?.name || row.primary_contact?.email || "Not recorded"}
          {row.primary_contact?.email ? <span className={`block ${helperClass}`}>{row.primary_contact.email}</span> : null}
        </KeyValue>
        <KeyValue label="Assigned">
          {row.assigned.length ? row.assigned.map((person) => person.name).join(", ") : "Unassigned. Platform Admins cover it."}
        </KeyValue>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>3. Setup</h2>
        <p className={helperClass}>
          {row.status === "onboarding"
            ? `Onboarding${row.went_live_at ? "" : ", not live yet"}.`
            : `Went live ${orGap(row.went_live_at, (value) => formatDateTime(value))}.`}
        </p>
        {readSteps(row.onboarding_steps).length ? (
          <ul className={`mt-2 ${helperClass} list-disc pl-5`}>
            {readSteps(row.onboarding_steps).map((step) => (
              <li key={step.key}>
                {step.label}: {STAGE_STATUS_LABEL[step.status].label}
                {step.note ? ` — ${step.note}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={`/app/team/onboarding/${row.org_id}`} className="mt-3 inline-block text-sm text-brand-300 underline underline-offset-2">
          Open the onboarding workbench
        </Link>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <h2 className={cardTitle}>4. Response</h2>
          <p className="mt-2 text-sm text-strong">{response} reached in time, this period.</p>
          <p className={helperClass}>{row.open_alerts} open response alerts.</p>
        </Panel>
        <Panel className="p-6">
          <h2 className={cardTitle}>5. Agents</h2>
          <p className="mt-2 text-sm text-strong">
            {row.runs_24h} runs in 24 hours, {row.failed_runs_24h} not yet reviewed.
          </p>
          {row.paused_agents.length ? (
            <ul className={`mt-2 ${helperClass} list-disc pl-5`}>
              {row.paused_agents.map((agent) => (
                <li key={`${agent.agent}-${agent.platform ? "halt" : "pause"}`}>
                  {AGENTS[agent.agent as LiveAgentId]?.name ?? agent.agent}
                  {agent.platform ? " halted for every workspace" : agent.by_owner ? " paused by the Owner" : " paused"}
                  {agent.reason ? `: ${agent.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className={helperClass}>Nothing is paused.</p>
          )}
          <Link href="/app/team/agents" className="mt-2 inline-block text-sm text-brand-300 underline">
            Agent oversight
          </Link>
        </Panel>
        <Panel className="p-6">
          <h2 className={cardTitle}>6. Approvals</h2>
          <p className="mt-2 text-sm text-strong">{row.pending_approvals} waiting.</p>
          <p className={helperClass}>
            Oldest: {orGap(row.oldest_pending_at, (value) => formatRelative(value, now))}
          </p>
        </Panel>
        <Panel className="p-6">
          <h2 className={cardTitle}>7. Requests</h2>
          <p className="mt-2 text-sm text-strong">
            {row.requests_waiting} waiting, {row.requests_overdue} overdue, {row.requests_escalated} with a Platform Admin.
          </p>
          <Link href="/app/team/queue" className="mt-2 inline-block text-sm text-brand-300 underline">
            Open the queue
          </Link>
        </Panel>
      </div>

      <Suspense fallback={<Panel className="p-6"><p className={helperClass}>Loading connections…</p></Panel>}>
        <ConnectionSection orgId={row.org_id} />
      </Suspense>

      <Panel className="p-6">
        <h2 className={cardTitle}>9. Billing</h2>
        {row.billing_visible ? (
          <p className="mt-2 text-sm text-strong">
            {row.billing_status ?? "No subscription recorded"}
            {row.payment_failed_at ? " · the last payment failed" : ""}
            {row.cancel_at_period_end ? " · cancels at the period end" : ""}
          </p>
        ) : (
          <p className={`mt-2 ${helperClass}`}>Billing is hidden for your role.</p>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>10. Data requests</h2>
        <p className="mt-2 text-sm text-strong">{row.data_requests_open} open.</p>
        <Link href="/app/team/data-requests" className="text-sm text-brand-300 underline">
          Data requests
        </Link>
      </Panel>

      <Suspense fallback={<Panel className="p-6"><p className={helperClass}>Loading notes…</p></Panel>}>
        <Notes orgId={row.org_id} userId={ctx.user.id} admin={ctx.isPlatformAdmin} />
      </Suspense>

      <Panel className="p-6">
        <h2 className={cardTitle}>12. Operators</h2>
        <p className={helperClass}>Counts of follow-ups, corrections, and draft decisions. No message contents.</p>
        <Link href={`/app/team/workspaces/${row.org_id}/operators`} className="text-sm text-brand-300 underline">
          Operator summaries
        </Link>
      </Panel>
    </PageFrame>
  );
}

async function ConnectionSection({ orgId }: { orgId: string }) {
  const rows = await loadConnections("all", orgId);
  const bad = rows.filter((row) => row.state !== "ok");
  return (
    <Panel className="p-6">
      <h2 className={cardTitle}>8. Connections</h2>
      {bad.length ? (
        <ul className="mt-2 space-y-1">
          {bad.map((row) => (
            <li key={`${row.kind}-${row.label}`} className="text-sm text-strong">
              {row.label}: {row.state.replaceAll("_", " ")}
              {row.last_error ? <span className={`block ${helperClass}`}>{row.last_error}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-2 ${helperClass}`}>Every connection that is set up is working.</p>
      )}
      <Link href="/app/team/connections" className="mt-2 inline-block text-sm text-brand-300 underline">
        All connections
      </Link>
    </Panel>
  );
}

async function Notes({ orgId, userId, admin }: { orgId: string; userId: string; admin: boolean }) {
  const db = await staffDb();
  const { data } = await db
    .from("staff_notes")
    .select("id, author_user_id, author_name, body, created_at, archived_at")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const notes = (data ?? []) as Array<{ id: string; author_user_id: string; author_name: string; body: string; created_at: string }>;
  return (
    <Panel className="space-y-4 p-6">
      <h2 className={cardTitle}>11. Team notes</h2>
      <p className={helperClass}>Only the Vistrial team sees these. They are never in a customer export or on a customer page.</p>
      <ul className="divide-y divide-overlay/[0.06]">
        {notes.map((note) => (
          <li key={note.id} className="flex items-start justify-between gap-3 py-3">
            <span>
              <span className="block text-sm text-strong">{note.body}</span>
              <span className={helperClass}>
                {note.author_name} · {formatDateTime(note.created_at)}
              </span>
            </span>
            {note.author_user_id === userId || admin ? (
              <ResultButton label="Archive" variant="outline" action={() => archiveStaffNote(note.id, orgId)} />
            ) : null}
          </li>
        ))}
      </ul>
      <NoteBox label="Add a note" action={(body) => addStaffNote(orgId, body)} />
    </Panel>
  );
}
