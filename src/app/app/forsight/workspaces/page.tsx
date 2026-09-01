import Link from "next/link";
import { notFound } from "next/navigation";

import { ForsightTabs } from "@/app/app/forsight/forsight-chrome";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadWorkspaceOverview } from "@/lib/forsight/workspaces";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { formatMetric, metricReason } from "@/lib/forsight/values";
import { OpenWorkspace } from "@/app/app/forsight/workspaces/open-workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "All workspaces · Forsight" };

const SOURCE_LABELS: Record<string, string> = {
  airtable: "Airtable",
  vistrial_core: "Vistrial core",
};

export default async function ForsightWorkspacesPage() {
  const rows = await loadWorkspaceOverview();
  // Not an empty list. For a client user this page is not a thing that exists.
  if (!rows) notFound();

  return (
    <PageFrame
      title="All workspaces"
      eyebrow="Divine Acquisition only"
      description="Every workspace's headline numbers on one screen. Last month's report: whether it exists, which version, and whether anyone has sent it."
      toolbar={<ForsightTabs activeHref={`${FORSIGHT_PATH}/workspaces`} isPlatformAdmin />}
    >
      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Cost / audit held</TableHead>
              <TableHead className="text-right">CAC</TableHead>
              <TableHead className="text-right">Never contacted</TableHead>
              <TableHead className="text-right">Going quiet</TableHead>
              <TableHead className="text-right">Debriefs missing</TableHead>
              <TableHead className="text-right">
                {rows[0]?.reportPeriodLabel ?? "Last month"} report
              </TableHead>
              <TableHead>Sent</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.orgId}>
                <TableCell className="font-medium text-card-foreground">{row.name}</TableCell>
                <TableCell className="text-silver">
                  {row.sourceType ? SOURCE_LABELS[row.sourceType] ?? row.sourceType : "Not set up"}
                </TableCell>
                <TableCell
                  className="text-right tabular-nums"
                  title={metricReason(row.costPerAuditHeld) ?? undefined}
                >
                  {formatMetric(row.costPerAuditHeld, "currency")}
                </TableCell>
                <TableCell
                  className="text-right tabular-nums"
                  title={metricReason(row.cac) ?? undefined}
                >
                  {formatMetric(row.cac, "currency")}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${row.neverContacted ? "text-destructive" : ""}`}
                >
                  {row.neverContacted ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.goingQuiet ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.debriefsMissing ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.reportVersion ? `v${row.reportVersion}` : "Not generated"}
                </TableCell>
                <TableCell className="text-silver">
                  {row.reportVersion ? (row.reportSentAt ? "Sent" : "Not sent") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.sourceType ? (
                    <OpenWorkspace orgId={row.orgId} name={row.name} />
                  ) : (
                    <Link href={`${FORSIGHT_PATH}/sources`} className="text-xs text-brand-300">
                      Set up
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {rows.some((row) => row.error) ? (
        <Panel className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
            Workspaces that could not be read
          </p>
          <ul className="mt-3 space-y-2">
            {rows
              .filter((row) => row.error)
              .map((row) => (
                <li key={row.orgId} className="text-sm text-muted-foreground">
                  <span className="text-card-foreground">{row.name}</span> — {row.error}
                </li>
              ))}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
