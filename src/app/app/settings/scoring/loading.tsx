import { EmptyPageSkeleton } from "@/components/app/page-skeletons";

export default function ScoringSettingsLoading() {
  return (
    <EmptyPageSkeleton
      title="Scoring"
      description="Readiness weights for this workspace, once the scoring engine is installed."
    />
  );
}
