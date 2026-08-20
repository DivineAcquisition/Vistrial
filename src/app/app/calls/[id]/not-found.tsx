import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export default function CallNotFound() {
  return (
    <PageFrame
      title="Call not found"
      breadcrumbs={[
        { href: "/app/calls", label: "Calls" },
        { href: "/app/calls", label: "Not found" },
      ]}
    >
      <EmptyState
        kind="empty"
        title="No call matches that address"
        detail="It is not in this workspace, or the link is wrong. The same screen is shown either way."
        action={
          <Link href="/app/calls" className={`${btnSecondary} ${btnSizeSm}`}>
            Back to Calls
          </Link>
        }
      />
    </PageFrame>
  );
}
