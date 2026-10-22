import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultButton } from "@/components/staff/result-button";
import { setOperatorSummaries } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { formatRelative, orGap } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

type OperatorRow = {
  member_id: string;
  name: string;
  role: string;
  active: boolean;
  last_seen_at: string | null;
  follow_ups: number;
  corrections: number;
  drafts_approved: number;
  drafts_edited: number;
  drafts_rejected: number;
};

export default async function OperatorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireStaff();
  const db = await staffDb();
  const { data: allowed, error: allowedError } = await db.rpc("staff_operator_summaries_allowed", { p_org_id: id });
  if (allowedError) notFound();
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const now = to.toISOString();

  return (
    <PageFrame
      title="Operator summaries"
      description="The last 30 days. Follow-ups logged, case-file corrections, and draft decisions. Message contents are not here."
      actions={
        <Link href={`/app/team/workspaces/${id}`} className="text-sm text-brand-300 underline">
          Overview
        </Link>
      }
    >
      {ctx.isPlatformAdmin ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm text-strong">{allowed ? "Summaries are on." : "Summaries are off for this workspace."}</p>
          <ResultButton
            label={allowed ? "Turn off" : "Turn on"}
            action={() => setOperatorSummaries(id, !allowed, allowed ? "Turned off by a Platform Admin." : "")}
          />
        </Panel>
      ) : null}
      {allowed ? <OperatorTable orgId={id} from={from.toISOString()} to={now} /> : <p className={helperClass}>A Platform Admin turned these off.</p>}
    </PageFrame>
  );
}

async function OperatorTable({ orgId, from, to }: { orgId: string; from: string; to: string }) {
  const db = await staffDb();
  const [{ data, error }, { data: patterns }] = await Promise.all([
    db.rpc("staff_operator_activity", { p_org_id: orgId, p_from: from, p_to: to }),
    db.rpc("staff_workspace_patterns", { p_org_id: orgId, p_from: from, p_to: to }),
  ]);
  if (error) return <p className={helperClass}>{error.message}</p>;
  const rows = (data ?? []) as OperatorRow[];
  const pattern = (patterns ?? {}) as {
    evening?: { day_n?: number; evening_n?: number; day_median?: number | null; evening_median?: number | null };
    unowned_open?: number;
    removed_with_leads?: number;
  };
  return (
    <>
      <Panel className="overflow-hidden px-2 py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Follow-ups</TableHead>
              <TableHead>Corrections</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Edited</TableHead>
              <TableHead>Rejected</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.member_id}>
                <TableCell className="text-strong">
                  {row.name}
                  {!row.active ? <span className={helperClass}> · deactivated</span> : null}
                </TableCell>
                <TableCell>{row.follow_ups}</TableCell>
                <TableCell>{row.corrections}</TableCell>
                <TableCell>{row.drafts_approved}</TableCell>
                <TableCell>{row.drafts_edited}</TableCell>
                <TableCell>{row.drafts_rejected}</TableCell>
                <TableCell>{orGap(row.last_seen_at, (value) => formatRelative(value, to))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 ? <p className={`p-4 ${helperClass}`}>No operators in this window.</p> : null}
      </Panel>
      <Panel className="space-y-2 p-6">
        <h2 className={cardTitle}>Patterns, with the sample size</h2>
        <p className="text-sm text-strong">
          Daytime first responses: {pattern.evening?.day_n ?? 0}. Evening: {pattern.evening?.evening_n ?? 0}.
        </p>
        <p className={helperClass}>
          Median seconds, day {pattern.evening?.day_median == null ? "—" : Math.round(pattern.evening.day_median)}, evening{" "}
          {pattern.evening?.evening_median == null ? "—" : Math.round(pattern.evening.evening_median)}.
        </p>
        <p className={helperClass}>
          {pattern.unowned_open ?? 0} open leads have no operator. {pattern.removed_with_leads ?? 0} deactivated people still have open leads.
        </p>
      </Panel>
    </>
  );
}
