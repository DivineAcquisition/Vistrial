import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_APP_PATH } from "@/lib/navigation";

export default function AppNotFound() {
  return (
    <PageFrame title="Not found">
      <EmptyState
        kind="empty"
        title="That page is not in this workspace"
        detail="The address is wrong, or it does not belong to the organization you have open. Nothing else is shown either way."
        action={
          <Button variant="secondary" size="sm" render={<Link href={DEFAULT_APP_PATH} />}>
            Back to the Queue
          </Button>
        }
      />
    </PageFrame>
  );
}
