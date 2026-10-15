import type { ReactNode } from "react";
import Link from "next/link";

import { ApprovalExample, HeroExample } from "@/components/marketing/hero-example";
import { BeamFrame, HeroAtmosphere, ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
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
}: {
  id?: string;
  headline: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(marketingPageGutter, "scroll-mt-24 py-16 sm:py-24")}>
      <div className={marketingShell}>
        <h2 className={marketingSectionTitle}>{headline}</h2>
        {lead ? <p className={cn(marketingLead, "mt-4")}>{lead}</p> : null}
        <div className="mt-8">{children}</div>
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
          <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-silver">
            <p>{PROBLEM.opening}</p>
            <p>{PROBLEM.scattered}</p>
          </div>
          <ul className="mt-8 grid gap-3">
            {PROBLEM.pains.map((pain) => (
              <li key={pain} className="rounded-2xl border border-white/10 px-4 py-3 text-sm leading-relaxed text-white">
                {pain}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {SECTIONS.how ? (
        <Section id={HOW.id} headline={HOW.headline}>
          <ol className="grid gap-4 md:grid-cols-3">
            {HOW.steps.map((step) => (
              <li key={step.id}>
                <SpotlightCard>
                  <h3 className="font-heading text-xl text-white">{step.title}</h3>
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
                  <AgentName agentId={agent.id} size="md" />
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
              <li key={card.id} className="rounded-2xl border border-white/10 p-5">
                <h3 className="font-heading text-xl text-white">{card.title}</h3>
                <p className="mt-2 text-sm text-silver">{card.motion}</p>
                <ul className="mt-4 space-y-2 text-sm text-white">
                  {card.watches.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className={cn(marketingLead, "mt-8")}>{INDUSTRIES.closing}</p>
        </Section>
      ) : null}

      {SECTIONS.safety ? (
        <Section id={SAFETY.id} headline={SAFETY.headline} lead={SAFETY.lead}>
          <ul className="grid gap-3">
            {SAFETY.items.map((item) => (
              <li key={item} className="rounded-2xl border border-white/10 px-4 py-3 text-sm leading-relaxed text-white">
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-start">
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
            <SpotlightCard className="rounded-3xl p-6">
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
          <div className="divide-y divide-white/10 rounded-2xl border border-white/10">
            {FAQ.items.map((item) => (
              <details key={item.q} className="group px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-white">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-silver">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>
      ) : null}

      {SECTIONS.proof ? (
        <Section id={PROOF.id} headline={PROOF.headline}>
          <p className={marketingLead}>{PROOF.body}</p>
        </Section>
      ) : null}

      {SECTIONS.final ? (
        <Section id={FINAL_CTA.id} headline={FINAL_CTA.headline} lead={FINAL_CTA.body}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="gradient" size="xl" className="rounded-full" render={<Link href="/request?from=final" data-cta-position="final" />}>
              {FINAL_CTA.primary}
            </Button>
            <Button variant="outline" size="xl" className="rounded-full" render={<Link href={FINAL_CTA.secondaryHref} />}>
              {FINAL_CTA.secondary}
            </Button>
          </div>
        </Section>
      ) : null}
    </>
  );
}
