import type { ReactNode } from "react";
import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { LandingFaq } from "@/components/marketing/faq";
import {
  CtaButton,
  OfferBox,
  PrincipleNote,
  ProblemGrid,
  ProductPicture,
  ScarcityNote,
  SolutionGrid,
  WithWithout,
} from "@/components/marketing/framework-blocks";
import { AppTour, LiveLoop, LiveProcess, LiveRoles } from "@/components/marketing/framework-live";
import { LoopDemo, SkillPlans } from "@/components/marketing/agentic-sections";
import { AgentFlow } from "@/components/marketing/agentic-visuals";
import { ResearchStudioHero } from "@/components/marketing/growth-visuals";
import { BeamFrame, ShinyLabel } from "@/components/marketing/saas-frame";
import { GuardedRun } from "@/components/marketing/guarded-run";
import { APPROVAL, PROOF, SAFETY, SECTIONS, SITE_DESCRIPTION } from "@/lib/marketing/content";
import {
  COMPARE,
  FIXES,
  LANDING_FAQ,
  LANDING_FINAL,
  LANDING_HERO,
  OFFER,
  PAINS,
  PROCESS,
  ROLES,
  SUPPORT,
  landingProblems,
  picturesFor,
} from "@/lib/marketing/landing";
import { marketingDisplayTitle, marketingLead, marketingPageGutter, marketingSectionTitle, marketingShell, marketingSubhead } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/** How wide a full-width product picture is drawn, for the browser to pick the right file. */
const WIDE = "(min-width: 1152px) 1152px, 100vw";

function Section({ id, headline, children, tone = "plain" }: { id: string; headline: string; children: ReactNode; tone?: "plain" | "tint" }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border py-16 sm:py-24", tone === "tint" && "bg-muted/40")}
    >
      <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
        <h2 id={`${id}-title`} className={marketingSectionTitle}>
          {headline}
        </h2>
        <div className="mt-10">{children}</div>
      </BlurFade>
    </section>
  );
}

/**
 * The public landing page, in the order of the owner's framework: nav (in the header), hero,
 * results (off until there is real proof), problem, solution, the offer, with vs without, process,
 * roles, FAQ and the final call to action. One goal and one button throughout.
 */
export function LandingPage() {
  // The framework's refusals: an empty required section, or pains and fixes that do not match, stops the build.
  const problems = landingProblems();
  if (problems.length > 0) throw new Error(`The landing page cannot be published: ${problems.join(" ")}`);

  const home = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Vistrial", url: "https://vistrial.io", email: "contact@vistrial.io" },
      {
        "@type": "SoftwareApplication",
        name: "Vistrial",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        offers: { "@type": "Offer", price: OFFER.price.replace("$", ""), priceCurrency: "USD", description: `${OFFER.price} ${OFFER.per}. ${OFFER.credits}.` },
      },
    ],
  };

  const fixPictures = picturesFor("fix");
  const workPictures = picturesFor("work");
  const loopPictures = picturesFor("loop");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(home) }} />

      {/* 2. Hero: the copy from before the rebuild, by the owner's choice, and one button. Beside it, the agent at work on a sample. */}
      <section className={cn(marketingPageGutter, "relative pt-14 pb-16 sm:pt-20 sm:pb-24")}>
        <div className={cn(marketingShell, "grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12")}>
          <div>
            <ShinyLabel>{LANDING_HERO.label}</ShinyLabel>
            <h1 className={marketingDisplayTitle}>{LANDING_HERO.headline}</h1>
            <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{LANDING_HERO.supporting}</p>
            <div className="mt-8">
              <CtaButton position="hero" className="px-8!" />
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{LANDING_HERO.trust}</p>
          </div>
          <BeamFrame glow>
            <ResearchStudioHero />
          </BeamFrame>
        </div>
      </section>

      {/* Still the hero's picture: what goes in, the agent, and the draft that waits for you. */}
      <AgentFlow />

      {/* 3. Results: no proof, no section. */}
      {SECTIONS.proof ? (
        <Section id={PROOF.id} headline={PROOF.headline}>
          <p className={marketingLead}>{PROOF.body}</p>
        </Section>
      ) : null}

      {/* 4. Problem */}
      <Section id={PAINS.id} headline={PAINS.headline} tone="tint">
        <ProblemGrid />
      </Section>

      {/* 5. Solution: the same grid, one fix per pain, then what stands behind the fixes. */}
      <Section id={FIXES.id} headline={FIXES.headline}>
        <SolutionGrid />
        <div className="mt-6">
          <PrincipleNote />
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {fixPictures.map((picture, index) => (
            <ProductPicture
              key={picture.id}
              picture={picture}
              crop={index === 2 ? "max-h-[34rem]" : "max-h-[19rem]"}
              className={index === 2 ? "lg:col-span-2" : undefined}
              sizes={index === 2 ? WIDE : undefined}
            />
          ))}
        </div>

        {/* Where the work shows up: Tasks, the Briefing, Home and clients. Real screens. */}
        <div className="mt-14">
          <h3 className="font-heading text-2xl tracking-tight text-strong">{SUPPORT.work.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{SUPPORT.work.lead}</p>
          <div className="mt-6">
            <AppTour pictures={workPictures} />
          </div>
        </div>

        {/* The loop: the diagram, one change followed through, and the two screens it happens on. */}
        <div className="mt-14 grid gap-5">
          <LiveLoop />
          <div className="py-4">
            <LoopDemo />
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {loopPictures.map((picture) => (
              <ProductPicture key={picture.id} picture={picture} crop="max-h-[24rem]" />
            ))}
          </div>
        </div>

        {/* The safety behaviors, shown working in one sample run. It ends on the hold-to-approve step. */}
        <div className="mt-14">
          <h3 className="font-heading text-2xl tracking-tight text-strong">{SAFETY.headline}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{SAFETY.lead}</p>
          <div className="mt-6">
            <GuardedRun />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{APPROVAL.introBody}</p>
        </div>
      </Section>

      {/* 6. The offer: the one boxed thing on the page. */}
      <section id={OFFER.id} aria-labelledby="offer-title" className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border bg-muted/40 py-16 sm:py-24")}>
        <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
          <OfferBox />
        </BlurFade>
      </section>

      {/* 7. With vs without */}
      <Section id={COMPARE.id} headline={COMPARE.headline}>
        <WithWithout />
      </Section>

      {/* 8. Process */}
      <Section id={PROCESS.id} headline={PROCESS.headline} tone="tint">
        <div className="max-w-5xl">
          <LiveProcess />
        </div>
      </Section>

      {/* 9. Your role vs ours */}
      <Section id={ROLES.id} headline={ROLES.headline}>
        <LiveRoles />
        {/* What "the agents' part" means for each skill. */}
        <div className="mt-12">
          <h3 className="font-heading text-2xl tracking-tight text-strong">{SUPPORT.plans.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{SUPPORT.plans.lead}</p>
          <div className="mt-6">
            <SkillPlans />
          </div>
        </div>
      </Section>

      {/* 10. FAQ */}
      <Section id={LANDING_FAQ.id} headline={LANDING_FAQ.headline} tone="tint">
        <LandingFaq />
        <p className="mx-auto mt-6 max-w-3xl text-sm text-muted-foreground">
          <Link href={SAFETY.linkHref} className="font-medium text-brand-300 underline underline-offset-4">
            {SAFETY.linkLabel}
          </Link>
        </p>
      </Section>

      {/* 11. Final CTA: the same weight as the hero. */}
      <section id={LANDING_FINAL.id} aria-labelledby="final-title" className={cn(marketingPageGutter, "relative scroll-mt-24 border-t border-border py-20 text-center sm:py-28")}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 90% at 50% 110%, rgba(154,136,252,0.26) 0%, rgba(154,136,252,0.07) 40%, transparent 72%)" }}
        />
        <div className={cn(marketingShell, "relative flex max-w-4xl flex-col items-center")}>
          <span className="relative mb-7 flex size-14 items-center justify-center rounded-full border border-brand-400/40 bg-background shadow-[0_0_0_4px_rgba(154,136,252,0.12)]" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/vistrial-crest-ink-96.png" alt="" width={96} height={96} className="size-10" />
            <span className="live-pulse absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-success" />
          </span>
          <h2 id="final-title" className={cn(marketingDisplayTitle, "text-balance")}>
            {LANDING_FINAL.headline}
          </h2>
          <CtaButton position="final" className="mt-9 px-8!" />
          <ScarcityNote className="mt-4" />
        </div>
      </section>
    </>
  );
}
