import { ArrowRight, AudioLines, Check, ClipboardList, Clock, Gauge, MessageSquareWarning, PenLine } from "lucide-react";

import { HeroCaseFile } from "@/components/marketing/case-file";
import { CtaLink } from "@/components/marketing/cta-link";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import {
  CtaGroup,
  FaqAccordion,
  FeatureCard,
  FinalCta,
  IconCard,
  MarketingSection,
  ProductFrame,
  StatusPill,
} from "@/components/marketing/primitives";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { Panel } from "@/components/ui/panel";
import {
  CASE_FILE,
  FAQ,
  GHL,
  HERO,
  MOMENTS,
  OUTCOME,
  PROBLEM,
  WAITLIST,
} from "@/lib/marketing/copy";
import { DEMO_CASE } from "@/lib/marketing/demo-case";
import {
  marketingHeroTitle,
  marketingLead,
  marketingPageGutter,
  marketingSectionY,
  marketingShell,
  marketingSubhead,
  marketingTextLink,
} from "@/lib/marketing/ui";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

const CASE_FILE_ICONS = {
  readiness: Gauge,
  touches: Clock,
  transcripts: AudioLines,
  objections: MessageSquareWarning,
  brief: ClipboardList,
  "follow-up": PenLine,
} as const;

function splitMetric(line: string): { lead: string; rest: string } {
  const index = line.indexOf(":");
  if (index === -1) return { lead: line, rest: "" };
  return { lead: line.slice(0, index), rest: line.slice(index + 1).trim() };
}

export function LandingPage() {
  const headlineBefore = HERO.headline.slice(0, HERO.headline.indexOf(HERO.headlineAccent));

  return (
    <>
      <section className={cn(marketingPageGutter, "pb-20 pt-16 sm:pb-28 sm:pt-24")}>
        <div className={cn(marketingShell, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
          <div>
            <StatusPill>Private · waitlist</StatusPill>
            <p className="mt-5 text-[13px] font-medium text-brand-300">{HERO.eyebrow}</p>
            <h1 className={cn(marketingHeroTitle, "mt-4")}>
              {headlineBefore}
              <span className="text-gradient">{HERO.headlineAccent}</span>
            </h1>
            <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{HERO.subhead}</p>
            <CtaGroup>
              <CtaLink position="hero">
                {HERO.primaryCta}
                <ArrowRight aria-hidden />
              </CtaLink>
              <a href="#case-file" className={marketingTextLink}>
                {HERO.secondaryCta}
              </a>
            </CtaGroup>
            <p className={cn(captionText, "mt-4")}>{HERO.underCta}</p>
          </div>
          <div>
            <ProductFrame title="Case file" caption={DEMO_CASE.sampleLabel}>
              <HeroCaseFile />
            </ProductFrame>
          </div>
        </div>
      </section>

      <MarketingSection headline={PROBLEM.headline}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="p-6 sm:p-8">
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
          </Panel>
          <Panel className="border-brand-500/20 p-6 sm:p-8">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">
              Case file
            </p>
            <p className="mt-3 text-lg font-semibold tracking-tight text-white">{CASE_FILE.headline}</p>
            <ul className="mt-6 space-y-3">
              {CASE_FILE.parts.map((part) => (
                <li key={part.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-brand-300">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-medium text-white">{part.title}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </MarketingSection>

      <MarketingSection id="case-file" headline={CASE_FILE.headline}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_FILE.parts.map((part) => (
            <IconCard key={part.id} icon={CASE_FILE_ICONS[part.id]} title={part.title}>
              {part.body}
            </IconCard>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection id="moments" headline={MOMENTS.headline}>
        <div className="grid gap-4 md:grid-cols-3">
          {MOMENTS.items.map((item, index) => (
            <FeatureCard
              key={item.title}
              step={String(index + 1).padStart(2, "0")}
              title={item.title}
            >
              {item.body}
            </FeatureCard>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection headline={OUTCOME.headline} lead={<p>{OUTCOME.body}</p>}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {OUTCOME.lines.map((line) => {
            const { lead, rest } = splitMetric(line);
            return (
              <li key={line}>
                <FeatureCard title={lead}>{rest}</FeatureCard>
              </li>
            );
          })}
        </ul>
        <p className={cn(marketingLead, "mt-10")}>{OUTCOME.honesty}</p>
      </MarketingSection>

      <MarketingSection headline={GHL.headline} lead={<p>{GHL.body}</p>}>
        <GhlConnectVisual />
      </MarketingSection>

      <section
        id="waitlist"
        className={cn("scroll-mt-24 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY)}
      >
        <div className={marketingShell}>
          <FinalCta headline={WAITLIST.headline}>
            <p className={cn(marketingLead, "mx-auto")}>{WAITLIST.body}</p>
            <div className="mx-auto mt-8 max-w-xl">
              <WaitlistForm position="waitlist" />
            </div>
            <p className={cn(captionText, "mt-4")}>{WAITLIST.underCta}</p>
          </FinalCta>
        </div>
      </section>

      <MarketingSection id="faq" headline={FAQ.headline} narrow align="center">
        <FaqAccordion items={FAQ.items} />
      </MarketingSection>
    </>
  );
}
