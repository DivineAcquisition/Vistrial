import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStaffContext } from "@/lib/auth/staff";
import { formatRelative } from "@/lib/format";
import { loadStaffOrgOverview, logStaffAccess } from "@/lib/onboarding/staff";
import { btnPrimary, btnSizeSm, helperClass } from "@/lib/ui";

export default async function OpsHomePage() {
  await getStaffContext();
  await logStaffAccess({ action: "list_orgs" });
  const rows = await loadStaffOrgOverview();
  const now = new Date().toISOString();
  const broken = rows.filter((row) => row.ingestionBroken);

  return (
    <PageFrame
      title="Clients"
      description="Find the workspace whose ingestion broke before they discover it themselves."
      actions={
        <Link href="/ops/orgs/new" className={`${btnPrimary} ${btnSizeSm}`}>
          New organization
        </Link>
      }
    >
      {broken.length > 0 ? (
        <Panel className="mb-8 border-flag-critical/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-critical">
            {broken.length} client{broken.length === 1 ? "" : "s"} with broken ingestion
          </p>
          <ul className="mt-3 space-y-1">
            {broken.map((row) => (
              <li key={row.id}>
                <Link href={`/ops/orgs/${row.id}`} className="text-sm text-brand-300">
                  {row.name}
                </Link>
                <span className="text-sm text-dim">
                  {" "}
                  · last event {row.lastEventAt ? formatRelative(row.lastEventAt, now) : "never"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <p className={`${helperClass} mb-6`}>No ingestion emergencies right now.</p>
      )}

      <Panel className="overflow-hidden px-2 py-2 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Activation</TableHead>
              <TableHead>Ingestion</TableHead>
              <TableHead>Last event</TableHead>
              <TableHead>Backfill</TableHead>
              <TableHead>Leads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/ops/orgs/${row.id}`} className="text-white hover:text-brand-300">
                    {row.name}
                  </Link>
                  <p className="text-xs text-dim">{row.slug}</p>
                </TableCell>
                <TableCell className="text-silver">
                  {row.activatedAt ? formatRelative(row.activatedAt, now) : "Not live"}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={row.ingestionBroken ? "broken" : row.crmStatus ?? "none"}
                    tone={row.ingestionBroken ? "critical" : row.crmStatus === "active" ? "good" : "warning"}
                  />
                </TableCell>
                <TableCell className="text-silver">
                  {row.lastEventAt ? formatRelative(row.lastEventAt, now) : "—"}
                </TableCell>
                <TableCell className="text-silver">{row.backfillGrade ?? row.backfillStatus ?? "—"}</TableCell>
                <TableCell className="text-silver">{row.leadsSinceActivation}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </PageFrame>
  );
}
