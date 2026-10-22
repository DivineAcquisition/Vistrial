import type { SupabaseClient } from "@supabase/supabase-js";

import { PageFrame } from "@/components/app/page-frame";
import { ActionsView } from "@/components/sales-os/actions-view";
import type { InternalPolicy } from "@/lib/actions/registry";
import { loadRuns } from "@/lib/actions/views";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { requestNow } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Actions" };

export default async function ActionsPage() {
  const ctx = await requireSalesOs();
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: policyRows }, runs] = await Promise.all([
    db.from("action_policies").select("action, mode").eq("org_id", ctx.org.id),
    loadRuns(db, ctx.org.id, { statuses: ["done", "failed", "undone", "dismissed"], limit: 25 }),
  ]);
  const policies = new Map(((policyRows ?? []) as Array<{ action: string; mode: InternalPolicy }>).map((row) => [row.action, row.mode]));

  return (
    <PageFrame
      title="Actions"
      description="The only things agents can do in your tools. Anything a lead or client would see always waits for your approval."
    >
      <ActionsView policies={policies} runs={runs} owner={ctx.workspaceRole === "owner"} now={requestNow()} />
    </PageFrame>
  );
}
