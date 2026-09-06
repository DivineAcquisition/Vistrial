import {
  ArrowRight,
  AudioLines,
  ClipboardList,
  Clock,
  Gauge,
  MessageSquareWarning,
  PenLine,
} from "lucide-react";

import { HeroCaseFile } from "@/components/marketing/case-file";
import { ComparisonPair } from "@/components/marketing/comparison";
import { CtaLink } from "@/components/marketing/cta-link";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import {
  CtaGroup,
  FeatureCard,
  FinalCta,
  IconCard,
  MarketingSection,
  ProductFrame,
  StatusPill,
} from "@/components/marketing/primitives";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Button } from "@/components/ui/button";
import { Globe } from "@/components/ui/globe";
import { Marquee } from "@/components/ui/marquee";
import { Particles } from "@/components/ui/particles";
import {
  CASE_FILE,
  CRM,
  HERO,
  MOMENTS,
  OUTCOME,
  PROBLEM,
  WAITLIST,
} from "@/lib/marketing/copy";
import { DEMO_CASE } from "@/lib/marketing/demo-case";
import {
  marketingDisplayTitle,
  marketingLead,
  marketingPageGutter,
  marketingSectionY,
  marketingShell,
  marketingSubhead,
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
      <section
        className={cn(
          marketingPageGutter,
          "relative overflow-hidden pb-16 pt-16 text-center sm:pb-24 sm:pt-24",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-brand-500/18 via-brand-500/5 to-transparent"
        />
        <Particles
          className="absolute inset-0 z-0"
          quantity={48}
          color="#9A88FC"
          ease={80}
          size={0.5}
        />
        <div className={cn(marketingShell, "relative z-10")}>
          <div className="animate-rise mx-auto max-w-4xl">
            <StatusPill>
              <AnimatedShinyText className="mx-0 max-w-none text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase dark:text-brand-200">
                {HERO.eyebrow}
              </AnimatedShinyText>
            </StatusPill>
            <h1 className={cn(marketingDisplayTitle, "mx-auto mt-6 max-w-4xl")}>
              {headlineBefore}
              <span className="text-gradient italic">{HERO.headlineAccent}</span>
            </h1>
            <p className={cn(marketingSubhead, "mx-auto mt-6 max-w-2xl")}>{HERO.subhead}</p>
            <CtaGroup align="center">
              <CtaLink position="hero" size="xl" className="rounded-full px-7">
                {HERO.primaryCta}
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform in-[[data-slot=button]:hover]:translate-x-0.5"
                />
              </CtaLink>
              <Button
                variant="outline"
                size="xl"
                className="rounded-full px-6"
                render={<a href="#case-file" />}
              >
                {HERO.secondaryCta}
              </Button>
            </CtaGroup>
            <p className={cn(captionText, "mt-4")}>{HERO.underCta}</p>
          </div>

          <div className="relative mx-auto mt-16 max-w-4xl animate-rise delay-1 sm:mt-20">
            <div className="pointer-events-none absolute -inset-x-16 -inset-y-20 -z-10 hidden opacity-40 lg:block">
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

      <MarketingSection headline={PROBLEM.headline} align="center">
        <ComparisonPair />
      </MarketingSection>

      <MarketingSection
        id="case-file"
        eyebrow="Case file"
        headline={CASE_FILE.headline}
        align="center"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_FILE.parts.map((part) => (
            <IconCard key={part.id} icon={CASE_FILE_ICONS[part.id]} title={part.title}>
              {part.body}
            </IconCard>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection id="moments" headline={MOMENTS.headline} align="center">
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

      <MarketingSection
        headline={OUTCOME.headline}
        lead={<p>{OUTCOME.body}</p>}
        align="center"
      >
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
        <p className={cn(marketingLead, "mx-auto mt-12 text-center")}>{OUTCOME.honesty}</p>
      </MarketingSection>

      <MarketingSection
        headline={CRM.headline}
        lead={<p>{CRM.body}</p>}
        align="center"
      >
        <GhlConnectVisual />
      </MarketingSection>

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
            <p className={cn(captionText, "mx-auto mt-3 max-w-xl")}>{WAITLIST.notFor}</p>
          </FinalCta>
        </div>
      </section>
    </>
  );
}
