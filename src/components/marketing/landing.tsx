import type { ReactNode } from "react";
import Link from "next/link";

import { LandingFaq } from "@/components/marketing/faq";
import { ApprovalExample, HeroExample } from "@/components/marketing/hero-example";
import { BeamFrame, HeroAtmosphere, ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <section id={id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-white/[0.06] py-20 sm:py-28")}>
      <div className={marketingShell}>
        <h2 className={cn(marketingSectionTitle, centered && "mx-auto text-center")}>{headline}</h2>
        {lead ? <p className={cn(marketingLead, "mt-4", centered && "mx-auto text-center")}>{lead}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
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
        <section className={cn(marketingPageGutter, "relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20")}>
          <HeroAtmosphere>
          <div className={cn(marketingShell, "grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]")}>
            <div>
              <ShinyLabel>Vistrial</ShinyLabel>
              <h1 className={marketingDisplayTitle}>{HERO.headline}</h1>
              <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{HERO.supporting}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button variant="gradient" size="xl" className="rounded-full" render={<Link href="/request?from=hero" data-cta-position="hero" />}>
                  {HERO.primaryCta}
                </Button>
                <Button variant="outline" size="xl" className="rounded-full" render={<a href="#how" />}>
                  {HERO.secondaryCta}
                </Button>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-silver">{HERO.trust}</p>
            </div>
            <BeamFrame>
              <HeroExample />
            </BeamFrame>
          </div>
          </HeroAtmosphere>
        </section>
      ) : null}

      {SECTIONS.problem ? (
        <Section headline={PROBLEM.headline}>
          <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4 text-[15px] leading-relaxed text-silver sm:text-base">
              <p>{PROBLEM.opening}</p>
              <p>{PROBLEM.scattered}</p>
            </div>
            <ul className="grid gap-3">
              {PROBLEM.pains.map((pain, index) => (
                <li key={pain}>
                  <SpotlightCard className="flex items-start gap-3">
                    <span className="font-heading text-sm text-brand-300" aria-hidden>
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

      {SECTIONS.how ? (
        <Section id={HOW.id} headline={HOW.headline}>
          <ol className="grid gap-4 md:grid-cols-3">
            {HOW.steps.map((step, index) => (
              <li key={step.id}>
                <SpotlightCard className="relative overflow-hidden">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-4 right-3 font-heading text-6xl text-white/[0.06]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Badge variant="outline" size="sm">
                    {String(index + 1).padStart(2, "0")}
                  </Badge>
                  <h3 className="mt-4 font-heading text-2xl text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-silver">{step.body}</p>
                </SpotlightCard>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {SECTIONS.agents ? (
        <Section id={AGENTS_SECTION.id} headline={AGENTS_SECTION.headline} lead={AGENTS_SECTION.lead}>
          <ul className="grid gap-4 sm:grid-cols-2">
            {AGENT_LIST.map((agent) => (
              <li key={agent.id}>
                <SpotlightCard>
                  <AgentName agentId={agent.id} size="lg" />
                  <p className="mt-3 text-sm leading-relaxed text-silver">{agent.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white">{agent.promise}</p>
                </SpotlightCard>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {SECTIONS.industries ? (
        <Section id={INDUSTRIES.id} headline={INDUSTRIES.headline} lead={INDUSTRIES.lead}>
          <ul className="grid gap-4 lg:grid-cols-3">
            {INDUSTRIES.cards.map((card) => (
              <li key={card.id}>
                <SpotlightCard>
                  <h3 className="font-heading text-xl text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-silver">{card.motion}</p>
                  <ul className="mt-4 space-y-2 text-sm text-white">
                    {card.watches.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </SpotlightCard>
              </li>
            ))}
          </ul>
          <p className={cn(marketingLead, "mt-8")}>{INDUSTRIES.closing}</p>
        </Section>
      ) : null}

      {SECTIONS.safety ? (
        <Section id={SAFETY.id} headline={SAFETY.headline} lead={SAFETY.lead}>
          <ul className="grid gap-3 sm:grid-cols-2">
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
            <SpotlightCard className="rounded-3xl p-6 ring-1 ring-brand-400/30">
              <h3 className="font-heading text-2xl text-white">{PRICING_DISPLAY.privateAccess.name}</h3>
              <p className="mt-2 text-lg text-white">{PRICING_DISPLAY.privateAccess.price}</p>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-silver">
                {PRICING_DISPLAY.privateAccess.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.privateAccess.why}</p>
              <p className="mt-3 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.privateAccess.billingNote}</p>
              <Button variant="gradient" className="mt-6 rounded-full" render={<Link href="/request?from=pricing" data-cta-position="pricing" />}>
                {PRICING_DISPLAY.privateAccess.cta}
              </Button>
            </SpotlightCard>
            <SpotlightCard className="rounded-3xl p-6">
              <h3 className="font-heading text-2xl text-white">{PRICING_DISPLAY.custom.name}</h3>
              <p className="mt-2 text-lg text-white">{PRICING_DISPLAY.custom.price}</p>
              <p className="mt-4 text-sm leading-relaxed text-silver">{PRICING_DISPLAY.custom.body}</p>
              <Button variant="outline" className="mt-6 rounded-full" render={<Link href="/contact?from=pricing" data-cta-position="pricing" />}>
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
        <Section id={FINAL_CTA.id} headline={FINAL_CTA.headline} lead={FINAL_CTA.body} align="center">
          <BeamFrame>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button variant="gradient" size="xl" className="rounded-full" render={<Link href="/request?from=final" data-cta-position="final" />}>
                {FINAL_CTA.primary}
              </Button>
              <Button variant="outline" size="xl" className="rounded-full" render={<Link href={FINAL_CTA.secondaryHref} />}>
                {FINAL_CTA.secondary}
              </Button>
            </div>
          </BeamFrame>
        </Section>
      ) : null}
    </>
  );
}
