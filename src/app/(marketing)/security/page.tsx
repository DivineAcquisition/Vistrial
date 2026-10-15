import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/chrome";
import { ShinyLabel, SpotlightCard } from "@/components/marketing/saas-frame";
import { Button } from "@/components/ui/button";
import { aiLines, glanceCards, neverDo, underTheHood } from "@/lib/trust/security-copy";
import { formatTrustDate } from "@/lib/trust/model";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingDisplayTitle, marketingLead, marketingPageGutter, marketingSectionTitle, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Security",
  description: "How Vistrial protects lead data: where it comes from, who can see it, and what we never do.",
};

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
            <h1 className={marketingDisplayTitle}>Your leads are your business. We handle them like it.</h1>
            <p className={cn(marketingLead, "mt-6")}>
              Vistrial brings together calls, touches, and outcomes for each lead. Here is where that data comes from, how it is protected, and what we never do.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="gradient" className="h-12! rounded-[8px]! before:rounded-[7px]!" render={<Link href="/security/review" />}>
                Request a security review
              </Button>
              <Button variant="outline" className="h-12! rounded-[8px]! border-[#2a2833]! before:rounded-[7px]!" render={<a href="#glance" />}>
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
                    <h3 className="font-heading text-lg text-white">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-silver">{card.body}</p>
                  </SpotlightCard>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="sources" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Where your data comes from</h2>
            <p className={cn(marketingLead, "mt-4")}>One lead can show up in more than one tool. Vistrial reads the sources you connect.</p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-silver">
              <li>CRM: GoHighLevel works today. Contacts, stages, and call activity that the connection is allowed to read. Other CRMs are not listed here until they are built.</li>
              <li>Call transcripts, when a recording source is connected. The case file is built from that text.</li>
              <li>Calendar bookings, when a calendar is connected: booked, rescheduled, canceled, and no-show events that connection can see.</li>
              <li>Form events sent to a webhook address that belongs to one workspace.</li>
              <li>Notes and corrections your team types in Vistrial.</li>
            </ul>
            <p className="mt-4 text-sm text-silver">Airtable is not a live connector. HubSpot is not a live connector.</p>
          </div>
        </section>

        <section id="follow-up" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Safe follow-up</h2>
            <p className={cn(marketingLead, "mt-4")}>
              Relay prepares drafts. Your team approves each one. Right before sending, Vistrial checks consent and opt-outs, do-not-contact markers, and quiet hours (no messages between 8 pm and 8 am in the local time of the lead, by default). If a check fails, nothing is sent.
            </p>
          </div>
        </section>

        <section id="ai" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>AI with guardrails</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-silver">
              {ai.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="never" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>What we never do</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-white">
              {neverDo(trust.switches).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="choices" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Your choices</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-silver">
              <li>Disconnect a source. New data from that source stops. Existing case files stay until you ask for deletion.</li>
              <li>
                <Link href="/privacy/requests" className="text-brand-300 underline">Ask for an export, a correction, or deletion</Link>. A person verifies the request. Nothing is deleted or exported automatically.
              </li>
            </ul>
          </div>
        </section>

        <section id="hood" className={cn(marketingPageGutter, "scroll-mt-24 py-12")}>
          <div className={marketingShell}>
            <h2 className={marketingSectionTitle}>Under the hood</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-silver">
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
              <Button variant="outline" className="h-12! rounded-[8px]! border-[#2a2833]! before:rounded-[7px]!" render={<Link href="/security/report" />}>
                Report a vulnerability
              </Button>
            </div>
            <p className="mt-4 text-sm text-silver">
              Email <a className="text-brand-300 underline" href={`mailto:${trust.securityEmail}`}>{trust.securityEmail}</a> or use the report page.
            </p>
            <p className="mt-8 text-xs text-dim">Last updated: {formatTrustDate(trust.securityUpdatedOn)}</p>
          </div>
        </section>
      </article>
    </MarketingShell>
  );
}
