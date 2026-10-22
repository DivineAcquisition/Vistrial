import Link from "next/link";

import { pauseThisLead, skipThisStep, takeOverLead } from "@/app/(workspace)/app/workflows/actions";
import { Button } from "@/components/ui/button";

export function LeadWorkflowStrip({
  enrollmentId,
  workflowName,
  stepLabel,
  nextLabel,
  href,
  canSkip,
  canPause,
}: {
  enrollmentId: string;
  workflowName: string;
  stepLabel: string;
  nextLabel: string;
  href: string | null;
  canSkip: boolean;
  canPause: boolean;
}) {
  return (
    <section className="mb-3 rounded-xl border border-border bg-card px-3 py-2" aria-label="Where this lead is">
      <p className="text-sm text-card-foreground">
        {href ? (
          <Link href={href} className="font-medium text-brand-300">
            {workflowName}
          </Link>
        ) : (
          <span className="font-medium">{workflowName}</span>
        )}
        {". "}
        {stepLabel}. {nextLabel}
      </p>
      {canPause ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {canSkip ? (
            <form action={skipThisStep.bind(null, enrollmentId)}>
              <Button type="submit" variant="secondary">
                Skip this step
              </Button>
            </form>
          ) : null}
          <form action={takeOverLead.bind(null, enrollmentId)}>
            <Button type="submit" variant="secondary">
              Take over
            </Button>
          </form>
          <form action={pauseThisLead.bind(null, enrollmentId)}>
            <Button type="submit" variant="secondary">
              Pause for this lead
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
