import { PageFrame } from "@/components/app/page-frame";
import { PageLoader } from "@/components/app/page-loader";

export default function AdvancedSettingsLoading() {
  return (
    <PageFrame
      title="Advanced"
      description="Settings you will not touch every day."
    >
      <PageLoader label="Loading settings" />
    </PageFrame>
  );
}
