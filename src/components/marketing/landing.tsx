import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";

import { BlurFade } from "@/components/ui/blur-fade";
import { AppTour, ProductPicture } from "@/components/marketing/app-screens";
import { AgentFlow } from "@/components/marketing/agentic-visuals";
import { LandingFaq } from "@/components/marketing/faq";
import { PhilosophySection } from "@/components/marketing/philosophy";
import {
  DoctrineFlow,
  EvidenceReport,
  PainList,
  ResearchStudioHero,
  ScatteredScene,
  SectionEyebrow,
  SkillMap,
  WorkforceMap,
} from "@/components/marketing/growth-visuals";
import { LoopDemo } from "@/components/marketing/agentic-sections";
import { GuardedRun } from "@/components/marketing/guarded-run";
import { BeamFrame, HeroAtmosphere, ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
import { IndustrySwitcher } from "@/components/marketing/saas-blocks";
import { Button } from "@/components/ui/button";
import {
  AGENTS_SECTION,
  APPROVAL,
  EVIDENCE,
  FAQ,
  FINAL_CTA,
  GROWTH_ARCHITECT,
  HOW,
  INDUSTRIES,
  PROBLEM,
  PROOF,
  SAFETY,
  SECTIONS,
} from "@/lib/marketing/content";
import { HERO } from "@/lib/marketing/content";
import { APP_SCREENS, picturesFor } from "@/lib/marketing/pictures";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";
import {
  marketingDisplayTitle,
  marketingLead,
  marketingPageGutter,
  marketingSectionTitle,
  marketingShell,
  marketingSubhead,
} from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const landingButton = "h-12! rounded-[8px]! before:rounded-[7px]!";
const landingOutline = "rounded-[8px]! border-border bg-card before:rounded-[7px]! hover:bg-muted";

function Section({
  id,
  eyebrow,
  headline,
  lead,
  children,
  align = "start",
}: {
  id?: string;
  eyebrow?: string;
  headline: string;
  lead?: string;
  children: ReactNode;
  align?: "start" | "center";
}) {
  const centered = align === "center";
  return (
    <section id={id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border py-20 sm:py-28")}>
      <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
        {eyebrow ? <SectionEyebrow>{eyebrow}</SectionEyebrow> : null}
        <h2 className={cn(marketingSectionTitle, centered && "mx-auto text-center")}>{headline}</h2>
        {lead ? <p className={cn(marketingLead, "mt-4", centered && "mx-auto text-center")}>{lead}</p> : null}
        <div className="mt-10">{children}</div>
      </BlurFade>
    </section>
  );
}

export function LandingPage() {
  const home = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Vistrial",
        url: "https://vistrial.io",
        email: "contact@vistrial.io",
      },
      {
        "@type": "SoftwareApplication",
        name: "Vistrial",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: HERO.supporting,
        offers: {
          "@type": "Offer",
          price: "179",
          priceCurrency: "USD",
          description: PRICING_DISPLAY.privateAccess.price,
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(home) }} />
      {SECTIONS.hero ? (
        <section className={cn(marketingPageGutter, "relative pb-16 pt-14 sm:pb-24 sm:pt-20")}>
          <HeroAtmosphere>
          <div className={cn(marketingShell, "grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]")}>
            <div>
              <ShinyLabel>Vistrial</ShinyLabel>
              <h1 className={marketingDisplayTitle}>{HERO.headline}</h1>
              <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{HERO.supporting}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button variant="gradient" size="xl" className={landingButton} render={<Link href="/request?from=hero" data-cta-position="hero" />}>
                  {HERO.primaryCta}
                </Button>
                <Button variant="outline" size="xl" className={landingOutline} render={<a href={`#${GROWTH_ARCHITECT.id}`} />}>
                  {HERO.secondaryCta}
                </Button>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{HERO.trust}</p>
            </div>
            <BeamFrame glow>
              <ResearchStudioHero />
            </BeamFrame>
          </div>
          </HeroAtmosphere>
        </section>
      ) : null}

      {SECTIONS.hero ? <AgentFlow /> : null}

      {SECTIONS.problem ? (
        <Section id={PROBLEM.id} headline={PROBLEM.headline}>
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10">
            <div className="min-w-0 space-y-6">
              <ScatteredScene />
              <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                <p>{PROBLEM.opening}</p>
                <p>{PROBLEM.scattered}</p>
              </div>
            </div>
            <PainList />
          </div>
          <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-6 text-sm text-strong sm:text-base">
            <span className="font-medium">{PROBLEM.bridge.text}</span>
            <a href={PROBLEM.bridge.href} className="inline-flex items-center gap-1.5 font-medium text-brand-300 underline-offset-4 hover:underline">
              {PROBLEM.bridge.link}
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </p>
        </Section>
      ) : null}

      {SECTIONS.philosophy ? <PhilosophySection /> : null}

      {SECTIONS.how ? (
        <Section id={HOW.id} headline={HOW.headline} lead={HOW.lead}>
          <DoctrineFlow />
        </Section>
      ) : null}

      {SECTIONS.growthArchitect ? (
        <Section id={GROWTH_ARCHITECT.id} eyebrow={GROWTH_ARCHITECT.eyebrow} headline={GROWTH_ARCHITECT.headline} lead={GROWTH_ARCHITECT.lead}>
          <SkillMap />
        </Section>
      ) : null}

      {/* The app itself: Tasks, the Briefing, Home and clients, one real screen after another. */}
      {SECTIONS.growthArchitect ? (
        <Section id={APP_SCREENS.id} eyebrow={APP_SCREENS.eyebrow} headline={APP_SCREENS.headline} lead={APP_SCREENS.lead}>
          <AppTour pictures={picturesFor("app")} />

          {/* What three of the skills hand back, as real screens. */}
          <div className="mt-14">
            <h3 className="font-heading text-xl tracking-tight text-strong sm:text-2xl">{APP_SCREENS.skillsTitle}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{APP_SCREENS.skillsLead}</p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {picturesFor("skill").map((picture, index) => (
                <ProductPicture
                  key={picture.id}
                  picture={picture}
                  crop={index === 2 ? "max-h-[34rem]" : "max-h-[19rem]"}
                  className={index === 2 ? "lg:col-span-2" : undefined}
                  sizes={index === 2 ? "(min-width: 1152px) 1152px, 100vw" : undefined}
                />
              ))}
            </div>
          </div>

          {/* Then the loop: one change followed from proposed to measured, and the two screens it happens on. */}
          <div className="mt-14">
            <LoopDemo />
            <div className="mt-8">
              <h3 className="font-heading text-xl tracking-tight text-strong sm:text-2xl">{APP_SCREENS.loopTitle}</h3>
              <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
                {picturesFor("loop").map((picture) => (
                  <ProductPicture key={picture.id} picture={picture} crop="max-h-[24rem]" />
                ))}
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {SECTIONS.evidence ? (
        <Section id={EVIDENCE.id} headline={EVIDENCE.headline} lead={EVIDENCE.lead}>
          <EvidenceReport />
        </Section>
      ) : null}

      {SECTIONS.agents ? (
        <Section id={AGENTS_SECTION.id} headline={AGENTS_SECTION.headline} lead={AGENTS_SECTION.lead}>
          <WorkforceMap />
        </Section>
      ) : null}

      {SECTIONS.industries ? (
        <Section id={INDUSTRIES.id} headline={INDUSTRIES.headline} lead={INDUSTRIES.lead}>
          <IndustrySwitcher />
          <p className={cn(marketingLead, "mt-8")}>{INDUSTRIES.closing}</p>
        </Section>
      ) : null}

      {SECTIONS.safety ? (
        <Section id={SAFETY.id} headline={SAFETY.headline} lead={SAFETY.lead}>
          <GuardedRun />
          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{APPROVAL.introBody}</span>
            <Link href={SAFETY.linkHref} className="font-medium text-brand-300 underline underline-offset-4">
              {SAFETY.linkLabel}
            </Link>
          </p>
        </Section>
      ) : null}

      {SECTIONS.pricing ? (
        <Section id="pricing" headline="Pricing">
          <div className="grid gap-4 lg:grid-cols-2">
            <SpotlightCard glow className="p-6">
              <h3 className="font-heading text-2xl text-strong">{PRICING_DISPLAY.privateAccess.name}</h3>
              <p className="mt-2 text-lg text-strong">{PRICING_DISPLAY.privateAccess.price}</p>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {PRICING_DISPLAY.privateAccess.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{PRICING_DISPLAY.privateAccess.why}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PRICING_DISPLAY.privateAccess.billingNote}</p>
              <Button variant="gradient" className={cn("mt-6", landingButton)} render={<Link href="/request?from=pricing" data-cta-position="pricing" />}>
                {PRICING_DISPLAY.privateAccess.cta}
              </Button>
            </SpotlightCard>
            <SpotlightCard className="p-6">
              <h3 className="font-heading text-2xl text-strong">{PRICING_DISPLAY.custom.name}</h3>
              <p className="mt-2 text-lg text-strong">{PRICING_DISPLAY.custom.price}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{PRICING_DISPLAY.custom.body}</p>
              <Button variant="outline" className={cn("mt-6", landingOutline)} render={<Link href="/contact?from=pricing" data-cta-position="pricing" />}>
                {PRICING_DISPLAY.custom.cta}
              </Button>
            </SpotlightCard>
          </div>
        </Section>
      ) : null}

      {SECTIONS.faq ? (
        <Section id={FAQ.id} headline={FAQ.headline}>
          <LandingFaq />
        </Section>
      ) : null}

      {SECTIONS.proof ? (
        <Section id={PROOF.id} headline={PROOF.headline}>
          <p className={marketingLead}>{PROOF.body}</p>
        </Section>
      ) : null}

      {SECTIONS.final ? (
        <section id={FINAL_CTA.id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border py-20 sm:py-28")}>
          <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
            <BeamFrame glow beamDelay={1.4} className="mx-auto max-w-3xl text-center">
              <h2 className={cn(marketingSectionTitle, "mx-auto text-center")}>{FINAL_CTA.headline}</h2>
              <p className={cn(marketingLead, "mx-auto mt-4 text-center")}>{FINAL_CTA.body}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button variant="gradient" size="xl" className={landingButton} render={<Link href="/request?from=final" data-cta-position="final" />}>
                  {FINAL_CTA.primary}
                </Button>
                <Button variant="outline" size="xl" className={landingOutline} render={<Link href={FINAL_CTA.secondaryHref} />}>
                  {FINAL_CTA.secondary}
                </Button>
              </div>
            </BeamFrame>
          </BlurFade>
        </section>
      ) : null}
    </>
  );
}
