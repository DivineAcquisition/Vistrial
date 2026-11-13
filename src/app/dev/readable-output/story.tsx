"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { CompareGrid, CoverageMap, CoverageSummary, Detail, Digest, EvidenceLabel, EvidenceLegend, HighlightLegend, JobChip, MarkedText, NextStep, ResultHeader, StatusChip, TopList, VerdictStrip, type CoverageLook, type MarkStyle } from "@/components/readable";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import type { TeardownPageView, TeardownView } from "@/components/work/types";
import { weakestEvidence } from "@/lib/readable/evidence";
import { kindsMarked, markText } from "@/lib/readable/highlight";
import { comparePages, coverage, pageNeedles, pagePoints, pageVerdict } from "@/lib/readable/teardown";

import fixture from "../pages-tab/fixture.json";
import { StoryTheme } from "../story-theme";

/** The same made-up teardown the Pages tab story draws (convex/landingTeardown.test.ts writes it). No real business, no real result. */
const data = fixture as unknown as { view: TeardownView; pages: TeardownPageView[] };

function Block({ name, from, children }: { name: string; from: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h2 className="font-heading text-base text-foreground">{name}</h2>
        <p className="text-xs text-muted-foreground">Computed from: {from}</p>
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({ label, value, onChange, options, recommended }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; recommended: T }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <SegmentedRadioGroup aria-label={label} size="sm" value={value} onValueChange={(next) => onChange(next as T)} options={options.map((option) => ({ ...option, label: option.value === recommended ? `${option.label} (recommended)` : option.label }))} />
    </div>
  );
}

/** The shared blocks for AI results, drawn over one teardown: the answer, the indicators, then the full text. */
export function ReadableOutputStory({ theme, coverage: coverageLook, marks, next, pageId }: { theme: string; coverage: string; marks: string; next: string; pageId: string }) {
  const [look, setLook] = useState<CoverageLook>(coverageLook === "list" || coverageLook === "track" ? coverageLook : "grid");
  const [mark, setMark] = useState<MarkStyle>(marks === "tag" ? "tag" : "underline");
  const [nextLook, setNextLook] = useState<"sticky" | "inline">(next === "inline" ? "inline" : "sticky");
  const [selected, setSelected] = useState(pageId);

  const view = data.view;
  const page = data.pages.find((row) => row.id === selected) ?? data.pages[0];
  const cells = coverage(view.framework, page.sections);
  const verdict = pageVerdict(cells);
  const points = pagePoints(page, cells);
  const needles = pageNeedles(page);
  const lines = page.sections.map((section) => section.blocks.map((block) => ({ block, segments: block.kind === "button" ? [{ text: block.text, kind: "cta" as const }] : markText(block.text, needles) })));
  const kinds = kindsMarked(lines.flat().map((row) => row.segments));
  const compare = comparePages(view.framework, view.pages);
  const first = view.suggestions[0];
  const overall = weakestEvidence([...view.patterns, ...view.gaps].map((row) => row.basisLabel));
  const href = (index: number) => `#section-${index + 1}`;

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-8">
      <StoryTheme theme={theme} />
      <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-8">
        <header className="grid gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">Readable output</p>
          <h1 className="font-heading text-2xl text-foreground">The answer, then the indicators, then the full text</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The shared blocks for everything an AI feature produces, drawn here over one landing page teardown. Every indicator is computed from a field the result already has; the line under each block names the field. The same teardown as it is drawn today is the{" "}
            <Link href={`/dev/pages-tab?state=full&theme=${theme}`} className="text-primary underline-offset-2 hover:underline">
              Pages tab story
            </Link>
            .
          </p>
          <div className="grid gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-foreground">Choices that are a matter of taste</p>
            <Choice label="Coverage map" value={look} onChange={setLook} recommended="grid" options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }, { value: "track", label: "Track" }]} />
            <Choice label="Highlights" value={mark} onChange={setMark} recommended="underline" options={[{ value: "underline", label: "Underline" }, { value: "tag", label: "Tag" }]} />
            <Choice label="What to do next" value={nextLook} onChange={setNextLook} recommended="sticky" options={[{ value: "sticky", label: "Stays in reach" }, { value: "inline", label: "In place" }]} />
          </div>
        </header>

        <Panel className="grid min-w-0 gap-5 p-4 sm:p-6">
          <ResultHeader title={view.title} meta={<span>Nov 10, 2026 · {view.pages.length} pages read · {view.unread.length} not read</span>} status={<AssetStatusBadge status={view.status} />} />

          <Block name="1. Verdict strip" from="the teardown's own summary (already checked for claims of a result), the weakest evidence label among its patterns and gaps, and counts of saved rows.">
            <VerdictStrip
              text={view.summary}
              label={overall}
              counts={[
                { value: String(view.pages.length), words: "pages read" },
                { value: String(compare.lacking), words: "sections yours lacks that others have" },
                { value: String(view.patterns.length), words: "shared patterns" },
                { value: String(view.suggestions.length), words: "changes to try" },
              ]}
            >
              <p className="text-xs text-muted-foreground">{view.limits[0]}</p>
            </VerdictStrip>
          </Block>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pages read">
            {view.pages.map((row) => (
              <button key={row.id} type="button" role="tab" aria-selected={page.id === row.id} onClick={() => setSelected(row.id)} className={`max-w-full truncate rounded-full border px-3 py-1 text-sm ${page.id === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground"}`}>
                {row.own ? "Your page" : row.host}
              </button>
            ))}
          </div>

          <Block name="2. Coverage map" from="each section's matched framework job and whether it was read as doing it; the page order of sections; the framework's own order and which jobs it expects.">
            <VerdictStrip eyebrow="This page" text={verdict.text} label={verdict.label} className="border-border bg-muted/40" />
            <CoverageMap cells={cells} look={look} sectionHref={href} />
            <CoverageSummary cells={cells} numbered={look !== "track"} />
          </Block>

          <Block name="3. Top three" from="sections read as not or partly doing their job, jobs with no section, and what code counted (buttons, where they lead, proof, pains and fixes). A fixed order, not a ranking.">
            <TopList strongest={points.strongest} weakest={points.weakest} sectionHref={href} footnote="The order is a fixed rule (missing first, then partly done, then what code counted). Vistrial cannot see which matters most to this page's results." />
          </Block>

          <Block name="4. Calls to action at a glance" from="buttons code counted on the page, their distinct wordings, and how many places they lead.">
            <div className="flex flex-wrap items-center gap-2 text-sm text-card-foreground">
              <EvidenceLabel label="Observed" />
              <span className="font-medium tabular-nums">
                {page.facts.ctaCount} buttons, {page.facts.ctaTargets === 1 ? "one destination" : `${page.facts.ctaTargets} destinations`}
              </span>
              {page.facts.ctaTexts.map((text) => (
                <span key={text} className="rounded-md border border-primary/40 px-2 py-0.5 text-xs text-primary">
                  {text}
                </span>
              ))}
              {page.facts.ctaTargets > 1 ? <StatusChip tone="partly" label="More than one place to go" /> : <StatusChip tone="good" label="One place to go" />}
            </div>
          </Block>

          <Block name="5. Section by section, with highlights and the notes collapsed" from="each section's status; the page's own lines; quotes the teardown saved (pains, fixes, proof, qualifier, price), marked only where they are found in a line.">
            <HighlightLegend kinds={kinds} look={mark} />
            <ol className="grid gap-2">
              {page.sections.map((section, index) => {
                const marked = lines[index].filter((row) => row.segments.some((segment) => segment.kind));
                return (
                  <li key={index} id={`section-${index + 1}`} className="grid scroll-mt-4 gap-2 rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                      <h3 className="font-heading text-sm text-card-foreground">{section.name}</h3>
                      {section.job === "other" ? <StatusChip tone="quiet" label="Not in the framework" /> : <JobChip status={section.does === "yes" ? "does" : section.does === "partly" ? "partly" : "doesNot"} />}
                      {section.objection ? <span className="text-xs text-muted-foreground">Answers &ldquo;{section.objection}&rdquo;</span> : null}
                    </div>
                    {marked.length > 0 ? (
                      <ul className="grid gap-1 text-sm text-card-foreground">
                        {marked.slice(0, 3).map((row, at) => (
                          <li key={at} className="min-w-0 break-words">
                            <MarkedText segments={row.segments} look={mark} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Detail summary="Why, and every line from the page" aside={`${section.blocks.length} lines`}>
                      {section.note ? (
                        <p className="text-sm text-card-foreground">
                          <EvidenceLabel label="Inference" className="mr-1.5 align-middle" />
                          {section.note}
                        </p>
                      ) : null}
                      {section.frameworkJob ? <p className="text-xs text-muted-foreground">Its job: {section.frameworkJob}</p> : null}
                      <ul className="grid gap-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {lines[index].map((row, at) => (
                          <li key={at} className={row.block.kind === "heading" ? "font-medium text-card-foreground" : undefined}>
                            <MarkedText segments={row.segments} look={mark} />
                          </li>
                        ))}
                      </ul>
                    </Detail>
                  </li>
                );
              })}
            </ol>
          </Block>

          <Block name="6. Comparison across pages" from="for each page, which framework jobs have a section (counted in code when the teardown was saved). It matches the table the Pages tab draws as bars today.">
            <p className="text-sm text-card-foreground">
              {compare.hasOwn ? `Your page lacks ${compare.lacking} ${compare.lacking === 1 ? "section" : "sections"} that at least one other page has.` : "Your own page was not read, so this compares the other pages only."}{" "}
              <span className="text-muted-foreground">This is how many pages have each section, not how well any of them performs.</span>
            </p>
            <CompareGrid columns={compare.columns} rows={compare.rows} />
          </Block>

          <Block name="7. Evidence labels and status chips" from="the label saved with each claim; a summary line carries the weakest label of what it summarises.">
            <EvidenceLegend />
            <div className="flex flex-wrap gap-2">
              <JobChip status="does" />
              <JobChip status="partly" />
              <JobChip status="doesNot" />
              <JobChip status="skipped" />
              <JobChip status="leftOut" />
            </div>
          </Block>

          <Block name="8. The same discipline at small size" from="a briefing post's or a task's own fields: what changed, what it means, what to do. A row with nothing to say is left out.">
            <div className="rounded-xl border border-border p-3">
              <Digest
                changed={{ text: "Aster Coaching: 31 booked calls in October, up from 24 in September.", label: "Your data" }}
                means={{ text: "More calls, fewer of them became clients.", label: "Inference" }}
                todo={{ text: "Review the proposed two-call close in Tasks." }}
              />
            </div>
          </Block>

          {first ? (
            <Block name="9. What to do next" from="the first change to try the teardown saved, with its own evidence label. It repeats a step the result contains; it adds none.">
              <NextStep look={nextLook} title={first.title} label={first.basisLabel} note={`${view.suggestions.length} changes to try. How to tell: ${first.howToTell}`} href="#changes" />
            </Block>
          ) : null}
        </Panel>
      </div>
    </main>
  );
}
