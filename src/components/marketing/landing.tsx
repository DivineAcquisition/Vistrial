import { ArrowRight, Bell, Bookmark, UserRound } from "lucide-react";

import { HeroCaseFile } from "@/components/marketing/case-file";
import { ComparisonPair } from "@/components/marketing/comparison";
import { CtaLink } from "@/components/marketing/cta-link";
import { LandingFaq } from "@/components/marketing/faq";
import {
  CtaGroup,
  FeatureCard,
  FinalCta,
  IconCard,
  MarketingSection,
  ProductFrame,
  StatusPill,
} from "@/components/marketing/primitives";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Button } from "@/components/ui/button";
import { Globe } from "@/components/ui/globe";
import { Marquee } from "@/components/ui/marquee";
import { Panel } from "@/components/ui/panel";
import { Particles } from "@/components/ui/particles";
import {
  AUDIT,
  FAQ,
  HERO,
  OUTCOME,
  PROBLEM,
  TOOLS,
  WHAT_IT_DOES,
  WHO,
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

const WHAT_IT_DOES_ICONS = {
  "never-miss": Bell,
  "know-who": UserRound,
  "nothing-forgotten": Bookmark,
} as const;

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
                render={<a href="#what-it-does" />}
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
            <ProductFrame title="File" caption={DEMO_CASE.sampleLabel}>
              <HeroCaseFile />
            </ProductFrame>
          </div>
        </div>
      </section>

      <div className="relative overflow-hidden border-y border-white/[0.07]">
        <Marquee pauseOnHover className="[--duration:36s]">
          {WHAT_IT_DOES.items.map((item) => (
            <span
              key={item.id}
              className="mx-4 text-[13px] font-medium tracking-wide text-silver"
            >
              {item.title.replace(/\.$/, "")}
            </span>
          ))}
        </Marquee>
      </div>

      <MarketingSection headline={PROBLEM.headline} align="center">
        <ComparisonPair />
      </MarketingSection>

      <MarketingSection
        id="what-it-does"
        headline={WHAT_IT_DOES.headline}
        align="center"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {WHAT_IT_DOES.items.map((item) => (
            <IconCard key={item.id} icon={WHAT_IT_DOES_ICONS[item.id]} title={item.title}>
              {item.body}
            </IconCard>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        id="how-it-works"
        headline={TOOLS.headline}
        lead={<p>{TOOLS.body}</p>}
        align="center"
      >
        <ul className="flex flex-wrap justify-center gap-2">
          {TOOLS.chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-silver"
            >
              {chip}
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        headline={OUTCOME.headline}
        lead={<p>{OUTCOME.body}</p>}
        align="center"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {OUTCOME.lines.map((line) => (
            <li key={line}>
              <FeatureCard title={line} />
            </li>
          ))}
        </ul>
        <p className={cn(marketingLead, "mx-auto mt-12 text-center")}>{OUTCOME.honesty}</p>
      </MarketingSection>

      <MarketingSection
        id="who"
        headline={WHO.headline}
        lead={<p>{WHO.body}</p>}
        align="center"
      >
        <Panel className="mx-auto max-w-2xl overflow-hidden p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">
            {WHO.notForLabel}
          </p>
          <p className={cn(marketingLead, "mt-3 max-w-none")}>{WHO.notFor}</p>
        </Panel>
      </MarketingSection>

      <section
        id="audit"
        className={cn("scroll-mt-32 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY)}
      >
        <div className={marketingShell}>
          <FinalCta headline={AUDIT.headline}>
            <p className={cn(marketingLead, "mx-auto")}>{AUDIT.body}</p>
            <p className={cn(marketingLead, "mx-auto mt-4")}>{AUDIT.keep}</p>
            <div className="mt-8 flex justify-center">
              <CtaLink position="audit" size="xl" className="rounded-full px-7">
                {AUDIT.cta}
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform in-[[data-slot=button]:hover]:translate-x-0.5"
                />
              </CtaLink>
            </div>
            <p className={cn(captionText, "mt-4")}>{AUDIT.underCta}</p>
          </FinalCta>
        </div>
      </section>

      <MarketingSection id="faq" headline={FAQ.headline} align="center">
        <LandingFaq />
      </MarketingSection>
    </>
  );
}
