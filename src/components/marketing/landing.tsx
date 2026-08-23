import { ArrowRight } from "lucide-react";

import { AnnotatedCaseFile, HeroCaseFile } from "@/components/marketing/case-file";
import { CtaLink } from "@/components/marketing/chrome";
import { GhlConnectVisual } from "@/components/marketing/ghl-connect";
import { Panel } from "@/components/ui/panel";
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
import { marketingHeroTitle, marketingSectionTitle, marketingSubhead } from "@/lib/marketing/ui";
import { btnSecondary, btnSizeLg, captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

function Section({
  id,
  headline,
  children,
  narrow = false,
  className,
}: {
  id?: string;
  headline: string;
  children: React.ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 border-t border-white/[0.07] px-5 py-16 sm:px-6 sm:py-20 md:py-24",
        className
      )}
    >
      <div className={cn("mx-auto", narrow ? "max-w-3xl" : "max-w-6xl")}>
        <h2 className={marketingSectionTitle}>{headline}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const headlineBefore = HERO.headline.slice(0, HERO.headline.indexOf(HERO.headlineAccent));

  return (
    <>
      <section className="px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 md:pt-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h1 className={marketingHeroTitle}>
              {headlineBefore}
              <span className="text-gradient">{HERO.headlineAccent}</span>
            </h1>
            <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{HERO.subhead}</p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <CtaLink position="hero">
                {HERO.primaryCta}
                <ArrowRight className="size-4" aria-hidden />
              </CtaLink>
              <a href="#case-file" className={`${btnSecondary} ${btnSizeLg}`}>
                {HERO.secondaryCta}
              </a>
            </div>
            <p className={cn(captionText, "mt-4")}>{HERO.underCta}</p>
          </div>
          <HeroCaseFile />
        </div>
      </section>

      <Section headline={PROBLEM.headline} narrow>
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
      </Section>

      <Section id="case-file" headline={CASE_FILE.headline}>
        <AnnotatedCaseFile />
      </Section>

      <Section headline={MOMENTS.headline}>
        <div className="grid gap-4 md:grid-cols-3">
          {MOMENTS.items.map((item) => (
            <Panel key={item.title} className="p-6">
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-silver">{item.body}</p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section headline={OUTCOME.headline} narrow>
        <p className="text-base leading-relaxed text-silver sm:text-[17px]">{OUTCOME.body}</p>
        <ul className="mt-8 space-y-3">
          {OUTCOME.lines.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-white sm:text-base">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-base leading-relaxed text-silver sm:text-[17px]">{OUTCOME.honesty}</p>
      </Section>

      <Section headline={GHL.headline}>
        <p className="max-w-3xl text-base leading-relaxed text-silver sm:text-[17px]">{GHL.body}</p>
        <div className="mt-8">
          <GhlConnectVisual />
        </div>
      </Section>

      <Section headline={AUDIT.headline} narrow>
        <p className="text-base leading-relaxed text-silver sm:text-[17px]">{AUDIT.body}</p>
        <p className="mt-4 text-base font-medium text-white">{AUDIT.keep}</p>
        <div className="mt-8">
          <CtaLink position="audit">
            {AUDIT.cta}
            <ArrowRight className="size-4" aria-hidden />
          </CtaLink>
          <p className={cn(captionText, "mt-4")}>{AUDIT.underCta}</p>
        </div>
      </Section>

      <Section headline={FAQ.headline} narrow>
        <dl className="space-y-8">
          {FAQ.items.map((item) => (
            <div key={item.question}>
              <dt>
                <h3 className="text-base font-semibold text-white">{item.question}</h3>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-silver sm:text-[15px]">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
