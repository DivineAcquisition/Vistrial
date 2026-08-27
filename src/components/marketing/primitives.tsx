import { type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BorderBeam } from "@/components/ui/border-beam";
import { ShineBorder } from "@/components/ui/shine-border";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { Panel } from "@/components/ui/panel";
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
import { sectionLabel } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={sectionLabel}>{children}</p>;
}

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-brand-400" />
      </span>
      {children}
    </p>
  );
}

export function CtaGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      {children}
    </div>
  );
}

export function MarketingSection({
  id,
  headline,
  eyebrow,
  lead,
  children,
  narrow = false,
  align = "left",
  className,
}: {
  id?: string;
  headline: string;
  eyebrow?: string;
  lead?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 border-t border-white/[0.07]",
        marketingPageGutter,
        marketingSectionY,
        className
      )}
    >
      <div className={cn(marketingShell, narrow && marketingMeasureWide, centered && "text-center")}>
        {eyebrow ? <p className={cn(sectionLabel, "mb-3")}>{eyebrow}</p> : null}
        <h2 className={cn(marketingSectionTitle, centered && "mx-auto")}>{headline}</h2>
        {lead ? (
          <div className={cn(marketingLead, "mt-4", centered && "mx-auto")}>{lead}</div>
        ) : null}
        <div className={cn(lead ? "mt-10" : "mt-8", centered && "text-left")}>{children}</div>
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
    <Panel className="panel-hover flex h-full flex-col p-6 sm:p-7">
      {step ? (
        <p className="mb-5 text-4xl font-semibold leading-none tracking-tight text-brand-500/25 tabular-nums">
          {step}
        </p>
      ) : null}
      <h3 className={marketingCardTitle}>{title}</h3>
      <div className={cn(marketingBody, "mt-3")}>{children}</div>
    </Panel>
  );
}

export function IconCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel className="panel-hover flex h-full flex-col p-6">
      <div className="flex size-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/[0.1] text-brand-300">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className={cn(marketingCardTitle, "mt-5")}>{title}</h3>
      <div className={cn(marketingBody, "mt-2")}>{children}</div>
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
    <figure className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(154,136,252,0.22) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-ink-850/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_28px_90px_-32px_rgba(0,0,0,0.9)]">
        <BorderBeam
          size={80}
          duration={8}
          colorFrom="#9A88FC"
          colorTo="#C3B6FE"
          borderWidth={1}
        />
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
          </span>
          <figcaption className="min-w-0 truncate text-[12px] font-medium tracking-wide text-dim">
            {title}
            {caption ? <span className="text-silver"> · {caption}</span> : null}
          </figcaption>
        </div>
        <div className="overflow-hidden">{children}</div>
      </div>
    </figure>
  );
}

export function FaqAccordion({
  items,
}: {
  items: readonly { question: string; answer: string }[];
}) {
  return (
    <Accordion
      multiple
      className="divide-y divide-white/[0.07] border-y border-white/[0.07]"
    >
      {items.map((item, index) => (
        <AccordionItem key={item.question} value={`faq-${index}`}>
          <AccordionTrigger className={cn(marketingCardTitle, "py-5")}>
            {item.question}
          </AccordionTrigger>
          <AccordionPanel className={cn(marketingBody, "max-w-2xl pr-8")}>
            {item.answer}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
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
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-ink-900 px-6 py-12 text-center sm:px-12 sm:py-16">
      <ShineBorder shineColor={["#9A88FC", "#C3B6FE"]} duration={12} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(154,136,252,0.22) 0%, transparent 55%)",
        }}
      />
      <div className="relative">
        <h2 className={cn(marketingSectionTitle, "mx-auto")}>{headline}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
