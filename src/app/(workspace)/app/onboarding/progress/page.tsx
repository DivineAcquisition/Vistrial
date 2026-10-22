import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAuthContext } from "@/lib/auth/session";
import { formatDayLong } from "@/lib/format";
import { loadCustomerView } from "@/lib/onboarding/load";
import { CUSTOMER_STATE_LABEL, PHASE_LABEL, progressCounts, waitingText } from "@/lib/onboarding/stages";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup progress" };

/**
 * Where setup stands, read-only. Members see this; Owners and staff work
 * from the setup flow and the workbench. Operators have no setup to see.
 */
export default async function OnboardingProgressPage() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff && ctx.workspaceRole !== "owner" && ctx.workspaceRole !== "member") notFound();
  const view = await loadCustomerView(ctx.org.id);
  if (!view) notFound();
  const { done, total } = progressCounts(view.steps);
  const phase = PHASE_LABEL[view.phase];

  return (
    <PageFrame
      title="Setup"
      description={
        view.live
          ? `Live${view.wentLiveAt ? ` since ${formatDayLong(view.wentLiveAt)}` : ""}. ${done} of ${total} steps are done.`
          : `${done} of ${total} steps are done.`
      }
      status={phase.label}
      statusTone={phase.tone}
      secondaryActions={
        ctx.workspaceRole === "owner" || ctx.isStaff ? (
          <Link href="/app/onboarding" className="text-sm text-brand-300 underline underline-offset-2">
            Open setup
          </Link>
        ) : undefined
      }
    >
      <ol className="space-y-3">
        {view.steps.map((step, index) => {
          const state = CUSTOMER_STATE_LABEL[step.state];
          const waiting = step.state === "waiting_on_customer" || step.state === "waiting_on_team" ? waitingText(step.waiting_since) : null;
          return (
            <li key={step.key}>
              <Panel className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 text-sm text-strong">
                    {index + 1}. {step.label}
                  </h2>
                  <StatusBadge label={state.label} tone={state.tone} />
                </div>
                <p className={helperClass}>{step.state === "coming_next" ? "Coming next." : (step.detail ?? step.why)}</p>
                {step.note ? <p className="mt-2 text-sm text-strong">Your team: {step.note}</p> : null}
                {step.eta ? <p className={helperClass}>Expected: {step.eta}</p> : null}
                {waiting ? <p className={helperClass}>Waiting {waiting}.</p> : null}
              </Panel>
            </li>
          );
        })}
      </ol>
    </PageFrame>
  );
}
