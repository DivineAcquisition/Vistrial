import { AnnotatedCaseFile, HeroCaseFile } from "@/components/marketing/case-file";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import {
  Eyebrow,
  FaqAccordion,
  FeatureCard,
  FinalCta,
  MarketingSection,
  ProductFrame,
} from "@/components/marketing/primitives";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
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
  marketingBtnSecondary,
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
      <section className={cn(marketingPageGutter, "pb-12 pt-10 sm:pb-16 sm:pt-14")}>
        <div className={cn(marketingShell, "grid items-center gap-8 lg:grid-cols-2 lg:gap-12")}>
          <div>
            <Eyebrow>{HERO.eyebrow}</Eyebrow>
            <h1 className={cn(marketingHeroTitle, "mt-4")}>
              {headlineBefore}
              <span className="text-brand-300">{HERO.headlineAccent}</span>
            </h1>
            <p className={cn(marketingSubhead, "mt-4 max-w-md")}>{HERO.subhead}</p>
            <div className="mt-5 max-w-xl">
              <WaitlistForm position="hero" />
            </div>
            <p className={cn(captionText, "mt-3")}>{HERO.underCta}</p>
            <a href="#case-file" className={cn(marketingBtnSecondary, "mt-4")}>
              {HERO.secondaryCta}
            </a>
          </div>
          <div>
            <ProductFrame title="Case file" caption={DEMO_CASE.sampleLabel}>
              <HeroCaseFile />
            </ProductFrame>
          </div>
        </div>
      </section>

      <MarketingSection headline={PROBLEM.headline} narrow>
        <ul className="space-y-4">
          {PROBLEM.points.map((point) => (
            <li key={point.lead}>
              <p className="text-sm leading-relaxed text-white sm:text-[15px]">
                <span className="font-semibold">{point.lead}</span> {point.rest}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm font-medium text-white">{PROBLEM.closing}</p>
      </MarketingSection>

      <MarketingSection id="case-file" headline={CASE_FILE.headline}>
        <AnnotatedCaseFile />
      </MarketingSection>

      <MarketingSection id="moments" headline={MOMENTS.headline}>
        <div className="grid gap-3 md:grid-cols-3">
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
        <ul className="grid gap-3">
          {OUTCOME.lines.map((line) => {
            const { lead, rest } = splitMetric(line);
            return (
              <li key={line}>
                <FeatureCard title={lead}>{rest}</FeatureCard>
              </li>
            );
          })}
        </ul>
        <p className={cn(marketingLead, "mt-8")}>{OUTCOME.honesty}</p>
      </MarketingSection>

      <MarketingSection headline={GHL.headline} lead={<p>{GHL.body}</p>}>
        <GhlConnectVisual />
      </MarketingSection>

      <section
        id="waitlist"
        className={cn("scroll-mt-20 border-t border-white/[0.07]", marketingPageGutter, marketingSectionY)}
      >
        <div className={cn(marketingShell, "max-w-2xl")}>
          <FinalCta headline={WAITLIST.headline}>
            <p className={marketingLead}>{WAITLIST.body}</p>
            <div className="mt-5">
              <WaitlistForm position="waitlist" />
            </div>
            <p className={cn(captionText, "mt-3")}>{WAITLIST.underCta}</p>
          </FinalCta>
        </div>
      </section>

      <MarketingSection id="faq" headline={FAQ.headline} narrow>
        <FaqAccordion items={FAQ.items} />
      </MarketingSection>
    </>
  );
}
