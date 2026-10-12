import Link from "next/link";
import type { ReactNode } from "react";

import { PageFrame } from "@/components/app/page-frame";
import { Stepper } from "@/components/ui/stepper";
import {
  SETUP_STEPS,
  nextSlug,
  previousSlug,
  setupHref,
  slugDone,
  stageState,
  type SetupSlug,
} from "@/lib/onboarding/customer-steps";
import type { CustomerView } from "@/lib/onboarding/load";
import { CUSTOMER_STATE_LABEL } from "@/lib/onboarding/stages";
import { StatusBadge } from "@/components/ui/status-badge";
import { helperClass } from "@/lib/ui";

/**
 * One setup step per screen: where you are in the whole journey, the title,
 * one line on why it matters, how long it takes, the step itself, and a way
 * to ask for help. Built from the Prompt 3 workflow layout's pieces.
 */
export function SetupStepFrame({
  slug,
  view,
  title,
  why,
  estimate,
  children,
  nextLabel,
  hideNext,
}: {
  slug: SetupSlug;
  view: CustomerView;
  title: string;
  why: string;
  estimate?: string;
  children: ReactNode;
  nextLabel?: string;
  hideNext?: boolean;
}) {
  const extra = { welcomeSeen: view.welcomeSeen, sampleStarted: Boolean(view.sample) };
  const index = SETUP_STEPS.findIndex((step) => step.slug === slug);
  const step = SETUP_STEPS[index]!;
  const state = stageState(view.steps, step.stage);
  const next = nextSlug(slug);
  const previous = previousSlug(slug);
  const helpHref = `/app/help?topic=onboarding&from=${encodeURIComponent(setupHref(slug))}&about=${encodeURIComponent(title)}`;

  return (
    <PageFrame
      eyebrow={`Step ${index + 1} of ${SETUP_STEPS.length}`}
      title={title}
      description={why}
      secondaryActions={
        <Link href={helpHref} className="text-sm text-brand-300 underline underline-offset-2">
          Need help?
        </Link>
      }
    >
      <Stepper
        label="Setup steps"
        currentId={slug}
        steps={SETUP_STEPS.map((item) => ({
          id: item.slug,
          label: item.short,
          href: setupHref(item.slug),
          done: slugDone(item.slug, view.steps, extra),
        }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        {estimate ? <p className={helperClass}>{estimate}</p> : null}
        {state ? <StatusBadge label={CUSTOMER_STATE_LABEL[state].label} tone={CUSTOMER_STATE_LABEL[state].tone} /> : null}
      </div>
      <div className="min-w-0">{children}</div>
      <nav aria-label="Setup navigation" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {previous ? (
          <Link href={setupHref(previous)} className="text-sm text-muted-foreground underline underline-offset-2">
            Back
          </Link>
        ) : (
          <Link href="/app/onboarding" className="text-sm text-muted-foreground underline underline-offset-2">
            Setup overview
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/app/onboarding" className="text-sm text-muted-foreground underline underline-offset-2">
            Save and finish later
          </Link>
          {next && !hideNext ? (
            <Link href={setupHref(next)} className="text-sm text-brand-300 underline underline-offset-2">
              {nextLabel ?? "Next step"}
            </Link>
          ) : null}
        </div>
      </nav>
    </PageFrame>
  );
}
