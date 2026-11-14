import type { ReactNode } from "react";
import Link from "next/link";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { ArrowRight, Check, X } from "@/components/icons";
import { SectionEyebrow } from "@/components/marketing/growth-visuals";
import { SpotlightCard } from "@/components/marketing/saas-frame";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { agentOfPage, type AgentPage } from "@/lib/marketing/agent-pages";
import {
  marketingDisplayTitle,
  marketingInset,
  marketingLead,
  marketingPageGutter,
  marketingSectionTitle,
  marketingShell,
  marketingSubhead,
} from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const landingButton = "h-12! rounded-[8px]! before:rounded-[7px]!";
const landingOutline = "rounded-[8px]! border-border bg-card before:rounded-[7px]! hover:bg-muted";

function Section({ id, eyebrow, headline, lead, children }: { id?: string; eyebrow?: string; headline: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn(marketingPageGutter, "scroll-mt-24 border-t border-border py-20 sm:py-28")}>
      <BlurFade inView offset={12} blur="2px" duration={0.55} className={marketingShell}>
        {eyebrow ? <SectionEyebrow>{eyebrow}</SectionEyebrow> : null}
        <h2 className={marketingSectionTitle}>{headline}</h2>
        {lead ? <p className={cn(marketingLead, "mt-4")}>{lead}</p> : null}
        <div className="mt-10">{children}</div>
      </BlurFade>
    </section>
  );
}

/** The five questions, as a card: what every result must let the team answer. */
function StandardCard({ page }: { page: AgentPage }) {
  return (
    <SpotlightCard glow className="flex flex-col gap-4 p-6">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase">{page.standard.title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{page.standard.lead}</p>
      <ol className="grid gap-2.5">
        {page.standard.questions.map((question, index) => (
          <li key={question} className="flex items-baseline gap-3">
            <span className="font-heading text-sm text-brand-400 tabular-nums" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-heading text-base text-strong sm:text-lg">{question}</span>
          </li>
        ))}
      </ol>
    </SpotlightCard>
  );
}

/**
 * One agent's public page: its doctrine, how it works, where the work happens, its skills, what it will never
 * do, and the standard it is held to. Names, status and skills come from the catalog, so the page cannot call
 * an agent live before it is.
 */
export function AgentLanding({ page }: { page: AgentPage }) {
  const agent = agentOfPage(page);
  const live = agent.status === "live";
  return (
    <>
      <section className={cn(marketingPageGutter, "relative pb-16 pt-14 sm:pb-24 sm:pt-20")}>
        <div className={cn(marketingShell, "grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]")}>
          <div>
            <p className="mb-5 flex flex-wrap items-center gap-3">
              <AgentAvatar name={agent.name} size="md" />
              <span className="font-heading text-lg text-strong">{agent.name}</span>
              <span className="text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase">{page.eyebrow}</span>
              {live ? (
                <Badge variant="success" size="sm">
                  Live
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  In development
                </Badge>
              )}
            </p>
            <h1 className={marketingDisplayTitle}>{page.headline}</h1>
            <p className={cn(marketingSubhead, "mt-6 max-w-xl")}>{page.supporting}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="gradient" size="xl" className={landingButton} render={<Link href={page.cta.href} data-cta-position="agent-hero" />}>
                {page.cta.label}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" size="xl" className={landingOutline} render={<a href="#doctrine" />}>
                Read the doctrine
              </Button>
            </div>
            {live ? null : <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{page.notYet}</p>}
          </div>
          <StandardCard page={page} />
        </div>
      </section>

      <Section id="doctrine" eyebrow="The doctrine" headline={page.doctrine.title} lead={page.doctrine.lead}>
        <div className="space-y-4">
          {page.doctrine.paragraphs.map((paragraph) => (
            <p key={paragraph} className={marketingLead}>
              {paragraph}
            </p>
          ))}
        </div>
        <ol className="mt-10 grid gap-3 md:grid-cols-5" aria-label="How it works, in order">
          {page.doctrine.steps.map((step, index) => (
            <li key={step.id} className={cn(marketingInset, "relative flex flex-col gap-2 px-4 py-4")}>
              <span className="font-heading text-sm text-brand-400 tabular-nums" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-heading text-lg text-strong">{step.name}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{step.does}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="principles" eyebrow="Six principles" headline="How Dealmaker thinks">
        <ol className="grid gap-4 md:grid-cols-2">
          {page.principles.map((principle) => (
            <li key={principle.id} className={cn(marketingInset, "flex flex-col gap-3 px-5 py-5")}>
              <p className="flex items-baseline gap-3">
                <span className="font-heading text-sm text-brand-400" aria-hidden>
                  {principle.numeral}
                </span>
                <span className="font-heading text-lg text-strong">{principle.title}</span>
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{principle.body}</p>
              <p className="border-t border-border pt-3 text-sm leading-relaxed text-strong">
                <span className="font-medium">In the product: </span>
                {principle.inProduct}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-2 border-t border-border pt-8">
          <h3 className="font-heading text-xl tracking-tight text-strong">{page.foundation.title}</h3>
          <p className={marketingLead}>{page.foundation.body}</p>
          <p className={marketingLead}>{page.foundation.controls}</p>
        </div>
      </Section>

      <Section id="tabs" eyebrow="Inside Vistrial" headline={page.tabs.title} lead={page.tabs.lead}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.tabs.items.map((tab) => (
            <li key={tab.id} className={cn(marketingInset, "flex flex-col gap-2 px-5 py-5")}>
              <span className="font-heading text-lg text-strong">{tab.name}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{tab.does}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="skills" eyebrow="What it hands back" headline={page.skills.title} lead={page.skills.lead}>
        <ul className="grid gap-4 md:grid-cols-2">
          {agent.skills.map((skill) => (
            <li key={skill.slug} className={cn(marketingInset, "flex flex-col gap-2 px-5 py-5")}>
              <p className="flex items-center justify-between gap-3">
                <span className="font-heading text-lg text-strong">{skill.name}</span>
                <Badge variant={skill.status === "available" ? "success" : "outline"} size="sm">
                  {skill.status === "available" ? "Available" : "Coming soon"}
                </Badge>
              </p>
              <span className="text-sm leading-relaxed text-muted-foreground">{skill.handsBack}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{skill.promise}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="never" headline={page.never.title}>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <ul className="grid gap-3">
            {page.never.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-strong">
                <X className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="font-heading text-xl tracking-tight text-strong">{page.connects.title}</h3>
            <ul className="mt-4 grid gap-2">
              {page.connects.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm">
                  <span className="flex items-center gap-2 text-strong">
                    {item.status === "today" ? <Check className="size-4 text-success" aria-hidden /> : null}
                    {item.label}
                  </span>
                  <span className="text-muted-foreground">{item.status === "today" ? "Today" : "Coming soon"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <section className={cn(marketingPageGutter, "border-t border-border py-20 sm:py-28")}>
        <div className={cn(marketingShell, "flex flex-col items-start gap-5")}>
          <h2 className={marketingSectionTitle}>{page.cta.headline}</h2>
          <p className={marketingLead}>{page.cta.body}</p>
          <Button variant="gradient" size="xl" className={landingButton} render={<Link href={page.cta.href} data-cta-position="agent-final" />}>
            {page.cta.label}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </section>
    </>
  );
}
