import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { HowItWorks } from "@/components/ui/how-it-works";
import { OnboardCard } from "@/components/ui/onboard-card";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { SETUP_STEPS, resumeSlug, setupHref, stageState } from "@/lib/onboarding/customer-steps";
import type { CustomerView } from "@/lib/onboarding/load";
import { CUSTOMER_STATE_LABEL, PHASE_LABEL, progressCounts, waitingText } from "@/lib/onboarding/stages";
import { cardTitle, helperClass } from "@/lib/ui";

/**
 * The setup overview itself, from a customer view. The setup page renders it
 * from the database; the layout reference renders it from sample states.
 */
export function OnboardingOverview({ view, isStaff, now }: { view: CustomerView; isStaff: boolean; now?: number }) {
  const extra = { welcomeSeen: view.welcomeSeen, sampleStarted: Boolean(view.sample) };
  const resume = resumeSlug(view.steps, extra);
  const counts = progressCounts(view.steps);
  const phase = PHASE_LABEL[view.phase];
  const live = view.phase === "live" || view.phase === "settled";

  return (
    <PageFrame
      title={live ? "You are live" : "Setting up Vistrial"}
      description={
        live
          ? "Everything is set up. You can come back here any time to see what was done."
          : `${counts.done} of ${counts.total} steps done. Your part is about ten minutes. Texting registration and email setup stay with your team, and sending stays off until they are done.`
      }
      status={phase.label}
      statusTone={phase.tone}
      secondaryActions={
        <Link href="/app/help?topic=onboarding&from=/app/onboarding" className="text-sm text-brand-300 underline underline-offset-2">
          Need help?
        </Link>
      }
    >
      {view.phase === "paused" || view.phase === "cancelled" ? (
        <Notice tone="warning" title={view.phase === "paused" ? "Setup is paused" : "Setup is on hold"}>
          <p className={helperClass}>{view.pausedReason ?? "Your team will be in touch."}</p>
        </Notice>
      ) : null}
      {view.phase === "ready_for_review" ? (
        <Notice tone="info" title="Your team is reviewing">
          <p className={helperClass}>You said you are ready. Your team checks everything, then approves going live. This is not instant.</p>
        </Notice>
      ) : null}

      {!live && view.phase !== "paused" && view.phase !== "cancelled" ? (
        <Panel className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className={cardTitle}>Next for you</h2>
              <p className="mt-2 text-sm text-strong">{SETUP_STEPS.find((step) => step.slug === resume)?.short}</p>
              <div className="mt-4">
                <Button variant="primary" render={<Link href={setupHref(resume)} />}>
                  Continue where you left off
                </Button>
              </div>
            </div>
            <OnboardCard step1="Tools connected" step2="Setting up your agents" step3="Ready to go live" />
          </div>
        </Panel>
      ) : null}

      <HowItWorks id="setup-path" />

      <section aria-labelledby="your-part" className="space-y-3">
        <h2 id="your-part" className={cardTitle}>
          Your part
        </h2>
        <ol className="space-y-3">
          {[
            { title: "Connect", href: setupHref("crm"), detail: "Mailbox, calendar, call recordings, and your CRM. You can skip one and finish it later from Home." },
            { title: "Pick your sales process", href: setupHref("approach"), detail: "Choose a starting point. Nothing to configure on this step." },
            { title: "Choose how careful to be", href: setupHref("approvers"), detail: "Ask first, or let routine follow-ups run. Change it later in Sales. Pricing, refunds, and deletions cannot run on their own." },
            { title: "Invite your team", href: setupHref("team"), detail: "Add the people who work your leads." },
            { title: "First win", href: setupHref("test"), detail: "A sample draft shows what a follow-up looks like. It cannot be sent. Imported history does not start a draft." },
          ].map((step, index) => (
            <li key={step.title}>
              <Panel className="p-5">
                <h3 className="text-sm text-strong">{index + 1}. {step.title}</h3>
                <p className="mt-1 text-sm text-dim">{step.detail}</p>
                <div className="mt-3">
                  <Button variant={index === 0 ? "primary" : "secondary"} size="sm" render={<Link href={step.href} />}>
                    {step.title}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ol>
        <p className="text-sm text-dim">Texting registration and email setup stay in progress with your team until they are done. Sending to leads stays off until then.</p>
      </section>

      <section aria-labelledby="all-steps" className="space-y-3">
        <h2 id="all-steps" className={cardTitle}>
          Every step
        </h2>
        <ol className="space-y-3">
          {view.steps.map((step, index) => {
            const state = CUSTOMER_STATE_LABEL[step.state];
            const slug = SETUP_STEPS.find((item) => item.stage === step.key)?.slug;
            const waiting = step.state === "waiting_on_customer" || step.state === "waiting_on_team" ? waitingText(step.waiting_since, now) : null;
            return (
              <li key={step.key}>
                <Panel className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 text-sm text-strong">
                      {index + 1}. {step.label}
                    </h3>
                    <StatusBadge label={state.label} tone={state.tone} />
                  </div>
                  <p className={helperClass}>{step.state === "coming_next" ? "Coming next." : (step.detail ?? step.why)}</p>
                  {step.note ? <p className="mt-2 text-sm text-strong">Your team: {step.note}</p> : null}
                  {step.eta ? <p className={helperClass}>Expected: {step.eta}</p> : null}
                  {waiting ? <p className={helperClass}>Waiting {waiting}.</p> : null}
                  {step.owner !== "staff" && step.state !== "coming_next" && step.state !== "done" && slug ? (
                    <Link href={setupHref(slug)} className="mt-3 inline-block text-sm text-brand-300 underline underline-offset-2">
                      {step.state === "blocked" ? "See what to fix" : "Open this step"}
                    </Link>
                  ) : null}
                  {stageState(view.steps, step.key) === "done" && slug && step.owner !== "staff" ? (
                    <Link href={setupHref(slug)} className="mt-3 inline-block text-sm text-muted-foreground underline underline-offset-2">
                      Review
                    </Link>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ol>
      </section>

      {isStaff ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Business profile (staff)</h2>
          <p className={helperClass}>The longer business-profile questions that feed the Leak Report. Optional for go-live.</p>
          <Link href="/app/onboarding/business" className="mt-3 inline-block text-sm text-brand-300 underline underline-offset-2">
            Open the business profile
          </Link>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
