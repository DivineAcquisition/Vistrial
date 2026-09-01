import { PageFrame } from "@/components/app/page-frame";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadForsightOverview } from "@/lib/forsight/load";
import { connectionView, missingDatasetsSentence } from "@/lib/forsight/status";
import { FORSIGHT_DATASET_LABELS } from "@/lib/forsight/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Forsight",
};

export default async function ForsightPage() {
  await requireReportingAccess();
  const overview = await loadForsightOverview();
  const connection = connectionView(overview.metrics);
  const missing = missingDatasetsSentence(overview.metrics);

  return (
    <PageFrame
      title="Forsight"
      eyebrow="Tracking"
      description="Where this workspace's acquisition numbers come from. Forsight shows what its sources already count; it never counts anything itself."
      status={connection.label}
      statusTone={connection.tone}
    >
      <Panel className="p-5">
        <DefinitionList>
          <KeyValue label="Workspace">{overview.orgName}</KeyValue>
          <KeyValue label="Metrics source">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={connection.label} tone={connection.tone} />
              <span>{connection.detail}</span>
            </div>
          </KeyValue>
          {overview.metrics.configured ? (
            <KeyValue label="Available">
              {overview.metrics.availableDatasets.length === 0
                ? "Nothing yet."
                : overview.metrics.availableDatasets
                    .map((dataset) => FORSIGHT_DATASET_LABELS[dataset])
                    .join(", ")}
            </KeyValue>
          ) : null}
          {missing ? <KeyValue label="Not in this base">{missing}</KeyValue> : null}
          <KeyValue label="Ad spend">
            {overview.adSpendConfigured
              ? "Meta ad spend is connected for this workspace."
              : "No ad account is tracked for this workspace."}
          </KeyValue>
        </DefinitionList>
      </Panel>

      <p className="text-sm text-dim">
        Numbers land here next: applications, qualified leads, booked calls, held calls, closed
        revenue, and what each of them costs, week over week.
      </p>
    </PageFrame>
  );
}
