import { Check } from "lucide-react";

import { MagicCard } from "@/components/ui/magic-card";
import { Panel } from "@/components/ui/panel";
import { PROBLEM, WHAT_IT_DOES } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

const LEFT_TAG_CLASS = [
  "lg:top-8 lg:-left-10",
  "lg:top-1/2 lg:-left-16 lg:-translate-y-1/2",
  "lg:bottom-10 lg:-left-6",
] as const;

const RIGHT_TAG_CLASS = [
  "lg:top-8 lg:-right-12",
  "lg:top-1/2 lg:-right-16 lg:-translate-y-1/2",
  "lg:bottom-10 lg:-right-8",
] as const;

function OrbitTag({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute z-20 hidden rounded-full border border-white/[0.1] bg-ink-900/90 px-3 py-1.5 text-[12px] font-medium text-silver shadow-[0_12px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-sm lg:inline-flex",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ComparisonPair() {
  return (
    <div className="relative grid items-stretch gap-5 lg:grid-cols-2 lg:gap-8 lg:px-8">
      <div className="relative">
        {PROBLEM.points.map((point, index) => (
          <OrbitTag key={point.lead} className={LEFT_TAG_CLASS[index]}>
            {point.lead.replace(/\.$/, "")}
          </OrbitTag>
        ))}
        <Panel className="overflow-hidden p-0">
          <MagicCard className="h-full rounded-2xl p-6 sm:p-8">
            <ul className="space-y-5">
              {PROBLEM.points.map((point) => (
                <li key={point.lead}>
                  <p className="text-[15px] leading-relaxed text-white sm:text-base">
                    <span className="font-semibold">{point.lead}</span> {point.rest}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[15px] font-medium text-white">{PROBLEM.closing}</p>
          </MagicCard>
        </Panel>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 z-30 hidden size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-ink-950 font-display text-sm text-silver lg:flex"
      >
        /
      </div>

      <div className="relative">
        {WHAT_IT_DOES.items.map((item, index) => (
          <OrbitTag key={item.id} className={RIGHT_TAG_CLASS[index]}>
            {item.title.replace(/\.$/, "")}
          </OrbitTag>
        ))}
        <Panel className="overflow-hidden border-brand-500/30 p-0 shadow-[0_0_80px_-28px_rgba(154,136,252,0.55)]">
          <MagicCard className="h-full rounded-2xl p-6 sm:p-8">
            <p className="font-display text-2xl tracking-tight text-white sm:text-[1.65rem]">
              {WHAT_IT_DOES.headline}
            </p>
            <ul className="mt-6 space-y-3">
              {WHAT_IT_DOES.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-brand-300">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-medium text-white">{item.title}</span>
                </li>
              ))}
            </ul>
          </MagicCard>
        </Panel>
      </div>
    </div>
  );
}
