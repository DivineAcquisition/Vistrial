import { ArrowRight } from "lucide-react";

import { AnnotatedCaseFile, HeroCaseFile } from "@/components/marketing/case-file";
import { CtaLink } from "@/components/marketing/cta-link";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import {
  CtaGroup,
  Eyebrow,
  FaqAccordion,
  FeatureCard,
  FinalCta,
  MarketingSection,
  ProductFrame,
} from "@/components/marketing/primitives";
import { Button } from "@/components/ui/button";
import {
  AUDIT,
  CASE_FILE,
  FAQ,
  GHL,
  HERO,
  MOMENTS,
  OUTCOME,
  PROBLEM,
} from "@/lib/marketing/copy";
import { DEMO_CASE } from "@/lib/marketing/demo-case";
import {
  marketingHeroTitle,
  marketingLead,
  marketingPageGutter,
  marketingSectionY,
  marketingShell,
  marketingSubhead,
} from "@/lib/marketing/ui";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

function splitMetric(line: string): { lead: string; rest: string } {
  const index = line.indexOf(":");
  if (index === -1) return { lead: line, rest: "" };
  return { lead: line.slice(0, index), rest: line.slice(index + 1).trim() };
}

export function LandingPage() {
  const headlineBefore = HERO.headline.slice(0, HERO.headline.indexOf(HERO.headlineAccent));

  return (
    <>
      <section className={cn(marketingPageGutter, "pb-16 pt-14 sm:pb-20 sm:pt-20 md:pt-24")}>
        <div className={cn(marketingShell, "grid items-center gap-10 lg:grid-cols-2 lg:gap-16")}>
          <div className="animate-rise">
            <Eyebrow>{HERO.eyebrow}</Eyebrow>
            <h1 className={cn(marketingHeroTitle, "mt-5")}>
              {headlineBefore}
              <span className="text-gradient">{HERO.headlineAccent}</span>
            </h1>
            <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{HERO.subhead}</p>
            <CtaGroup>
              <CtaLink position="hero">
                {HERO.primaryCta}
                <ArrowRight className="size-4" aria-hidden />
              </CtaLink>
              <Button variant="secondary" size="lg" asChild>
                <a href="#case-file">{HERO.secondaryCta}</a>
              </Button>
            </CtaGroup>
            <p className={cn(captionText, "mt-4")}>{HERO.underCta}</p>
          </div>
          <div className="animate-rise delay-2">
            <ProductFrame title="Case file" caption={DEMO_CASE.sampleLabel}>
              <HeroCaseFile />
            </ProductFrame>
          </div>
        </div>
      </section>

      <MarketingSection headline={PROBLEM.headline} narrow>
        <ul className="space-y-6">
          {PROBLEM.points.map((point) => (
            <li key={point.lead}>
              <p className="text-base leading-relaxed text-white sm:text-[17px]">
                <span className="font-semibold">{point.lead}</span> {point.rest}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-base font-medium text-white">{PROBLEM.closing}</p>
      </MarketingSection>

      <MarketingSection id="case-file" headline={CASE_FILE.headline}>
        <AnnotatedCaseFile />
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

      <MarketingSection headline={OUTCOME.headline} narrow lead={<p>{OUTCOME.body}</p>}>
        <ul className="grid gap-4 sm:grid-cols-1">
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
        id="audit"
        className={cn("scroll-mt-24 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY)}
      >
        <div className={cn(marketingShell, "max-w-3xl")}>
          <FinalCta headline={AUDIT.headline}>
            <p className={marketingLead}>{AUDIT.body}</p>
            <p className="mt-4 text-base font-medium text-white">{AUDIT.keep}</p>
            <CtaGroup>
              <CtaLink position="audit">
                {AUDIT.cta}
                <ArrowRight className="size-4" aria-hidden />
              </CtaLink>
            </CtaGroup>
            <p className={cn(captionText, "mt-4")}>{AUDIT.underCta}</p>
          </FinalCta>
        </div>
      </section>

      <MarketingSection id="faq" headline={FAQ.headline} narrow>
        <FaqAccordion items={FAQ.items} />
      </MarketingSection>
    </>
  );
}
