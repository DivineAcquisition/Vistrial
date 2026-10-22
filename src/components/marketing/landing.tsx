import type { ReactNode } from "react";
import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { LandingFaq } from "@/components/marketing/faq";
import { ApprovalExample, HeroExample } from "@/components/marketing/hero-example";
import { BeamFrame, HeroAtmosphere, ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
import { CaseFileBoard, IndustrySwitcher, StackStrip } from "@/components/marketing/saas-blocks";
import { AgentScene, ProblemScene, SafetyScene } from "@/components/marketing/section-scenes";
import { Button } from "@/components/ui/button";
import { HowItWorks } from "@/components/ui/how-it-works";
import { glowColorForAccent } from "@/components/ui/glow-color";
import { GlowCard } from "@/components/ui/spotlight-card";
import { AgentName } from "@/components/live/agent-identity";
import { AGENT_LIST } from "@/lib/agents/roster";
import {
  AGENTS_SECTION,
  FAQ,
  FINAL_CTA,
  HOW,
  INDUSTRIES,
  PROBLEM,
  PROOF,
  SAFETY,
  SECTIONS,
} from "@/lib/marketing/content";
import { HERO } from "@/lib/marketing/content";
import { CASE_FILE } from "@/lib/marketing/copy";
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

const landingButton = "h-12! rounded-[8px]! border-brand-800! before:rounded-[7px]!";
const landingOutline = "rounded-[8px]! border-[#2a2833] bg-[#1c1a27] before:rounded-[7px]! hover:bg-[#262333]";

function Section({
  id,
  headline,
  lead,
  children,
  align = "start",
}: {
  id?: string;
  headline: string;
  lead?: string;
  children: ReactNode;
  align?: "start" | "center";
}) {
  const centered = align === "center";
  return (
    <section id={id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-[#2a2833] py-20 sm:py-28")}>
      <BlurFade inView offset={12} blur="8px" duration={0.55} className={marketingShell}>
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
          price: "97",
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
                <Button variant="outline" size="xl" className={landingOutline} render={<a href="#how" />}>
                  {HERO.secondaryCta}
                </Button>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-silver">{HERO.trust}</p>
            </div>
            <GlowCard customSize glowColor="brand" className="w-full p-5 sm:p-6">
              <HeroExample />
            </GlowCard>
          </div>
          </HeroAtmosphere>
        </section>
      ) : null}

      {SECTIONS.hero ? <StackStrip /> : null}

      {SECTIONS.problem ? (
        <Section headline={PROBLEM.headline}>
          <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <ProblemScene />
              <div className="space-y-4 text-[15px] leading-relaxed text-silver sm:text-base">
                <p>{PROBLEM.opening}</p>
                <p>{PROBLEM.scattered}</p>
              </div>
            </div>
            <ul className="grid gap-3">
              {PROBLEM.pains.map((pain, index) => (
                <li key={pain}>
                  <SpotlightCard className="flex items-start gap-3">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#2a2833] bg-[#12111a] px-1.5 font-heading text-xs text-white" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-relaxed text-white">{pain}</span>
                  </SpotlightCard>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      {SECTIONS.how ? <HowItWorks id={HOW.id} /> : null}

      {SECTIONS.how ? (
        <Section headline={CASE_FILE.headline}>
          <CaseFileBoard />
        </Section>
      ) : null}

      {SECTIONS.agents ? (
        <Section id={AGENTS_SECTION.id} headline={AGENTS_SECTION.headline} lead={AGENTS_SECTION.lead}>
          <ul className="grid gap-4 sm:grid-cols-2">
            {AGENT_LIST.map((agent) => (
              <li key={agent.id}>
                <GlowCard customSize glowColor={glowColorForAccent(agent.accentKey)} className="h-full w-full p-5">
                  <AgentScene id={agent.id} />
                  <div className="mt-4">
                    <AgentName agentId={agent.id} size="lg" />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-silver">{agent.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white">{agent.promise}</p>
                </GlowCard>
              </li>
            ))}
          </ul>
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
          <SafetyScene />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {SAFETY.items.map((item) => (
              <li key={item}>
                <SpotlightCard>
                  <p className="text-sm leading-relaxed text-white">{item}</p>
                </SpotlightCard>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-start">
            <p>
              <Link href={SAFETY.linkHref} className="text-sm font-medium text-brand-300 underline">
                {SAFETY.linkLabel}
              </Link>
            </p>
            <ApprovalExample />
          </div>
        </Section>
      ) : null}

      {SECTIONS.pricing ? (
        <Section id="pricing" headline="Pricing">
          <div className="grid gap-4 lg:grid-cols-2">
            <SpotlightCard glow className="p-6">
              <h3 className="font-heading text-2xl text-white">{PRICING_DISPLAY.privateAccess.name}</h3>
              <p className="mt-2 text-lg text-white">{PRICING_DISPLAY.privateAccess.price}</p>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-silver">
                {PRICING_DISPLAY.privateAccess.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.privateAccess.why}</p>
              <p className="mt-3 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.privateAccess.billingNote}</p>
              <Button variant="gradient" className={cn("mt-6", landingButton)} render={<Link href="/request?from=pricing" data-cta-position="pricing" />}>
                {PRICING_DISPLAY.privateAccess.cta}
              </Button>
            </SpotlightCard>
            <SpotlightCard className="p-6">
              <h3 className="font-heading text-2xl text-white">{PRICING_DISPLAY.custom.name}</h3>
              <p className="mt-2 text-lg text-white">{PRICING_DISPLAY.custom.price}</p>
              <p className="mt-4 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.custom.body}</p>
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
        <section id={FINAL_CTA.id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-[#2a2833] py-20 sm:py-28")}>
          <BlurFade inView offset={12} blur="8px" duration={0.55} className={marketingShell}>
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
