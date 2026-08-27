import { ArrowRight, AudioLines, Check, ClipboardList, Clock, Gauge, MessageSquareWarning, PenLine } from "lucide-react";

import { HeroCaseFile } from "@/components/marketing/case-file";
import { CtaLink } from "@/components/marketing/cta-link";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import {
  CtaGroup,
  FaqAccordion,
  FeatureCard,
  FinalCta,
  MarketingSection,
  ProductFrame,
  StatusPill,
} from "@/components/marketing/primitives";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { Globe } from "@/components/ui/globe";
import { Marquee } from "@/components/ui/marquee";
import { Panel } from "@/components/ui/panel";
import { Particles } from "@/components/ui/particles";
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

const CASE_FILE_BENTO_SPAN = [
  "lg:col-span-2",
  "lg:col-span-1",
  "lg:col-span-1",
  "lg:col-span-2",
  "lg:col-span-1",
  "lg:col-span-2",
] as const;

function splitMetric(line: string): { lead: string; rest: string } {
  const index = line.indexOf(":");
  if (index === -1) return { lead: line, rest: "" };
  return { lead: line.slice(0, index), rest: line.slice(index + 1).trim() };
}

export function LandingPage() {
  const headlineBefore = HERO.headline.slice(0, HERO.headline.indexOf(HERO.headlineAccent));

  return (
    <>
      <section className={cn(marketingPageGutter, "relative overflow-hidden pb-24 pt-16 sm:pb-32 sm:pt-24")}>
        <Particles
          className="absolute inset-0 z-0"
          quantity={48}
          color="#9A88FC"
          ease={80}
          size={0.5}
        />
        <div className={cn(marketingShell, "relative z-10 grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
          <div className="animate-rise">
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
          <div className="relative animate-rise delay-1">
            <div className="pointer-events-none absolute -inset-x-8 -inset-y-16 -z-10 hidden opacity-50 lg:block">
              <Globe className="max-w-none" />
            </div>
            <ProductFrame title="Case file" caption={DEMO_CASE.sampleLabel}>
              <HeroCaseFile />
            </ProductFrame>
          </div>
        </div>
      </section>

      <div className="relative overflow-hidden border-y border-white/[0.07]">
        <Marquee pauseOnHover className="[--duration:36s]">
          {CASE_FILE.parts.map((part) => (
            <span
              key={part.id}
              className="mx-4 text-[13px] font-medium tracking-wide text-silver"
            >
              {part.title}
            </span>
          ))}
        </Marquee>
      </div>

      <BlurFade inView>
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
            <Panel className="border-brand-500/25 p-6 sm:p-8">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">
                Case file
              </p>
              <p className="mt-3 font-heading text-lg tracking-tight text-white">{CASE_FILE.headline}</p>
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
      </BlurFade>

      <BlurFade inView>
        <MarketingSection id="case-file" headline={CASE_FILE.headline}>
          <BentoGrid className="auto-rows-[16rem] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {CASE_FILE.parts.map((part, index) => (
              <BentoCard
                key={part.id}
                name={part.title}
                description={part.body}
                href="#waitlist"
                cta={WAITLIST.cta}
                Icon={CASE_FILE_ICONS[part.id]}
                className={cn("col-span-1", CASE_FILE_BENTO_SPAN[index])}
                background={
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(154,136,252,0.18),transparent_55%)]"
                  />
                }
              />
            ))}
          </BentoGrid>
        </MarketingSection>
      </BlurFade>

      <BlurFade inView>
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
      </BlurFade>

      <BlurFade inView>
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
      </BlurFade>

      <BlurFade inView>
        <MarketingSection headline={GHL.headline} lead={<p>{GHL.body}</p>}>
          <GhlConnectVisual />
        </MarketingSection>
      </BlurFade>

      <section
        id="waitlist"
        className={cn("scroll-mt-24 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY)}
      >
        <div className={marketingShell}>
          <FinalCta headline={WAITLIST.headline}>
            <p className={cn(marketingLead, "mx-auto")}>{WAITLIST.body}</p>
            <div className="mx-auto mt-8 max-w-2xl">
              <WaitlistForm position="waitlist" />
            </div>
            <p className={cn(captionText, "mt-4")}>{WAITLIST.underCta}</p>
          </FinalCta>
        </div>
      </section>

      <BlurFade inView>
        <MarketingSection id="faq" headline={FAQ.headline} narrow align="center">
          <FaqAccordion items={FAQ.items} />
        </MarketingSection>
      </BlurFade>
    </>
  );
}
