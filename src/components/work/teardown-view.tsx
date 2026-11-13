"use client";

import { useState, type ReactNode } from "react";

import { Check, CircleDashed, Copy, ExternalLink, FileSearch, Info, LayoutList, ShieldCheck, Target, TriangleAlert } from "@/components/icons";
import { CompareGrid, CoverageMap, CoverageSummary, Detail, EvidenceLabel, EvidenceLegend, HighlightLegend, JobChip, MarkedText, NextStep, ResultHeader, StatusChip, TopList, VerdictStrip, type ChipTone } from "@/components/readable";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { weakestEvidence } from "@/lib/readable/evidence";
import { kindsMarked, markText, type Segment } from "@/lib/readable/highlight";
import { comparePages, coverage, pageNeedles, pagePoints, pageVerdict } from "@/lib/readable/teardown";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";

import { ReviewBar } from "./review-bar";
import { TryThis, type TryActions } from "./try-this";
import type { ItemDecision, ReviewActions, TeardownPageView, TeardownView } from "./types";
import { SectionTitle } from "./work-shell";

const PROOF_WORDS: Record<string, string> = { numbersAndQuotes: "Numbers with quotes", numbers: "Numbers only", quotes: "Quotes only", logos: "Logos only", none: "None" };
const DOES = { yes: "does", partly: "partly", no: "doesNot" } as const;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const quoted = (text: string) => (text ? `"${text}"` : "None on the page");
const sectionId = (index: number) => `teardown-section-${index + 1}`;
const sectionHref = (index: number) => `#${sectionId(index)}`;

/** The line every teardown carries, so nobody reads "shared" as "proven". */
export function Honest({ words }: { words: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{words}</span>
    </p>
  );
}

/** The screenshot beside the breakdown, at desktop or phone width. Without a hosted browser there is none, and it says so. */
function Screenshot({ page }: { page: TeardownPageView }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const source = page.screenshots[device] ?? page.screenshots.desktop ?? page.screenshots.phone;
  const has = Boolean(page.screenshots.desktop || page.screenshots.phone);
  return (
    <div className="grid gap-2">
      {has ? (
        <>
          <SegmentedRadioGroup
            aria-label="Screenshot width"
            size="sm"
            value={device}
            onValueChange={(value) => setDevice(value === "phone" ? "phone" : "desktop")}
            options={[
              { value: "desktop", label: "Desktop 1280" },
              { value: "phone", label: "Phone 390" },
            ]}
          />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-muted/30 lg:max-h-[70vh]">
            {/* A stored screenshot of someone else's page: shown as is, never optimised or cached by us. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source ?? ""} alt={`Screenshot of ${page.title} at ${device === "phone" ? "phone" : "desktop"} width`} className={cn("mx-auto block h-auto", device === "phone" ? "w-full max-w-[390px]" : "w-full")} />
          </div>
        </>
      ) : (
        <div className="grid gap-1 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <p className="text-card-foreground">No screenshot</p>
          <p>The hosted browser is not set up, so this page was read from its HTML. The breakdown is of its words and structure, not its layout.</p>
        </div>
      )}
      <a href={page.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{page.url}</span>
      </a>
    </div>
  );
}

/** One quoted or counted fact about the page: a status that says the one thing it checks, then the page's words. */
function Fact({ label, tone, status, children }: { label: string; tone?: ChipTone; status?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-lg border border-border px-3 py-2">
      <dt className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        {tone && status ? <StatusChip tone={tone} label={status} className="tracking-normal normal-case" /> : null}
      </dt>
      <dd className="min-w-0 text-sm break-words text-card-foreground">{children}</dd>
    </div>
  );
}

function blockWords(block: TeardownPageView["sections"][number]["blocks"][number]) {
  return block.kind === "item" ? "• " : block.kind === "form" ? "Form: " : block.kind === "image" ? "Image: " : "";
}

function Line({ block, segments, plain }: { block: TeardownPageView["sections"][number]["blocks"][number]; segments: Segment[]; plain?: boolean }) {
  return (
    <li className={cn("min-w-0 break-words", !plain && block.kind === "heading" && "font-medium text-card-foreground")}>
      {blockWords(block)}
      <MarkedText segments={segments} />
    </li>
  );
}

/**
 * One page. First the answer (a verdict, the coverage map, the weakest and strongest points, the buttons), then
 * each section with its status and the lines that carry a highlight, with the note and every line one step away.
 */
function PageBreakdown({ page, framework }: { page: TeardownPageView; framework: TeardownView["framework"] }) {
  const cells = coverage(framework, page.sections);
  const fallback = pageVerdict(cells);
  const points = pagePoints(page, cells);
  const needles = pageNeedles(page);
  const lines = page.sections.map((section) => section.blocks.map((block) => ({ block, segments: block.kind === "button" ? [{ text: block.text, kind: "cta" as const }] : markText(block.text, needles) })));
  const kinds = kindsMarked(lines.flat().map((row) => row.segments));
  const { facts } = page;
  const matched = page.pains.length === page.solutions.length;
  const covered = page.faq.filter((row) => row.covered).length;
  const hasOffer = Boolean(page.offer && (page.offer.deliverables.length || page.offer.price));

  return (
    <div className="grid min-w-0 gap-4">
      <VerdictStrip eyebrow={page.own ? "Your page" : "This page"} text={page.verdict || fallback.text} label={fallback.label} className="border-border bg-muted/40">
        {page.goal ? <p className="text-sm text-muted-foreground">What it wants a visitor to do: {page.goal}</p> : null}
        {page.verdict ? <p className="text-xs text-muted-foreground">{fallback.text}</p> : null}
      </VerdictStrip>

      <div className="grid gap-2">
        <h4 className="font-heading text-sm text-card-foreground">The framework&apos;s eleven jobs on this page</h4>
        <CoverageMap cells={cells} sectionHref={sectionHref} />
        <CoverageSummary cells={cells} />
      </div>

      <TopList weakest={points.weakest} strongest={points.strongest} sectionHref={sectionHref} footnote="Listed in a fixed order: missing first, then partly done, then what code counted. Vistrial cannot see which matters most to this page's results." />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Screenshot page={page} />
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div className="grid gap-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-card-foreground">
              <h4 className="font-heading text-sm">Buttons</h4>
              <EvidenceLabel label="Observed" />
              <span className="tabular-nums">
                {plural(facts.ctaCount, "button")}, {facts.ctaTargets === 1 ? "one destination" : `${facts.ctaTargets} destinations`}
              </span>
              {facts.ctaCount === 0 ? <StatusChip tone="bad" label="No button" /> : facts.ctaTargets > 1 ? <StatusChip tone="partly" label="More than one place to go" /> : <StatusChip tone="good" label="One place to go" />}
              {facts.weakCtas.length ? <StatusChip tone="partly" label="Weak wording" /> : null}
            </div>
            {facts.ctaTexts.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Button wording on the page">
                {facts.ctaTexts.map((text) => (
                  <li key={text} className={cn("rounded-md border px-2 py-0.5 text-xs", facts.weakCtas.includes(text) ? "border-dashed border-warning/60 text-warning-foreground" : "border-primary/40 text-primary")}>
                    {text}
                    {facts.weakCtas.includes(text) ? <span className="sr-only"> (weak wording)</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <Detail summary="The other things counted and quoted on this page" aside="7 facts">
              <dl className="grid gap-2 sm:grid-cols-2">
                <Fact label="Header (counted)" tone={facts.navLinks === 0 ? "good" : "quiet"} status={plural(facts.navLinks, "link")}>
                  {plural(facts.navLinks, "link")} in the header.{facts.stickyNavHint ? " Its markup suggests it stays on screen." : ""}
                </Fact>
                <Fact label="Qualifier" tone={page.qualifier?.quote ? "good" : "absent"} status={page.qualifier?.quote ? "Found" : "None"}>
                  {page.qualifier?.quote ? `${quoted(page.qualifier.quote)}${page.qualifier.threshold ? ` Threshold: ${page.qualifier.threshold}.` : ""}` : "None on the page"}
                </Fact>
                <Fact label="Headline" tone={!page.headline?.quote ? "absent" : page.headline.statesOutcome ? "good" : "partly"} status={!page.headline?.quote ? "Not found" : page.headline.statesOutcome ? "States an outcome" : "States the mechanism"}>
                  {page.headline?.quote ? quoted(page.headline.quote) : "Not found"}
                </Fact>
                <Fact label="Proof" tone={!page.proof || page.proof.kind === "none" ? "absent" : page.proof.named ? "good" : "partly"} status={!page.proof || page.proof.kind === "none" ? "None" : page.proof.named ? "With names" : "Without names"}>
                  {PROOF_WORDS[page.proof?.kind ?? "none"]}. {page.proof?.note}
                </Fact>
                <Fact label="Pains and fixes" tone={page.pains.length === 0 ? "absent" : matched ? "good" : "partly"} status={page.pains.length === 0 ? "None" : matched ? "One for one" : "Do not pair up"}>
                  {plural(page.pains.length, "pain")}, {plural(page.solutions.length, "fix", "fixes")}.
                </Fact>
                <Fact label="Offer" tone={!hasOffer ? "absent" : page.offer?.price ? "good" : "partly"} status={!hasOffer ? "No offer box" : page.offer?.price ? "Price stated" : "No price"}>
                  {hasOffer && page.offer ? `${plural(page.offer.deliverables.length, "deliverable")}. ${page.offer.effortLine ? `Effort line: ${quoted(page.offer.effortLine)}` : "No line that removes effort."} ${page.offer.price ? `Price: ${quoted(page.offer.price)}` : "No price."}` : "No offer box found"}
                </Fact>
                <Fact label="FAQ topics" tone={covered === page.faq.length ? "good" : covered === 0 ? "absent" : "partly"} status={`${covered} of ${page.faq.length} covered`}>
                  <span className="flex flex-wrap gap-1.5">
                    {page.faq.map((row) => (
                      <StatusChip key={row.topic} tone={row.covered ? "good" : "absent"} label={row.words} />
                    ))}
                  </span>
                </Fact>
              </dl>
              <p className="text-xs text-muted-foreground">Buttons and header links were counted in code. The rest is the agent&apos;s reading, with every quote checked against the page.</p>
            </Detail>
          </div>

          <div className="grid gap-2">
            <h4 className="font-heading text-sm text-card-foreground">Section by section, top to bottom</h4>
            <HighlightLegend kinds={kinds} />
            <ol className="grid gap-2">
              {page.sections.map((section, index) => {
                const marked = lines[index].filter((row) => row.segments.some((segment) => segment.kind));
                return (
                  <li key={`${section.job}-${index}`} id={sectionId(index)} className="grid scroll-mt-24 gap-1.5 rounded-xl border border-border p-3 target:border-primary">
                    <div className="flex flex-wrap items-center gap-2">
                      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <h5 className="font-heading text-sm text-card-foreground">{section.name}</h5>
                      {section.job === "other" ? <StatusChip tone="quiet" label="Not in the framework" /> : <JobChip status={DOES[section.does]} />}
                    </div>
                    {section.headline ? (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-card-foreground">
                        {section.headline}
                        <EvidenceLabel label="Inference" />
                      </p>
                    ) : section.objection ? (
                      <p className="text-sm text-muted-foreground">Answers &ldquo;{section.objection}&rdquo;</p>
                    ) : null}
                    {marked.length > 0 ? (
                      <ul className="grid gap-1 text-sm text-card-foreground">
                        {marked.slice(0, 3).map((row, at) => (
                          <Line key={at} block={row.block} segments={row.segments} plain />
                        ))}
                        {marked.length > 3 ? <li className="text-xs text-muted-foreground">and {marked.length - 3} more highlighted {marked.length - 3 === 1 ? "line" : "lines"} below</li> : null}
                      </ul>
                    ) : null}
                    <Detail summary="Why, and every line from the page" aside={plural(section.blocks.length, "line")}>
                      {section.note ? (
                        <p className="text-sm text-card-foreground">
                          <EvidenceLabel label="Inference" className="mr-1.5 align-middle" />
                          {section.note}
                        </p>
                      ) : null}
                      {section.objection ? (
                        <p className="text-xs text-muted-foreground">
                          Answers &ldquo;{section.objection}&rdquo; Its job: {section.frameworkJob}
                        </p>
                      ) : null}
                      <ul className="grid gap-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {lines[index].map((row, at) => (
                          <Line key={at} block={row.block} segments={row.segments} />
                        ))}
                      </ul>
                    </Detail>
                  </li>
                );
              })}
            </ol>
          </div>

          {page.skipped.length > 0 ? (
            <div className="grid gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                <CircleDashed aria-hidden className="size-4 text-muted-foreground" /> Objections this page skips
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {page.skipped.map((row) => (
                  <li key={row.key} className="grid gap-0.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm">
                    <span className="text-card-foreground">{row.name}</span>
                    <span className="text-xs text-muted-foreground">&ldquo;{row.objection}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Cited({ ids, view }: { ids: string[]; view: TeardownView }) {
  if (ids.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="sr-only">Pages cited: </span>
      {ids.map((id) => {
        const page = view.pages.find((row) => row.id === id);
        return (
          <span key={id} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground" title={page?.url}>
            {page ? (page.own ? "Your page" : page.host) : id}
          </span>
        );
      })}
    </span>
  );
}

export type TeardownProps = {
  view: TeardownView;
  page: TeardownPageView | null;
  editor: boolean;
  onSelectPage: (pageId: string) => void;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
  briefJson: string | null;
};

/**
 * One teardown, in three layers. The answer: the summary with its evidence label and four counts. The
 * indicators: a coverage map and status per section for each page, and a table of which page has which
 * section. The full text: every note, quote, source and check, one step away. Nothing the earlier layout
 * showed has been removed.
 */
export function Teardown({ view, page, editor, onSelectPage, decisions, tryActions, review, briefJson }: TeardownProps) {
  const [copied, setCopied] = useState(false);
  const compare = comparePages(view.framework, view.pages);
  const others = view.pages.filter((row) => !row.own && row.analysed).length;
  const reviewable = view.status === "draft" || view.status === "needsReview";
  const closed = view.status === "rejected" || view.status === "archived";
  const label = weakestEvidence([...view.patterns, ...view.gaps].map((row) => row.basisLabel));
  const failed = view.checks.results.filter((row) => !row.passed).length;
  const next = closed ? null : (view.suggestions.find((row) => !decisions.has(row.index)) ?? null);
  const trying = view.suggestions.filter((row) => decisions.has(row.index)).length;
  const dropped = view.pages.reduce((sum, row) => sum + row.droppedQuotes, 0);

  return (
    <Panel className="grid min-w-0 gap-5 p-4 sm:p-6">
      <ResultHeader
        title={view.title}
        meta={
          <span>
            {shortDate(view.createdAt)} · {plural(view.pages.length, "page")} read{view.unread.length ? ` · ${view.unread.length} not read` : ""}
          </span>
        }
        status={<AssetStatusBadge status={view.status} />}
      />

      <VerdictStrip
        text={view.summary || (view.pages.length ? "The pages were read, but no findings across them were written. Each page's own breakdown is below." : "Not enough data: no page could be read.")}
        label={view.summary ? (label ?? "Inference") : "Not enough data"}
        counts={[
          { value: String(view.pages.length), words: view.pages.length === 1 ? "page read" : "pages read" },
          ...(compare.hasOwn && others > 0 ? [{ value: String(compare.lacking), words: compare.lacking === 1 ? "section yours lacks that others have" : "sections yours lack that others have" }] : []),
          { value: String(view.patterns.length), words: view.patterns.length === 1 ? "shared pattern" : "shared patterns" },
          { value: String(view.suggestions.length), words: view.suggestions.length === 1 ? "change to try" : "changes to try" },
        ]}
      >
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>{view.limits[0] ?? ""}</span>
        </p>
        {failed > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-card-foreground">
            <StatusChip tone="bad" label={`${plural(failed, "check")} failed`} />
            <a href="#teardown-checks" className="text-primary underline-offset-2 hover:underline">
              See which
            </a>
          </p>
        ) : null}
      </VerdictStrip>

      {editor && reviewable ? <ReviewBar assetId={view.assetId} actions={review} needsReview={view.status === "needsReview"} /> : null}

      {view.pages.length > 0 ? (
        <section className="grid min-w-0 gap-3" aria-label="Pages">
          <SectionTitle icon={LayoutList}>Page by page</SectionTitle>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pages read">
            {view.pages.map((row) => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={page?.id === row.id}
                onClick={() => onSelectPage(row.id)}
                className={cn("flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors", page?.id === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
              >
                <span className="truncate">
                  {row.own ? "Your page" : row.host}
                  {row.origin === "found" ? " (found)" : ""}
                </span>
                {row.analysed ? <span className="shrink-0 text-xs tabular-nums opacity-80">{row.skipped.length === 0 ? "skips none" : `skips ${row.skipped.length}`}</span> : null}
              </button>
            ))}
          </div>
          {page ? <PageBreakdown page={page} framework={view.framework} /> : <p className="text-sm text-muted-foreground">Loading the page…</p>}
        </section>
      ) : null}

      {view.unread.length > 0 ? (
        <section className="grid gap-2" aria-label="Pages not read">
          <SectionTitle icon={TriangleAlert}>Not read</SectionTitle>
          <ul className="grid gap-1.5 text-sm">
            {view.unread.map((row) => (
              <li key={row.url} className="grid gap-0.5 rounded-xl border border-dashed border-border px-3 py-2">
                <span className="min-w-0 break-words text-card-foreground">{row.url}</span>
                <span className="text-muted-foreground">{row.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others >= 1 ? (
        <section id="teardown-compare" className="grid scroll-mt-24 gap-3" aria-label="Across the pages">
          <SectionTitle icon={FileSearch}>Across the pages</SectionTitle>
          <p className="text-sm text-card-foreground">
            {compare.hasOwn
              ? compare.lacking === 0
                ? "Your page has a section for every job that another page has one for."
                : `Your page lacks ${plural(compare.lacking, "section")} that at least one other page has.`
              : "Your own page was not read, so this compares the other pages only."}{" "}
            <span className="text-muted-foreground">
              Counted in code across the {plural(others, "other page")} read. This is how many have each section, not how well any of them performs.
            </span>
          </p>
          <CompareGrid columns={compare.columns} rows={compare.rows} />

          {view.gaps.length > 0 ? (
            <Detail summary="What your page lacks, in words" aside={plural(view.gaps.length, "gap")}>
              <ul className="grid gap-2">
                {view.gaps.map((row, index) => (
                  <li key={index} className="grid gap-1.5 rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <EvidenceLabel label={row.basisLabel} />
                      {row.section ? <span className="text-xs text-muted-foreground">{row.section}</span> : null}
                    </div>
                    <p className="text-sm text-card-foreground">{row.statement}</p>
                    <Cited ids={row.pageIds} view={view} />
                  </li>
                ))}
              </ul>
            </Detail>
          ) : null}

          <h4 className="font-heading text-sm text-card-foreground">What the other pages share</h4>
          {view.patterns.length > 0 ? (
            <ul className="grid gap-2">
              {view.patterns.map((row, index) => (
                <li key={index} className="grid gap-1.5 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceLabel label={row.basisLabel} />
                    {row.section ? <span className="text-xs font-medium text-card-foreground">{row.section}</span> : null}
                    <Cited ids={row.pageIds} view={view} />
                  </div>
                  <p className="text-sm text-card-foreground">{row.statement}</p>
                  {row.whyItMayWork ? (
                    <Detail summary="Why it may work">
                      <p className="text-sm text-muted-foreground">
                        <EvidenceLabel label="Inference" className="mr-1.5 align-middle" />
                        {row.whyItMayWork}
                      </p>
                    </Detail>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">Not enough data: fewer than two other pages were read, so no shared patterns are reported.</p>
          )}
        </section>
      ) : view.gaps.length > 0 ? (
        <section className="grid gap-3" aria-label="What your page lacks">
          <SectionTitle icon={CircleDashed}>What your page lacks</SectionTitle>
          <ul className="grid gap-2">
            {view.gaps.map((row, index) => (
              <li key={index} className="grid gap-1.5 rounded-xl border border-border p-3">
                <EvidenceLabel label={row.basisLabel} />
                <p className="text-sm text-card-foreground">{row.statement}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.suggestions.length > 0 ? (
        <section id="teardown-changes" className="grid scroll-mt-24 gap-3" aria-label="Changes to try">
          <SectionTitle icon={Target} aside={trying > 0 ? <StatusChip tone="good" label={`Trying ${trying} of ${view.suggestions.length}`} /> : undefined}>
            Changes to try
          </SectionTitle>
          <p className="text-xs text-muted-foreground">
            {view.measured ? "Your own results are connected, so each change you try is measured against today's figures at its check-in." : "Connect your own results (Meta, or a results file) and each change you try is measured at its check-in. Until then you record what happened yourself."}
          </p>
          <ol className="grid gap-2">
            {view.suggestions.map((row) => (
              <li key={row.index} id={`teardown-change-${row.index + 1}`} className="grid scroll-mt-24 gap-2 rounded-xl border border-border p-3 target:border-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {row.index + 1}
                  </span>
                  <h4 className="font-heading text-sm text-card-foreground">{row.title}</h4>
                  <EvidenceLabel label={row.basisLabel} />
                </div>
                <p className="text-sm text-card-foreground">{row.change}</p>
                <Detail summary="Why, and how to tell if it helped">
                  <p className="text-sm text-muted-foreground">Why: {row.why}</p>
                  <p className="text-sm text-muted-foreground">How to tell: {row.howToTell}</p>
                </Detail>
                <Cited ids={row.pageIds} view={view} />
                {closed ? null : <TryThis index={row.index} decision={decisions.get(row.index)} editor={editor} actions={tryActions} />}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {view.hasBrief ? (
        <section className="grid gap-2 rounded-xl border border-border p-3" aria-label="Brief">
          <SectionTitle
            icon={Copy}
            aside={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!briefJson}
                onClick={() => {
                  if (!briefJson) return;
                  void navigator.clipboard?.writeText(briefJson).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copied" : "Copy brief"}
              </Button>
            }
          >
            Brief for the next page
          </SectionTitle>
          <p className="text-sm text-muted-foreground">
            The audience, the promise, the button wording and a direction for each section, as data. Hand it to whoever builds the page. {view.status === "approved" ? "" : "Approve the teardown first if you want it marked as signed off."}
          </p>
        </section>
      ) : null}

      <section id="teardown-checks" className="grid scroll-mt-24 gap-2" aria-label="Checks and limits">
        <SectionTitle icon={ShieldCheck} aside={<StatusChip tone={failed === 0 ? "good" : "bad"} label={`${view.checks.results.length - failed} of ${view.checks.results.length} checks passed`} />}>
          Checks and limits
        </SectionTitle>
        <Detail summary="Each check, the limits, and what the labels mean" defaultOpen={failed > 0}>
          <ul className="grid gap-1 text-sm">
            {view.checks.results.map((row) => (
              <li key={row.key} className="flex items-start gap-2">
                {row.passed ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />}
                <span className={row.passed ? "text-muted-foreground" : "text-card-foreground"}>
                  <span className="sr-only">{row.passed ? "Passed: " : "Failed: "}</span>
                  {row.name}
                  {row.passed ? "" : `: ${row.detail}`}
                </span>
              </li>
            ))}
          </ul>
          <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
            {view.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
            {dropped > 0 ? <li>{plural(dropped, "quote")} the agent gave {dropped === 1 ? "was" : "were"} not on the page and {dropped === 1 ? "was" : "were"} removed.</li> : null}
            {view.pages.some((row) => row.droppedLines > 0) ? <li>A summary line the agent wrote claimed a result and was removed; a plain sentence of counts is shown in its place.</li> : null}
            {view.pages.some((row) => row.partial) ? <li>At least one page was read only in part (too large, or built by scripts a plain request cannot run).</li> : null}
          </ul>
          <EvidenceLegend only={[...view.patterns, ...view.gaps, ...view.suggestions].map((row) => row.basisLabel).concat(["Observed", "Inference"])} />
        </Detail>
      </section>

      {next ? (
        <NextStep
          title={next.title}
          label={next.basisLabel}
          note={`Change ${next.index + 1} of ${view.suggestions.length}${trying ? `, ${trying} already being tried` : ""}. Nothing changes on your page until you change it.`}
          href={`#teardown-change-${next.index + 1}`}
        />
      ) : null}
    </Panel>
  );
}
