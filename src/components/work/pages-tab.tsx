"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Check, CircleDashed, Copy, ExternalLink, FileSearch, Info, LayoutList, ListChecks, LoaderCircle, Plus, Search, ShieldCheck, Target, TriangleAlert, X } from "@/components/icons";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { money, shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { ReviewBar } from "./review-bar";
import { TryThis, useItemDecisions, type TryActions } from "./try-this";
import type { ItemDecision, PagesQuote, PagesTabData, ReviewActions, TeardownPageView, TeardownView } from "./types";
import { useReviewActions } from "./use-review";
import { SectionTitle, WorkHero } from "./work-shell";

export type TeardownAsk = { industry: string; ownUrl: string; urls: string[]; find: boolean; note: string };

export type PagesTabProps = {
  base: string;
  editor: boolean;
  tab: PagesTabData;
  /** The plan and budget for the form as it stands. Null while it loads or the form is closed. */
  quote: PagesQuote | null;
  onAskChange: (ask: TeardownAsk | null) => void;
  onStart: (ask: TeardownAsk, confirmedCents: number) => Promise<void>;
  view: TeardownView | null;
  page: TeardownPageView | null;
  onSelect: (assetId: string) => void;
  onSelectPage: (pageId: string) => void;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
  /** The brief as JSON, for the clipboard. Null until it has loaded. */
  briefJson: string | null;
  /** Opens the form straight away (stories). */
  initialAsk?: TeardownAsk;
};

const STOP_WORDS: Record<string, string> = {
  cap: "it reached its cost or time limit.",
  error: "a step could not finish.",
  cancelled: "it was stopped.",
  halted: "it was stopped.",
  done: "it finished without a result.",
};

const EMPTY_ASK: TeardownAsk = { industry: "", ownUrl: "", urls: [], find: true, note: "" };
const DOES: Record<string, { label: string; tone: "good" | "warning" | "critical" }> = {
  yes: { label: "Does its job", tone: "good" },
  partly: { label: "Partly", tone: "warning" },
  no: { label: "Does not do its job", tone: "critical" },
};
const PROOF_WORDS: Record<string, string> = { numbersAndQuotes: "Numbers with quotes", numbers: "Numbers only", quotes: "Quotes only", logos: "Logos only", none: "None" };

function Basis({ label }: { label: string }) {
  return <StatusBadge label={label} tone={label === "Observed" ? "good" : label === "Inference" ? "brand" : "neutral"} className="[&_span]:normal-case" />;
}

/** The line every teardown carries, so nobody reads "shared" as "proven". */
function Honest({ words }: { words: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{words}</span>
    </p>
  );
}

/** The ask: industry, your page, other pages, and whether to look for more. The plan and budget sit under it. */
function StartForm({ initial, quote, onAskChange, onStart, onClose }: { initial: TeardownAsk; quote: PagesQuote | null; onAskChange: (ask: TeardownAsk | null) => void; onStart: PagesTabProps["onStart"]; onClose: () => void }) {
  const [industry, setIndustry] = useState(initial.industry);
  const [ownUrl, setOwnUrl] = useState(initial.ownUrl);
  const [others, setOthers] = useState(initial.urls.join("\n"));
  const [find, setFind] = useState(initial.find);
  const [note, setNote] = useState(initial.note);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const ask: TeardownAsk = { industry, ownUrl, urls: others.split(/\s+/).filter(Boolean), find, note };
  const key = JSON.stringify(ask);
  // The plan follows the form a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => onAskChange(JSON.parse(key) as TeardownAsk), 350);
    return () => clearTimeout(timer);
  }, [key, onAskChange]);

  const start = async () => {
    if (!quote) return;
    setBusy(true);
    setProblem("");
    try {
      await onStart(ask, quote.maxCents);
      onClose();
    } catch (error) {
      setProblem(showError(error, "The teardown did not start."));
    } finally {
      setBusy(false);
    }
  };

  const refused = quote?.pages.filter((row) => !row.ok) ?? [];
  return (
    <Panel className="grid gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base text-card-foreground">Tear down landing pages</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <label className="grid gap-1 text-sm text-card-foreground">
            Industry
            <Input value={industry} maxLength={80} placeholder="Marketing agencies for coaches" onChange={(event) => setIndustry(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-card-foreground">
            Your landing page <span className="text-xs text-muted-foreground">Optional. With it, the teardown says what your page lacks.</span>
            <Input value={ownUrl} inputMode="url" placeholder="https://youragency.com/book" onChange={(event) => setOwnUrl(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-card-foreground">
            Other pages to read <span className="text-xs text-muted-foreground">One link per line. Public pages only.</span>
            <Textarea rows={3} value={others} placeholder={"https://competitor.com/apply\nhttps://another-agency.com/"} onChange={(event) => setOthers(event.target.value)} />
          </label>
          <label className="flex items-start gap-2 text-sm text-card-foreground">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={find} onChange={(event) => setFind(event.target.checked)} />
            <span>
              Find pages competitors in this industry run
              <span className="block text-xs text-muted-foreground">Vistrial searches the web and adds up to four pages it finds.</span>
            </span>
          </label>
          <label className="grid gap-1 text-sm text-card-foreground">
            Anything to look for <span className="text-xs text-muted-foreground">Optional.</span>
            <Textarea rows={2} maxLength={600} value={note} placeholder="We sell a done-for-you funnel build. How do others handle price?" onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="grid content-start gap-3 rounded-xl border border-border p-3 sm:p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
            <ListChecks aria-hidden className="size-4 text-primary" /> The plan, before anything runs
          </p>
          {quote ? (
            <>
              <ol className="grid gap-1.5 text-sm text-card-foreground">
                {quote.steps.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {refused.length > 0 ? (
                <ul className="grid gap-1 text-sm text-destructive">
                  {refused.map((row) => (
                    <li key={row.url} className="flex items-start gap-2">
                      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {row.url}: {row.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {quote.tooMany ? <p className="text-sm text-destructive">Up to {quote.limits.pages} pages in one teardown. Remove some links.</p> : null}
              <div className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-sm text-card-foreground">
                  Budget: at most <span className="font-semibold">{money(quote.maxCents)}</span> of credits
                </p>
                <p className="text-xs text-muted-foreground">
                  The run stops at this cap and you pay only for what it uses. Opening {quote.maxPages === 1 ? "the page" : `the ${quote.maxPages} pages`} is at most {money(quote.readingCents)} of it; the rest is reading them against the framework.
                  {quote.availableCents !== null && !quote.coversMax ? ` Your balance is ${money(quote.availableCents)}, so the run stops early if it runs out.` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Up to {quote.limits.megabytesPerPage} MB a page, at least {quote.limits.secondsBetweenPagesOnOneSite} seconds between pages on one site, {quote.limits.pagesLeftToday} pages left today. Vistrial follows each site&apos;s robots.txt and never logs in.
              </p>
              <Honest words={quote.honest} />
              {quote.canStart ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" disabled={!quote.ready || busy} onClick={() => void start()}>
                    {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Search aria-hidden className="size-4" />}
                    {busy ? "Starting…" : `Start teardown · up to ${money(quote.maxCents)}`}
                  </Button>
                  {!quote.ready && !quote.industry ? <span className="text-xs text-muted-foreground">Name the industry first.</span> : null}
                  {!quote.ready && quote.industry && quote.maxPages === 0 ? <span className="text-xs text-muted-foreground">Add a page, or tick the box to find some.</span> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">An Owner or Manager can start a teardown.</p>
              )}
              {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Working out the plan…</p>
          )}
        </div>
      </div>
    </Panel>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-card-foreground">{children}</dd>
    </div>
  );
}

const quoted = (text: string) => (text ? `"${text}"` : "None on the page");

/** One page, top to bottom: each section, the job the framework gives it, whether it does it, and the page's own words. */
function PageBreakdown({ page }: { page: TeardownPageView }) {
  const [open, setOpen] = useState<number | null>(null);
  const matched = page.pains.length === page.solutions.length;
  return (
    <div className="grid min-w-0 gap-4">
      {page.goal ? <p className="text-sm text-card-foreground">{page.goal}</p> : null}
      <dl className="grid gap-2 sm:grid-cols-2">
        <Fact label="Buttons (counted)">
          {page.facts.ctaCount} {page.facts.ctaCount === 1 ? "button" : "buttons"}
          {page.facts.ctaTexts.length ? `: ${page.facts.ctaTexts.map((text) => `"${text}"`).join(", ")}` : ""}. {page.facts.ctaTargets === 1 ? "All lead to one place." : `They lead to ${page.facts.ctaTargets} places.`}
          {page.facts.weakCtas.length ? ` Weak wording: ${page.facts.weakCtas.join(", ")}.` : ""}
        </Fact>
        <Fact label="Header (counted)">
          {page.facts.navLinks} {page.facts.navLinks === 1 ? "link" : "links"} in the header.{page.facts.stickyNavHint ? " Its markup suggests it stays on screen." : ""}
        </Fact>
        <Fact label="Qualifier">{page.qualifier?.quote ? `${quoted(page.qualifier.quote)}${page.qualifier.threshold ? ` Threshold: ${page.qualifier.threshold}.` : ""}` : "None on the page"}</Fact>
        <Fact label="Headline">{page.headline?.quote ? `${quoted(page.headline.quote)} ${page.headline.statesOutcome ? "States an outcome." : "States the mechanism, not the outcome."}` : "Not found"}</Fact>
        <Fact label="Proof">
          {PROOF_WORDS[page.proof?.kind ?? "none"]}
          {page.proof && page.proof.kind !== "none" ? (page.proof.named ? ", with names." : ", without names.") : "."} {page.proof?.note}
        </Fact>
        <Fact label="Pains and fixes">
          {page.pains.length} {page.pains.length === 1 ? "pain" : "pains"}, {page.solutions.length} {page.solutions.length === 1 ? "fix" : "fixes"}. {page.pains.length === 0 ? "" : matched ? "They match one for one." : "They do not match one for one."}
        </Fact>
        <Fact label="Offer">
          {page.offer && (page.offer.deliverables.length || page.offer.price)
            ? `${page.offer.deliverables.length} deliverable${page.offer.deliverables.length === 1 ? "" : "s"}. ${page.offer.effortLine ? `Effort line: ${quoted(page.offer.effortLine)}` : "No line that removes effort."} ${page.offer.price ? `Price: ${quoted(page.offer.price)}` : "No price."}`
            : "No offer box found"}
        </Fact>
        <Fact label="FAQ topics">
          <span className="flex flex-wrap gap-1.5">
            {page.faq.map((row) => (
              <span key={row.topic} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", row.covered ? "border-success/40 text-card-foreground" : "border-dashed border-border text-muted-foreground")}>
                {row.covered ? <Check aria-hidden className="size-3 text-success" /> : <X aria-hidden className="size-3" />}
                {row.words}
              </span>
            ))}
          </span>
        </Fact>
      </dl>

      <ol className="grid gap-2">
        {page.sections.map((section, index) => {
          const shown = open === index ? section.blocks : section.blocks.slice(0, 3);
          return (
            <li key={`${section.job}-${index}`} className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                <h4 className="font-heading text-sm text-card-foreground">{section.name}</h4>
                {section.job === "other" ? <StatusBadge label="Not in the framework" tone="neutral" className="[&_span]:normal-case" /> : <StatusBadge label={DOES[section.does].label} tone={DOES[section.does].tone} className="[&_span]:normal-case" />}
              </div>
              {section.objection ? (
                <p className="text-xs text-muted-foreground">
                  Answers &ldquo;{section.objection}&rdquo; Its job: {section.frameworkJob}
                </p>
              ) : null}
              {section.note ? (
                <p className="text-sm text-card-foreground">
                  <span className="mr-1.5 align-middle">
                    <Basis label="Inference" />
                  </span>
                  {section.note}
                </p>
              ) : null}
              <ul className="grid gap-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                {shown.map((block, at) => (
                  <li key={at} className={cn("min-w-0 break-words", block.kind === "heading" && "font-medium text-card-foreground", block.kind === "button" && "text-primary")}>
                    {block.kind === "button" ? `[ ${block.text} ]` : block.kind === "item" ? `• ${block.text}` : block.kind === "form" ? `Form: ${block.text}` : block.kind === "image" ? `Image: ${block.text}` : block.text}
                  </li>
                ))}
              </ul>
              {section.blocks.length > 3 ? (
                <button type="button" className="justify-self-start text-xs text-primary underline-offset-2 hover:underline" onClick={() => setOpen(open === index ? null : index)}>
                  {open === index ? "Show less" : `Show all ${section.blocks.length} lines from the page`}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

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
  );
}

function Cited({ ids, view }: { ids: string[]; view: TeardownView }) {
  if (ids.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
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

/** One teardown: the pages one by one beside their screenshot, then what they share, what yours lacks, and what to try. */
function Teardown({ view, page, editor, onSelectPage, decisions, tryActions, review, briefJson }: Pick<PagesTabProps, "editor" | "onSelectPage" | "decisions" | "tryActions" | "review" | "briefJson"> & { view: TeardownView; page: TeardownPageView | null }) {
  const [copied, setCopied] = useState(false);
  const others = view.pages.filter((row) => !row.own && row.analysed).length;
  const reviewable = view.status === "draft" || view.status === "needsReview";
  return (
    <Panel className="grid min-w-0 gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="font-heading text-lg break-words text-card-foreground">{view.title}</h2>
          <p className="text-xs text-muted-foreground">
            {shortDate(view.createdAt)} · {view.pages.length} {view.pages.length === 1 ? "page" : "pages"} read{view.unread.length ? ` · ${view.unread.length} not read` : ""}
          </p>
        </div>
        <AssetStatusBadge status={view.status} />
      </div>
      <Honest words={view.limits[0] ?? ""} />
      {view.summary ? <p className="text-sm text-card-foreground">{view.summary}</p> : null}
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
                className={cn("max-w-full truncate rounded-full border px-3 py-1 text-sm transition-colors", page?.id === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
              >
                {row.own ? "Your page" : row.host}
                {row.origin === "found" ? " (found)" : ""}
              </button>
            ))}
          </div>
          {page ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
                <Screenshot page={page} />
              </div>
              <PageBreakdown page={page} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading the page…</p>
          )}
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
        <section className="grid gap-3" aria-label="What the other pages share">
          <SectionTitle icon={FileSearch}>What the other pages share</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Counted in code across the {others} other {others === 1 ? "page" : "pages"} read. This is how many have each section, not how well any of them performs.
          </p>
          <ul className="grid gap-1.5">
            {view.table.map((row) => (
              <li key={row.job} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm">
                <span className="truncate text-card-foreground">{row.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${row.of ? (row.pages.length / row.of) * 100 : 0}%` }} />
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.pages.length} of {row.of}
                </span>
              </li>
            ))}
          </ul>
          {view.patterns.length > 0 ? (
            <ul className="grid gap-2">
              {view.patterns.map((row, index) => (
                <li key={index} className="grid gap-1.5 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Basis label={row.basisLabel} />
                    {row.section ? <span className="text-xs text-muted-foreground">{row.section}</span> : null}
                  </div>
                  <p className="text-sm text-card-foreground">{row.statement}</p>
                  {row.whyItMayWork ? <p className="text-sm text-muted-foreground">Why it may work: {row.whyItMayWork}</p> : null}
                  <Cited ids={row.pageIds} view={view} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">Not enough data: fewer than two other pages were read, so no shared patterns are reported.</p>
          )}
        </section>
      ) : null}

      {view.gaps.length > 0 ? (
        <section className="grid gap-3" aria-label="What your page lacks">
          <SectionTitle icon={CircleDashed}>What your page lacks</SectionTitle>
          <ul className="grid gap-2">
            {view.gaps.map((row, index) => (
              <li key={index} className="grid gap-1.5 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Basis label={row.basisLabel} />
                  {row.section ? <span className="text-xs text-muted-foreground">{row.section}</span> : null}
                </div>
                <p className="text-sm text-card-foreground">{row.statement}</p>
                <Cited ids={row.pageIds} view={view} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.suggestions.length > 0 ? (
        <section className="grid gap-3" aria-label="Changes to try">
          <SectionTitle icon={Target}>Changes to try</SectionTitle>
          <p className="text-xs text-muted-foreground">
            {view.measured ? "Your own results are connected, so each change you try is measured against today's figures at its check-in." : "Connect your own results (Meta, or a results file) and each change you try is measured at its check-in. Until then you record what happened yourself."}
          </p>
          <ul className="grid gap-2">
            {view.suggestions.map((row) => (
              <li key={row.index} className="grid gap-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Basis label={row.basisLabel} />
                  <h4 className="font-heading text-sm text-card-foreground">{row.title}</h4>
                </div>
                <p className="text-sm text-card-foreground">{row.change}</p>
                <p className="text-sm text-muted-foreground">Why: {row.why}</p>
                <p className="text-sm text-muted-foreground">How to tell: {row.howToTell}</p>
                <Cited ids={row.pageIds} view={view} />
                {view.status === "rejected" || view.status === "archived" ? null : <TryThis index={row.index} decision={decisions.get(row.index)} editor={editor} actions={tryActions} />}
              </li>
            ))}
          </ul>
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

      <section className="grid gap-2" aria-label="Checks and limits">
        <SectionTitle icon={ShieldCheck}>Checks and limits</SectionTitle>
        <ul className="grid gap-1 text-sm">
          {view.checks.results.map((row) => (
            <li key={row.key} className="flex items-start gap-2">
              {row.passed ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <span className={row.passed ? "text-muted-foreground" : "text-card-foreground"}>
                {row.name}
                {row.passed ? "" : `: ${row.detail}`}
              </span>
            </li>
          ))}
        </ul>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
          {view.limits.slice(1).map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
          {view.pages.some((row) => row.droppedQuotes > 0) ? <li>Some quotes the agent gave were not on the page and were removed.</li> : null}
          {view.pages.some((row) => row.partial) ? <li>At least one page was read only in part (too large, or built by scripts a plain request cannot run).</li> : null}
        </ul>
      </section>
    </Panel>
  );
}

/** The Pages workspace, drawn from data so the screen and its story are the same component. */
export function PagesTabView({ base, editor, tab, quote, onAskChange, onStart, view, page, onSelect, onSelectPage, decisions, tryActions, review, briefJson, initialAsk }: PagesTabProps) {
  const [form, setForm] = useState(Boolean(initialAsk));
  const close = () => {
    setForm(false);
    onAskChange(null);
  };
  const empty = tab.results.length === 0 && tab.running.length === 0;
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={FileSearch}
        eyebrow="Landing Page Teardown"
        title="Pages"
        promise="Read landing pages in your industry section by section: which objections each one answers, in what order, what they share, and what yours lacks."
        action={
          editor && !form ? (
            <Button type="button" onClick={() => setForm(true)}>
              <Plus aria-hidden className="size-4" /> Tear down pages
            </Button>
          ) : null
        }
      />

      {form ? <StartForm initial={initialAsk ?? EMPTY_ASK} quote={quote} onAskChange={onAskChange} onStart={onStart} onClose={close} /> : null}

      {tab.running.length > 0 ? (
        <section className="grid gap-2" aria-label="Running now">
          <SectionTitle icon={LoaderCircle}>Running now</SectionTitle>
          <ul className="grid gap-2">
            {tab.running.map((run) => (
              <li key={run.id}>
                <Link href={`/app/runs/${run.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/50">
                  <span className="flex min-w-0 items-center gap-2 text-card-foreground">
                    <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary" />
                    <span className="truncate">
                      {run.industry ? `${run.industry}: ` : ""}
                      {run.words}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{money(run.priceCents)} so far</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab.stopped.length > 0 ? (
        <ul className="grid gap-1.5">
          {tab.stopped.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
              <span>
                A teardown started {shortDate(run.startedAt)} ended with nothing to review: {STOP_WORDS[run.stopReason ?? "error"] ?? STOP_WORDS.error}
              </span>
              <Link href={`/app/runs/${run.id}`} className="text-primary underline-offset-2 hover:underline">
                See the steps
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {empty && !form ? (
        <Panel className="grid gap-2 p-4 text-sm sm:p-6">
          <p className="text-card-foreground">No teardowns yet.</p>
          <p className="text-muted-foreground">
            Give Vistrial your landing page and a few others in your industry, or let it find some. It opens each public page the way a visitor would and matches every section to the job it should do. {editor ? "" : "An Owner or Manager can start one."}
          </p>
        </Panel>
      ) : null}

      {tab.results.length > 0 ? (
        <section className="grid gap-2" aria-label="Teardowns">
          <SectionTitle icon={FileSearch}>Teardowns</SectionTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tab.results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  aria-current={view?.assetId === row.id}
                  className={cn("grid w-full gap-1 rounded-xl border px-3 py-2 text-left transition-colors", view?.assetId === row.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm break-words text-card-foreground">{row.industry}</span>
                    <AssetStatusBadge status={row.status} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(row.createdAt)} · {row.pages} {row.pages === 1 ? "page" : "pages"} read{row.unread ? `, ${row.unread} not read` : ""} · {row.suggestions} {row.suggestions === 1 ? "change" : "changes"} to try
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view ? <Teardown view={view} page={page} editor={editor} onSelectPage={onSelectPage} decisions={decisions} tryActions={tryActions} review={review} briefJson={briefJson} /> : null}
      <p className="text-xs text-muted-foreground">
        Reads public pages only, as VistrialBot. It follows each site&apos;s robots.txt, waits between pages, and never logs in. Runs and their steps are under{" "}
        <Link href={`${base}/activity`} className="underline-offset-2 hover:underline">
          Activity
        </Link>
        .
      </p>
    </div>
  );
}

/** The Pages workspace with live data. */
export function PagesTab({ workspaceId, base, editor, initial }: { workspaceId: Id<"workspaces">; base: string; editor: boolean; initial?: string | null }) {
  const tab = useQuery(api.landingTeardown.tab, { workspaceId });
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [ask, setAsk] = useState<TeardownAsk | null>(null);
  const start = useMutation(api.landingTeardown.start);
  const review = useReviewActions(workspaceId);

  const assetId = (selected ?? tab?.results[0]?.id ?? null) as Id<"assets"> | null;
  const view = useQuery(api.landingTeardown.view, assetId ? { workspaceId, assetId } : "skip");
  const shownPage = pageId && view?.pages.some((row) => row.id === pageId) ? pageId : (view?.pages[0]?.id ?? null);
  const page = useQuery(api.landingTeardown.page, assetId && shownPage ? { workspaceId, assetId, pageId: shownPage } : "skip");
  const brief = useQuery(api.landingTeardown.brief, assetId && view?.hasBrief ? { workspaceId, assetId } : "skip");
  const quote = useQuery(api.landingTeardown.quote, ask ? { workspaceId, industry: ask.industry, ownUrl: ask.ownUrl || undefined, urls: ask.urls, find: ask.find } : "skip");
  const { byIndex, actions } = useItemDecisions(workspaceId, assetId);

  if (!tab) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <PagesTabView
      base={base}
      editor={editor}
      tab={tab}
      quote={quote ?? null}
      onAskChange={setAsk}
      onStart={async (next, confirmedCents) => {
        await start({ workspaceId, industry: next.industry, ownUrl: next.ownUrl || undefined, urls: next.urls, find: next.find, note: next.note || undefined, confirmedCents });
      }}
      view={view ?? null}
      page={page ?? null}
      onSelect={(id) => {
        setSelected(id);
        setPageId(null);
      }}
      onSelectPage={setPageId}
      decisions={byIndex}
      tryActions={actions}
      review={review}
      briefJson={brief ? JSON.stringify(brief, null, 2) : null}
    />
  );
}
