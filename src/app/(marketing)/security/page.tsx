import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/chrome";
import { ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
import { Button } from "@/components/ui/button";
import { aiLines, choiceLines, glanceCards, neverDo, sourceLines, underTheHood } from "@/lib/trust/security-copy";
import { formatTrustDate } from "@/lib/trust/model";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingDisplayTitle, marketingLead, marketingPageGutter, marketingSectionTitle, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = publicPageMetadata({
  title: "Security",
  description: "What Vistrial reads, who can see it, what needs your approval, and what we never do.",
  path: "/security",
});

export default async function SecurityPage() {
  const trust = await loadTrustPublic();
  const cards = glanceCards(trust.switches);
  const ai = aiLines(trust.switches);
  const hood = underTheHood(trust.switches);

  return (
    <MarketingShell headerAction="none">
      <article>
        <section className={cn(marketingPageGutter, "pb-12 pt-14 sm:pt-20")}>
          <div className={marketingShell}>
            <ShinyLabel>Security</ShinyLabel>
            <h1 className={marketingDisplayTitle}>What Vistrial can see, and what it can never do.</h1>
            <p className={cn(marketingLead, "mt-6")}>
              Vistrial researches public sources and reads the accounts you connect, then drafts work for you to approve. Here is where that information comes from, how it is kept apart, and what we never do.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="gradient" className="h-12! rounded-[8px]! before:rounded-[7px]!" render={<Link href="/security/review" />}>
                Request a security review
              </Button>
              <Button variant="outline" className="h-12! rounded-[8px]! border-border! before:rounded-[7px]!" render={<a href="#glance" />}>
                Read the details
              </Button>
            </div>
          </div>
        </section>

        <section id="glance" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>At a glance</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <li key={card.title}>
                  <SpotlightCard>
                    <h3 className="font-heading text-lg text-strong">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                  </SpotlightCard>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="sources" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>What Vistrial reads</h2>
            <p className={cn(marketingLead, "mt-4")}>Public sources for research, and only the accounts and files your team connects or adds.</p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {sourceLines().map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              The <Link href="/privacy" className="text-brand-300 underline">Privacy Policy</Link> has the detail, and <Link href="/bot" className="text-brand-300 underline">VistrialBot</Link> says how public pages are read.
            </p>
          </div>
        </section>

        <section id="approval" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Approval before anything is used</h2>
            <p className={cn(marketingLead, "mt-4")}>
              Work you ask for shows its plan and the most it can cost first, and starts when a person presses Start. The weekly plan and trend posts are written on a schedule, inside the same credit limits. A report, an analysis or an ad set is a draft until a person approves it. Vistrial does not publish or send anything for you.
            </p>
          </div>
        </section>

        <section id="ai" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>AI with guardrails</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {ai.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="never" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>What we never do</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-strong">
              {neverDo(trust.switches).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="choices" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Your choices</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {choiceLines().map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                <Link href="/privacy/requests" className="text-brand-300 underline">Ask for an export, a correction, or deletion</Link>. A person verifies the request before anything is deleted or sent.
              </li>
            </ul>
          </div>
        </section>

        <section id="hood" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Under the hood</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {hood.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/security/subprocessors" className="text-brand-300 underline">Subprocessors</Link>
            </p>
          </div>
        </section>

        <section id="today" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Where we are today</h2>
            <p className={cn(marketingLead, "mt-4")}>
              Vistrial is not certified under SOC 2, ISO 27001, or a similar standard. There is no badge for that. We will answer a security questionnaire.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="gradient" className="h-12! rounded-[8px]! before:rounded-[7px]!" render={<Link href="/security/review" />}>
                Request a security review
              </Button>
              <Button variant="outline" className="h-12! rounded-[8px]! border-border! before:rounded-[7px]!" render={<Link href="/security/report" />}>
                Report a vulnerability
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Email <a className="text-brand-300 underline" href={`mailto:${trust.securityEmail}`}>{trust.securityEmail}</a> or use the report page.
            </p>
            <p className="mt-8 text-xs text-muted-foreground">Last updated: {formatTrustDate(trust.securityUpdatedOn)}</p>
          </div>
        </section>
      </article>
    </MarketingShell>
  );
}
