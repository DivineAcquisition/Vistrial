import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";
import { eyebrow as eyebrowClass, sectionLabel } from "@/lib/ui";
import {
  marketingBody,
  marketingCardTitle,
  marketingLead,
  marketingMeasureWide,
  marketingPageGutter,
  marketingSectionTitle,
  marketingSectionY,
  marketingShell,
} from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={eyebrowClass}>{children}</p>;
}

export function CtaGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">{children}</div>
  );
}

export function MarketingSection({
  id,
  headline,
  eyebrow,
  lead,
  children,
  narrow = false,
  className,
}: {
  id?: string;
  headline: string;
  eyebrow?: string;
  lead?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY, className)}
    >
      <div className={cn(marketingShell, narrow && marketingMeasureWide)}>
        {eyebrow ? <p className={cn(sectionLabel, "mb-3")}>{eyebrow}</p> : null}
        <h2 className={marketingSectionTitle}>{headline}</h2>
        {lead ? <div className={cn(marketingLead, "mt-5")}>{lead}</div> : null}
        <div className={lead ? "mt-10" : "mt-8"}>{children}</div>
      </div>
    </section>
  );
}

export function FeatureCard({
  step,
  title,
  children,
}: {
  step?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel className="panel-hover flex h-full flex-col p-6">
      {step ? <p className={cn(sectionLabel, "mb-4")}>{step}</p> : null}
      <h3 className={marketingCardTitle}>{title}</h3>
      <div className={cn(marketingBody, "mt-3")}>{children}</div>
    </Panel>
  );
}

export function ProductFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-ink-850/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="size-1.5 rounded-full bg-white/25" />
          <span className="size-1.5 rounded-full bg-white/15" />
          <span className="size-1.5 rounded-full bg-white/15" />
        </span>
        <figcaption className="min-w-0 truncate text-[11px] font-medium tracking-wide text-dim">
          {title}
          {caption ? <span className="text-silver"> · {caption}</span> : null}
        </figcaption>
      </div>
      <div className="overflow-hidden rounded-[1.35rem]">{children}</div>
    </figure>
  );
}

export function FaqAccordion({
  items,
}: {
  items: readonly { question: string; answer: string }[];
}) {
  return (
    <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
      {items.map((item) => (
        <details key={item.question} className="group py-5">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-left",
              marketingCardTitle,
              "marker:content-none [&::-webkit-details-marker]:hidden"
            )}
          >
            {item.question}
            <ChevronDown
              className="size-4 shrink-0 text-brand-300 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className={cn(marketingBody, "mt-3 max-w-2xl pr-8")}>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function FinalCta({
  headline,
  children,
}: {
  headline: string;
  children: ReactNode;
}) {
  return (
    <Panel className="p-6 sm:p-8 md:p-10">
      <h2 className={marketingSectionTitle}>{headline}</h2>
      <div className="mt-6">{children}</div>
    </Panel>
  );
}
