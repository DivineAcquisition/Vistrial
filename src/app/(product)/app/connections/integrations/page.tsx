"use client";

import { ChevronLeft } from "@/components/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Integrations } from "@/components/connections/integrations";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** Google, calendar and note taker connections, and call transcripts. A provider's sign-in returns here with ?integration=&outcome=; a report's transcript source opens here with ?transcript=. */
function ManageIntegrations() {
  const shell = useWorkspaceShell();
  const query = useSearchParams();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  const outcome = query.get("outcome");
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
      <Link href="/app/settings?section=data" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden className="size-4" /> Settings · Data
      </Link>
      <div className="grid gap-1">
        <h1 className="font-heading text-xl text-foreground">More connections</h1>
        <p className="text-sm text-muted-foreground">
          Google, your calendar and your call notes. An Owner connects each one; Vistrial only reads, and disconnecting deletes what it read.
        </p>
      </div>
      <Integrations
        workspaceId={shell.workspaceId}
        returned={outcome ? { provider: query.get("integration"), outcome } : null}
        highlightTranscript={query.get("transcript")}
      />
    </div>
  );
}

export default function ManageIntegrationsPage() {
  return (
    <Suspense>
      <ManageIntegrations />
    </Suspense>
  );
}
