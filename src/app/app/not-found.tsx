import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export default function AppNotFound() {
  return (
    <PageFrame title="Not found">
      <EmptyState
        kind="empty"
        title="That page is not in this workspace"
        detail="The address is wrong, or it does not belong to the organization you have open. Nothing else is shown either way."
        action={
          <Link href={DEFAULT_APP_PATH} className={`${btnSecondary} ${btnSizeSm}`}>
            Back to the Queue
          </Link>
        }
      />
    </PageFrame>
  );
}
