import { PageFrame } from "@/components/app/page-frame";
import { PageLoader } from "@/components/app/page-loader";

export default function FollowUpReviewLoading() {
  return (
    <PageFrame title="Follow-up draft" description="Loading the draft.">
      <PageLoader label="Loading the draft" />
    </PageFrame>
  );
}
