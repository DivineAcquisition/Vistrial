import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";
import { cardStack, cardTitle, formMeasure, helperClass } from "@/lib/ui";

export default async function DataSettingsPage() {
  const { org } = await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Data"
      description="Download a copy of this workspace."
      breadcrumbs={advancedSettingsBreadcrumbs("Data", "/app/settings/data")}
    >
      <Card className={formMeasure}>
        <CardPanel className={cardStack}>
          <h2 className={cardTitle}>Download</h2>
          <p className={helperClass}>
            A copy of the people, conversations, scores, and history for {org.name}. Ask us if you
            need this workspace deleted.
          </p>
          <Button asChild variant="secondary">
            <a href="/app/settings/data/export">Download my data</a>
          </Button>
        </CardPanel>
      </Card>
    </PageFrame>
  );
}
