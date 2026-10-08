import { TablePageSkeleton } from "@/components/app/page-skeletons";

export default function MembersSettingsLoading() {
  return (
    <TablePageSkeleton
      title="Members"
      description="Invite setters and closers. Deactivate instead of deleting — touches and calls keep attribution."
    />
  );
}
