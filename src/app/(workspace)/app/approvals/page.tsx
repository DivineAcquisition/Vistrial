import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { QueueSection, QueueSkeleton } from "@/app/(workspace)/app/home/sections";
import { PageFrame } from "@/components/app/page-frame";
import { SuggestionButtons } from "@/components/sales-os/action-controls";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { loadRuns } from "@/lib/actions/views";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { relativeTime, requestNow } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireSalesOs();
  const db = (await createClient()) as unknown as SupabaseClient;
  const suggestions = await loadRuns(db, ctx.org.id, { statuses: ["suggested"], limit: 50 });
  const now = requestNow();

  return (
    <PageFrame title="Approvals" description="Nothing reaches a lead or client until a person approves it here. Changes inside your tools wait here too while they are set to Suggest.">
      <div className="flex flex-col gap-4">
        <Suspense fallback={<QueueSkeleton />}>
          <QueueSection ctx={ctx} />
        </Suspense>
        <RecordSection id="approvals-suggestions" title="Suggested changes">
          {suggestions.length === 0 ? (
            <EmptyLine>No suggested changes.</EmptyLine>
          ) : (
            <ul className="divide-y divide-border">
              {suggestions.map((run) => (
                <li key={run.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm">
                      {run.label}
                      {run.leadName ? <span className="text-muted-foreground"> for {run.leadName}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.requestedBy} · {relativeTime(run.createdAt, now)}
                    </p>
                  </div>
                  <SuggestionButtons runId={run.id} />
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      </div>
    </PageFrame>
  );
}
