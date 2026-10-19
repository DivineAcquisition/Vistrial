import Link from "next/link";
import { notFound } from "next/navigation";

import { SalesRoom, type AutomationRow } from "@/app/(workspace)/app/agents/sales-room";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth/session";
import { canEditApprovalGate, canLockApprovalGate } from "@/lib/home/catalog";
import { gateFormRows, loadGateState } from "@/lib/home/gate";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sales" };

export default async function AgentsPage() {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) notFound();
  const supabase = await createClient();
  const [gate, crm] = await Promise.all([
    loadGateState(supabase, ctx.org.id),
    supabase.from("ghl_connections").select("status").eq("org_id", ctx.org.id).eq("status", "active").limit(1),
  ]);
  const rows: AutomationRow[] = gateFormRows(gate).map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    mode: row.mode,
    reachesPeople: row.reachesPeople,
    locked: row.locked === true,
    lockReason: row.lockReason ?? null,
  }));

  return (
    <PageFrame
      title="Sales"
      description="Your sales team. It watches, drafts, and waits for your OK."
      actions={
        <Button variant="primary" render={<Link href="/app/compass" />}>
          Ask Compass
        </Button>
      }
      secondaryActions={
        ctx.isStaff ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/app/agents/health" className="font-medium text-brand-300 hover:underline">
              Health across workspaces
            </Link>
            {ctx.isPlatformAdmin ? (
              <Link href="/app/agents/simulator" className="font-medium text-brand-300 hover:underline">
                Simulator
              </Link>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <SalesRoom
        rows={rows}
        crmConnected={(crm.data ?? []).length > 0}
        canEdit={canEditApprovalGate(ctx.role, ctx.isStaff)}
        canLock={canLockApprovalGate(ctx.isPlatformAdmin, ctx.templateAccess)}
        staff={ctx.isStaff}
      />
    </PageFrame>
  );
}
