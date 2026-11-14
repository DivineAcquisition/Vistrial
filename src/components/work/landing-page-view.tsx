"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { ArrowRight, Check, TriangleAlert } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FAQ_TOPIC_WORDS, SECTION_BY_KEY } from "../../../convex/skills/landingTeardown/framework";
import type { PageLayout } from "../../../convex/skills/landingPageBuild/shapes";

export type LandingPageRow = { id: string; title: string; status: string; layout: PageLayout | null; failed: string[]; leftOut: string[] };

function Section({ name, children, className }: { name: keyof typeof SECTION_BY_KEY; children: React.ReactNode; className?: string }) {
  const section = SECTION_BY_KEY[name];
  return (
    <section className={cn("grid gap-3 border-t border-border/60 px-4 py-6 sm:px-8", className)} aria-label={section.name}>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {section.name} <span className="font-normal tracking-normal normal-case">· {section.job}</span>
      </p>
      {children}
    </section>
  );
}

function Button({ text }: { text: string }) {
  return <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{text}</span>;
}

/** One built page, laid out the way the framework orders it, so a person sees the page before anyone builds it. */
export function LandingPagePreview({ page }: { page: PageLayout }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <span className="font-heading text-sm text-strong">Logo</span>
        <Button text={page.nav.cta} />
      </div>
      <Section name="hero" className="justify-items-center text-center">
        {page.hero.qualifier ? <span className="rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs text-primary">{page.hero.qualifier}</span> : null}
        <h3 className="max-w-2xl font-heading text-2xl text-balance text-strong sm:text-3xl">{page.hero.headline}</h3>
        <p className="max-w-xl text-muted-foreground">{page.hero.subline}</p>
        <Button text={page.hero.cta} />
        {page.hero.scarcity ? <p className="text-xs text-muted-foreground">{page.hero.scarcity}</p> : null}
      </Section>
      {page.results.length ? (
        <Section name="results">
          <ul className="grid gap-3 sm:grid-cols-3">
            {page.results.map((card) => (
              <li key={card.quote} className="grid gap-1 rounded-lg border border-border p-3">
                <span className="font-heading text-2xl text-strong">{card.metric}</span>
                <span className="text-sm text-muted-foreground">{card.context}</span>
                <span className="text-sm italic">&ldquo;{card.quote}&rdquo;</span>
                <span className="text-xs text-muted-foreground">
                  {card.name}
                  {card.role ? `, ${card.role}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section name="problem">
        <ul className="grid gap-2 sm:grid-cols-3">
          {page.problem.map((pain) => (
            <li key={pain.moment} className="grid gap-1 rounded-lg border border-border p-3 text-sm">
              <span className="text-strong">{pain.moment}</span>
              {pain.cost ? <span className="text-xs text-destructive">{pain.cost}</span> : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section name="solution">
        <ul className="grid gap-2 sm:grid-cols-3">
          {page.solution.map((fix) => (
            <li key={fix.outcome} className="flex gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-strong">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              {fix.outcome}
            </li>
          ))}
        </ul>
      </Section>
      <Section name="offer">
        <div className="grid gap-3 rounded-xl border-2 border-primary/40 p-4 sm:p-6">
          <ul className="grid gap-1 text-sm">
            {page.offer.deliverables.map((item) => (
              <li key={item} className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-strong">{page.offer.effortLine}</p>
          <p className="text-sm">
            <span className="font-semibold text-strong">{page.offer.price || "Price given on the call"}</span>
            {page.offer.delivery ? <span className="text-muted-foreground"> · {page.offer.delivery}</span> : null}
          </p>
        </div>
      </Section>
      <Section name="compare">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-xs font-semibold text-muted-foreground">Without</span>
          <span className="text-xs font-semibold text-muted-foreground">With</span>
          {page.compare.flatMap((row) => [
            <span key={`w-${row.without}`} className="text-muted-foreground">
              {row.without}
            </span>,
            <span key={`x-${row.with}`} className="text-strong">
              {row.with}
            </span>,
          ])}
        </div>
      </Section>
      <Section name="process">
        <ol className="grid gap-2 text-sm">
          {page.process.map((row, index) => (
            <li key={row.step} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-heading text-primary">{index + 1}</span>
              <span className="text-strong">{row.step}</span>
              <span className="text-xs text-muted-foreground">Your time: {row.yourTime}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section name="roles">
        <div className="grid grid-cols-[1fr_2fr] gap-4 text-sm">
          <ul className="grid content-start gap-1">
            <li className="text-xs font-semibold text-muted-foreground">Your part</li>
            {page.roles.yours.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <ul className="grid content-start gap-1">
            <li className="text-xs font-semibold text-muted-foreground">Ours</li>
            {page.roles.ours.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      </Section>
      <Section name="faq">
        <dl className="grid gap-3 text-sm">
          {page.faq.map((row) => (
            <div key={row.question} className="grid gap-0.5">
              <dt className="font-medium text-strong">
                {row.question} {row.topic !== "other" ? <span className="text-xs font-normal text-muted-foreground">({FAQ_TOPIC_WORDS[row.topic]})</span> : null}
              </dt>
              <dd className="text-muted-foreground">{row.answer}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section name="finalCta" className="justify-items-center text-center">
        <p className="font-heading text-xl text-strong">{page.finalCta.line}</p>
        <Button text={page.finalCta.cta} />
        {page.finalCta.timing ? <p className="text-xs text-muted-foreground">{page.finalCta.timing}</p> : null}
      </Section>
    </div>
  );
}

/** The landing pages Strategist built, newest first, above the teardowns. Nothing when there are none. */
export function LandingPagesView({ rows }: { rows: LandingPageRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-4">
      {rows.slice(0, 1).map((row) => (
        <Panel as="section" key={row.id} className="grid gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="font-heading text-lg text-strong">{row.title}</h2>
              <p className={cn("flex items-center gap-1.5 text-sm", row.status === "needsReview" ? "text-warning" : "text-muted-foreground")}>
                {row.status === "needsReview" ? <TriangleAlert aria-hidden className="size-4" /> : <Check aria-hidden className="size-4 text-success" />}
                {row.status === "approved" ? "Approved. Built to the landing page framework from your research and offer." : row.status === "needsReview" ? "Needs your review: it breaks a framework rule." : "Waiting for your approval."}
              </p>
            </div>
            <Link href={`/app/assets/${row.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Open with sources <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          {row.failed.length ? (
            <ul className="grid gap-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              {row.failed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {row.layout ? <LandingPagePreview page={row.layout} /> : null}
          {row.leftOut.length ? (
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span className="font-semibold">What this page leaves out</span>
              {row.leftOut.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

export function LandingPages({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { scope } = useClientScope();
  const rows = useQuery(api.landingPageBuild.list, { workspaceId, scope });
  return rows ? <LandingPagesView rows={rows as LandingPageRow[]} /> : null;
}
