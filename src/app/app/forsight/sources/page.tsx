import { notFound } from "next/navigation";

import { ForsightTabs } from "@/app/app/forsight/forsight-chrome";
import { SourceEditor } from "@/app/app/forsight/sources/source-editor";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listWorkspacesForOperator, requireForsightOperator } from "@/lib/forsight/operator";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sources · Forsight" };

const TYPE_LABELS: Record<string, string> = {
  airtable: "Airtable base",
  vistrial_core: "Vistrial core",
  meta_ads: "Meta ad account",
  ghl: "LeadConnector",
};

export default async function ForsightSourcesPage() {
  // A client user gets a not-found, not an empty screen. Postgres refuses
  // their writes regardless; this is so the page does not exist for them.
  const ctx = await requireForsightOperator();
  if (!ctx) notFound();

  const [workspaces, supabase] = await Promise.all([
    listWorkspacesForOperator(),
    createClient(),
  ]);

  const { data: sources } = await supabase
    .from("forsight_sources")
    .select("id, org_id, source_type, status, label, airtable_base_id, meta_ad_account_id, last_verified_at")
    .order("org_id", { ascending: true });

  const names = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  return (
    <PageFrame
      title="Sources"
      eyebrow="Divine Acquisition only"
      description="Where each workspace's Forsight reads from. Clients never see this screen and cannot write these records."
      toolbar={<ForsightTabs activeHref={`${FORSIGHT_PATH}/sources`} isPlatformAdmin />}
    >
      <section>
        <SectionHeader
          title="Add or update a source"
          hint="The connection is tested before anything is written."
        />
        <SourceEditor workspaces={workspaces} />
      </section>

      <section>
        <SectionHeader title="Configured sources" hint={`${sources?.length ?? 0} across all workspaces.`} />
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Points at</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sources ?? []).map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium text-card-foreground">
                    {names.get(source.org_id) ?? source.org_id}
                  </TableCell>
                  <TableCell>{TYPE_LABELS[source.source_type] ?? source.source_type}</TableCell>
                  <TableCell className="text-silver">
                    {source.airtable_base_id ??
                      source.meta_ad_account_id ??
                      source.label ??
                      "This workspace"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={source.status}
                      tone={source.status === "active" ? "good" : source.status === "broken" ? "critical" : "neutral"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </section>
    </PageFrame>
  );
}
