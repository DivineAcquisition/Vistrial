import { PageFrame } from "@/components/app/page-frame";

export default function FollowUpReviewLoading() {
  return (
    <PageFrame title="Follow-up draft" description="Loading the draft.">
      <div className="h-40 rounded-2xl border border-white/10 bg-white/[0.03]" />
    </PageFrame>
  );
}
