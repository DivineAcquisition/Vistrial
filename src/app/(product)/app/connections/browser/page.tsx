"use client";

import Link from "next/link";

import { BrowserAccess } from "@/components/connections/browser-access";
import { ChevronLeft } from "@/components/icons";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** Browser access: sessions in a customer's own accounts, the step waiting for approval, and the audit trail. Dry run only. */
export default function BrowserAccessPage() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
      <Link href="/app/settings?section=data" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden className="size-4" /> Settings · Data
      </Link>
      <BrowserAccess workspaceId={shell.workspaceId} />
    </div>
  );
}
