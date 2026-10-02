import { redirect } from "next/navigation";

import { ApprovalActionsForm, ApprovalLimitsForm } from "@/app/app/settings/approvals/approval-gate-form";
import { PageFrame } from "@/components/app/page-frame";
import { Card } from "@/components/ui/card";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { canEditApprovalGate, describeGateChange } from "@/lib/home/catalog";
import { gateFormRows, loadGateHistory, loadGateState } from "@/lib/home/gate";
import { firstSettingsPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Approvals" };

export default async function ApprovalSettingsPage() {
  const ctx = await requireOrgSettingsManager();
  if (!canEditApprovalGate(ctx.role, ctx.isPlatformAdmin)) {
    redirect(firstSettingsPath(ctx.role, ctx.isPlatformAdmin));
  }
  const supabase = await createClient();
  const [state, history] = await Promise.all([
    loadGateState(supabase, ctx.org.id),
    loadGateHistory(supabase, ctx.org.id),
  ]);

  return (
    <PageFrame
      title="Approvals"
      description="Decide what Vistrial asks you about first, what it does on its own, and what it never does. Changes apply right away."
    >
      <div className="flex max-w-3xl flex-col gap-6">
        <ApprovalActionsForm rows={gateFormRows(state)} editable />
        <ApprovalLimitsForm limits={state.limits} timeZone={ctx.org.timezone} editable />
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">History</h2>
          {history.length ? (
            <ul className="mt-3 divide-y divide-border">
              {history.map((change) => (
                <li key={change.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-sm text-card-foreground">{describeGateChange(change)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {change.actorLabel} ·{" "}
                    <time dateTime={change.at}>
                      {new Date(change.at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: ctx.org.timezone,
                      })}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No changes yet. Every change is recorded here with who made it.</p>
          )}
        </Card>
      </div>
    </PageFrame>
  );
}
