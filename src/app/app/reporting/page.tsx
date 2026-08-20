import { redirect } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";
import { canViewReporting } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";

export default async function ReportingPage() {
  const { role } = await getAuthContext();
  if (!canViewReporting(role)) {
    redirect(DEFAULT_APP_PATH);
  }

  return (
    <PageFrame
      title="Reporting"
      description="Conversion and revenue once scoring and the CRM are connected."
    >
      <UnconfiguredState
        withIntegrationsLink
        title="Reporting has nothing to measure yet"
        detail="This view fills in after the CRM is connected and closed revenue can be recorded. Setters and closers do not see this section."
      />
    </PageFrame>
  );
}
