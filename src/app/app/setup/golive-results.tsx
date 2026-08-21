import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SETUP_STEP_COPY, type SetupStepId } from "@/lib/onboarding/constants";
import { stepHref } from "@/lib/onboarding/steps";
import type { GoliveRunResult } from "@/lib/onboarding/types";
import { helperClass } from "@/lib/ui";

export function GoliveResults({ result }: { result: GoliveRunResult }) {
  return (
    <Panel className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Go-live verification</h2>
          <p className={helperClass}>
            Live test of the actual chain, not a settings audit. The test lead is removed afterward.
          </p>
        </div>
        <StatusBadge label={result.ok ? "passed" : "failed"} tone={result.ok ? "good" : "critical"} />
      </div>
      <ol className="mt-5 space-y-4">
        {result.steps.map((step, index) => (
          <li key={step.id} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-white">
              {index + 1}. {step.label}
            </p>
            <p className={`mt-1 text-sm ${step.ok ? "text-silver" : "text-flag-critical"}`}>{step.detail}</p>
            {!step.ok && step.fixStep ? (
              <Link href={stepHref(step.fixStep as SetupStepId)} className="mt-2 inline-block text-sm text-brand-300">
                Fix on {SETUP_STEP_COPY[step.fixStep].title}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
