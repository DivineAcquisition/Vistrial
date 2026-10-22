import Link from "next/link";

import { DeleteViewButton, QueueFilterForm, SaveViewForm } from "@/app/(workspace)/app/team/onboarding/staff-ui";
import { CreateWorkspaceForm } from "@/app/(workspace)/app/team/team-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { listPlanPrices } from "@/lib/billing/stripe";
import { loadQueue, type QueueRow } from "@/lib/onboarding/load";
import { QUEUE_RISK_LABEL, filterQueue, queueParams, queueRisk, readQueueFilters, sortQueue } from "@/lib/onboarding/queue";
import { PHASE_LABEL, WAITING_ON_LABEL, waitingText } from "@/lib/onboarding/stages";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Every workspace in setup, with what it waits on and how worried to be.
 * A Platform Admin sees all of them; Service Team only their assignments
 * (the database decides). Stuck first, then ready for review.
 */
export default async function OnboardingQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireStaff();
  const filters = readQueueFilters(await searchParams);
  const db = await staffDb();

  const [rows, { data: canCreate }, { data: views }] = await Promise.all([
    loadQueue(ctx.isPlatformAdmin ? "all" : "mine", filters.settled),
    db.rpc("onboarding_can_create_workspaces"),
    db.from("staff_saved_views").select("id, name, params").eq("user_id", ctx.user.id).eq("page", "onboarding").order("name"),
  ]);
  const now = Date.parse(new Date().toISOString());
  const shown = sortQueue(filterQueue(rows, filters, ctx.user.id, now), now);
  const params = queueParams(filters);

  const create = canCreate === true ? await createFormData(db) : null;

  return (
    <PageFrame
      title="Onboarding"
      description={
        ctx.isPlatformAdmin
          ? "Every workspace in setup: where it is, who it waits on, and what to do next."
          : "The workspaces assigned to you that are in setup."
      }
    >
      {ctx.isPlatformAdmin ? (
        <Link href="/app/team/onboarding/settings" className="self-start text-sm text-brand-300 underline underline-offset-2">
          Onboarding settings
        </Link>
      ) : null}
      <QueueFilterForm filters={params} showMine={ctx.isPlatformAdmin} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Saved views" className="flex flex-wrap items-center gap-2">
          {((views ?? []) as Array<{ id: string; name: string; params: Record<string, string> }>).map((view) => (
            <span key={view.id} className="flex items-center gap-1">
              <Link href={`/app/team/onboarding?${new URLSearchParams(view.params ?? {}).toString()}`} className="text-sm text-brand-300 underline underline-offset-2">
                {view.name}
              </Link>
              <DeleteViewButton id={view.id} name={view.name} />
            </span>
          ))}
        </nav>
        {Object.keys(params).length ? <SaveViewForm params={params} /> : null}
      </div>

      <p className={helperClass} role="status">
        {shown.length === rows.length ? `${rows.length} workspaces.` : `${shown.length} of ${rows.length} workspaces match.`}
      </p>

      {shown.length === 0 ? (
        <Panel className="p-6">
          <p className={helperClass}>{rows.length ? "Nothing matches these filters." : "No workspaces are in setup right now."}</p>
        </Panel>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {shown.map((row) => (
              <li key={row.org_id}>
                <QueueCard row={row} now={now} />
              </li>
            ))}
          </ul>

          <Panel className="hidden overflow-hidden px-2 py-2 sm:px-4 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Now</TableHead>
                  <TableHead>Waiting on</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="hidden lg:table-cell">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => {
                  const phase = PHASE_LABEL[row.phase];
                  const risk = QUEUE_RISK_LABEL[queueRisk(row, now)];
                  return (
                    <TableRow key={row.org_id}>
                      <TableCell className="text-strong">
                        <Link href={`/app/team/onboarding/${row.org_id}`} className="underline-offset-2 hover:underline">
                          {row.name}
                        </Link>
                        <div className={helperClass}>
                          {row.done_count} of {row.total_count} stages done
                          {row.template_name ? ` · ${row.template_name}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={phase.label} tone={phase.tone} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-strong">{row.current_stage_label ?? "Nothing open"}</div>
                        {row.next_action ? <div className={helperClass}>Next: {row.next_action}</div> : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-strong">{WAITING_ON_LABEL[row.waiting_on]}</div>
                        {row.waiting_on !== "nobody" && row.waiting_since ? <div className={helperClass}>{waitingText(row.waiting_since, now)}</div> : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={risk.label} tone={risk.tone} />
                        {row.stuck && row.stuck_reason ? <div className={helperClass}>{row.stuck_reason}</div> : null}
                      </TableCell>
                      <TableCell className="hidden text-sm text-silver lg:table-cell">
                        {row.assigned.length ? row.assigned.map((person) => person.name).join(", ") : "Nobody assigned"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      {create ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>New workspace</h2>
          <p className={helperClass}>Creates the workspace with every agent off and invites the Owner. Nobody is charged.</p>
          <div className="mt-4">
            <CreateWorkspaceForm templates={create.templates} staff={create.staff} plans={create.plans} />
          </div>
        </Panel>
      ) : null}
    </PageFrame>
  );
}

function QueueCard({ row, now }: { row: QueueRow; now: number }) {
  const phase = PHASE_LABEL[row.phase];
  const risk = QUEUE_RISK_LABEL[queueRisk(row, now)];
  return (
    <Panel className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/app/team/onboarding/${row.org_id}`} className="min-w-0 truncate font-medium text-strong underline-offset-2 hover:underline" title={row.name}>
          {row.name}
        </Link>
        <StatusBadge label={risk.label} tone={risk.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={phase.label} tone={phase.tone} />
        <span className={helperClass}>
          {row.done_count} of {row.total_count} done
        </span>
      </div>
      <p className="text-sm text-strong">{row.current_stage_label ?? "Nothing open"}</p>
      <p className={helperClass}>
        Waiting on: {WAITING_ON_LABEL[row.waiting_on]}
        {row.waiting_on !== "nobody" && row.waiting_since ? ` (${waitingText(row.waiting_since, now)})` : ""}
      </p>
      {row.stuck && row.stuck_reason ? <p className={helperClass}>{row.stuck_reason}</p> : null}
    </Panel>
  );
}

async function createFormData(db: Awaited<ReturnType<typeof staffDb>>) {
  const [{ data: templates }, { data: staff }, plans] = await Promise.all([
    db.from("config_templates").select("id, name").eq("status", "active").order("name"),
    db.from("platform_staff").select("user_id, display_name, role").eq("active", true).order("display_name"),
    listPlanPrices().catch(() => [] as Array<{ id: string; label: string }>),
  ]);
  return {
    templates: (templates ?? []) as Array<{ id: string; name: string }>,
    staff: (staff ?? []) as Array<{ user_id: string; display_name: string; role: string }>,
    plans,
  };
}
