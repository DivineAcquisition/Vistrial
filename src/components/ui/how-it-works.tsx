import { Cable, Rocket, ShieldCheck, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const steps = [
  {
    icon: Cable,
    title: "Connect the record",
    body: "Connect your CRM, phone, calendar, and call recordings. Vistrial reads them into one case file per lead. It does not change your CRM unless you turn that on.",
  },
  {
    icon: Users,
    title: "Meet the agents",
    body: "Scribe keeps the case file, Sentry watches response times, Relay drafts follow-ups, and Compass answers questions from your own data.",
  },
  {
    icon: ShieldCheck,
    title: "Approve before anything sends",
    body: "Relay only drafts. A person approves each follow-up, and the same checks run again at send time, including quiet hours, opt-outs, and do-not-contact.",
  },
  {
    icon: Rocket,
    title: "Go live, one agent at a time",
    body: "After your team reviews setup, agents switch on in order so you can see each one working. The first week includes check-ins. Nothing sends on its own.",
  },
];

export function HowItWorks({ id = "how", className }: { id?: string; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 border-t border-border bg-background py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-3xl px-6 sm:px-10">
        <div className="flex flex-col gap-3 text-center">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">How it works</span>
          <h2
            className="text-balance font-semibold tracking-tight text-card-foreground"
            style={{
              fontSize: "clamp(1.85rem, 4vw, 2.75rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            Four steps from a scattered record to a live sales team
          </h2>
        </div>
        <ol className="relative mt-14 flex flex-col gap-6 border-l border-dashed border-border pl-10 sm:pl-12">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[3.65rem] top-1 grid size-9 place-items-center rounded-full border border-border bg-card font-mono text-xs font-semibold text-card-foreground shadow-sm sm:-left-[4.15rem]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
                  <step.icon className="size-4" aria-hidden />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold tracking-tight text-card-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
