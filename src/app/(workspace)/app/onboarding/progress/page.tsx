import Link from "next/link";

import { OnboardingOverrideForm } from "@/app/(workspace)/app/onboarding/progress/progress-form";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAuthContext } from "@/lib/auth/session";
import { formatDayLong } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { isOnboardingStep, ONBOARDING_STATES, type OnboardingStep } from "@/lib/portal/onboarding";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Setup progress" };

type StatusRow = {
  steps: unknown;
  live: boolean;
  went_live_at: string | null;
  refreshed_at: string;
};

/** Where setup stands, from what exists in the workspace plus any note the team added. */
export default async function OnboardingProgressPage() {
  const ctx = await getAuthContext();
  const db = await portalDb();
  const { data, error } = await db.rpc("onboarding_status_refresh", { p_org_id: ctx.org.id });
  if (error || !data) {
    return (
      <PageFrame title="Setup" description="Where this workspace is in getting ready.">
        <Panel className="p-6">
          <p className={helperClass}>Setup progress is not available just now. Try again in a minute.</p>
        </Panel>
      </PageFrame>
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as StatusRow | null;
  if (!row) {
    return (
      <PageFrame title="Setup" description="Where this workspace is in getting ready.">
        <Panel className="p-6">
          <p className={helperClass}>Setup progress is not available just now. Try again in a minute.</p>
        </Panel>
      </PageFrame>
    );
  }
  const steps = (Array.isArray(row.steps) ? row.steps : []).filter(isOnboardingStep);
  const done = steps.filter((step) => step.state === "done").length;

  return (
    <PageFrame
      title="Setup"
      description={
        row.live
          ? `Live${row.went_live_at ? ` since ${formatDayLong(row.went_live_at)}` : ""}. ${done} of ${steps.length} steps are done.`
          : `${done} of ${steps.length} steps are done.`
      }
    >
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <StepCard key={step.key} step={step} index={index + 1} />
        ))}
      </ol>
      {ctx.isStaff ? (
        <section className="space-y-3">
          <h2 className={cardTitle}>Update a step</h2>
          <p className={helperClass}>Use this when the automatic state is wrong, or to leave a note and a timing.</p>
          <OnboardingOverrideForm steps={steps} />
        </section>
      ) : null}
    </PageFrame>
  );
}

function StepCard({ step, index }: { step: OnboardingStep; index: number }) {
  const status = ONBOARDING_STATES[step.state] ?? ONBOARDING_STATES.waiting_on_team!;
  return (
    <li>
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm text-white">
            {index}. {step.label}
          </h2>
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
        {step.why ? <p className={`mt-2 ${helperClass}`}>{step.why}</p> : null}
        {step.note ? <p className={`mt-2 text-sm text-white`}>Your team: {step.note}</p> : null}
        {step.eta ? <p className={helperClass}>Expected: {step.eta}</p> : null}
        {step.action && step.state !== "done" ? (
          <Link href={step.action.href} className="mt-3 inline-block text-sm text-brand-300 underline">
            {step.action.label}
          </Link>
        ) : null}
      </Panel>
    </li>
  );
}
