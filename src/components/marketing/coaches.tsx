import { ArrowRight } from "lucide-react";

import { CtaLink } from "@/components/marketing/cta-link";
import { CtaGroup, StatusPill } from "@/components/marketing/primitives";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Particles } from "@/components/ui/particles";
import { COACHES } from "@/lib/marketing/copy";
import { marketingDisplayTitle, marketingPageGutter, marketingShell, marketingSubhead } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function CoachesOffer() {
  const headlineBefore = COACHES.headline.slice(0, COACHES.headline.indexOf(COACHES.headlineAccent));

  return (
    <section
      className={cn(marketingPageGutter, "relative overflow-hidden pb-20 pt-16 text-center sm:pb-28 sm:pt-24")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-brand-500/18 via-brand-500/5 to-transparent"
      />
      <Particles className="absolute inset-0 z-0" quantity={48} color="#9A88FC" ease={80} size={0.5} />
      <div className={cn(marketingShell, "relative z-10")}>
        <div className="animate-rise mx-auto max-w-5xl">
          <StatusPill className="max-w-3xl whitespace-normal px-4 py-2">
            <AnimatedShinyText className="mx-0 min-w-0 max-w-none text-balance text-center text-[11px] font-semibold leading-relaxed tracking-[0.14em] whitespace-normal text-brand-200 uppercase dark:text-brand-200">
              {COACHES.pill}
            </AnimatedShinyText>
          </StatusPill>
          <h1 className={cn(marketingDisplayTitle, "mx-auto mt-6 max-w-5xl uppercase")}>
            {headlineBefore}
            <span className="text-brand-300 italic">{COACHES.headlineAccent}</span>
          </h1>
          <p className={cn(marketingSubhead, "mx-auto mt-6 max-w-2xl")}>{COACHES.subhead}</p>
          <p className="mx-auto mt-6 max-w-2xl text-base font-semibold text-white sm:text-lg">{COACHES.qualifier}</p>
          <CtaGroup align="center">
            <CtaLink position="hero" size="xl" className="rounded-full px-7 tracking-[0.08em] uppercase">
              {COACHES.cta}
              <ArrowRight
                aria-hidden="true"
                className="transition-transform in-[[data-slot=button]:hover]:translate-x-0.5"
              />
            </CtaLink>
          </CtaGroup>
          <ul className="mx-auto mt-10 grid max-w-3xl gap-6 border-t border-white/10 pt-8 sm:grid-cols-3 sm:gap-4">
            {COACHES.terms.map((term) => (
              <li key={term} className="text-sm font-medium text-white sm:text-base">
                {term}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
