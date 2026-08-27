import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

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
          <Button variant="secondary" size="sm" render={<Link href="/app/cases" />}>
            Back to Case Files
          </Button>
        }
      />
    </PageFrame>
  );
}
