import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export default function CaseNotFound() {
  return (
    <PageFrame
      title="Case file not found"
      breadcrumbs={[
        { href: "/app/cases", label: "Case Files" },
        { href: "/app/cases", label: "Not found" },
      ]}
    >
      <EmptyState
        kind="empty"
        title="No case file matches that address"
        detail="It is not in this workspace, or the link is wrong. The same screen is shown either way."
        action={
          <Link href="/app/cases" className={`${btnSecondary} ${btnSizeSm}`}>
            Back to Case Files
          </Link>
        }
      />
    </PageFrame>
  );
}
