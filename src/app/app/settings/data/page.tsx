import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";
import { cardStack, cardTitle, formMeasure, helperClass } from "@/lib/ui";

export default async function DataSettingsPage() {
  const { org } = await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Data"
      description="This workspace's data. Export it without waiting on engineering. Deletion is a DA operator action."
      breadcrumbs={advancedSettingsBreadcrumbs("Data", "/app/settings/data")}
    >
      <Card className={formMeasure}>
        <div className={cardStack}>
          <h2 className={cardTitle}>Export</h2>
          <p className={helperClass}>
            Downloads leads, touches, calls, transcripts, extractions, objections, scores, revenue,
            the business profile, reporting snapshots, and baseline tables for {org.name} as JSON.
          </p>
          <Button asChild variant="secondary">
            <a href="/app/settings/data/export">Download JSON</a>
          </Button>
        </div>
      </Card>
    </PageFrame>
  );
}
