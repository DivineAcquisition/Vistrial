"use client";

import { useClientScope } from "@/components/shell/shell-context";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FileSearch, ListChecks, LoaderCircle, Plus, Search, TriangleAlert, X } from "@/components/icons";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { Honest, Teardown } from "./teardown-view";
import { useItemDecisions, type TryActions } from "./try-this";
import type { ItemDecision, PagesQuote, PagesTabData, ReviewActions, TeardownPageView, TeardownView } from "./types";
import { useReviewActions } from "./use-review";
import { SectionTitle, WorkHero } from "./work-shell";
import { useCredits } from "@/lib/credits";
import { ModelSwitch, type ModelSwitchProps } from "@/components/models/model-switch";
import { useModelChoice } from "@/components/models/use-model-choice";

export type TeardownAsk = { industry: string; ownUrl: string; urls: string[]; find: boolean; note: string };

export type PagesTabProps = {
  base: string;
  editor: boolean;
  tab: PagesTabData;
  /** The plan and budget for the form as it stands. Null while it loads or the form is closed. */
  quote: PagesQuote | null;
  onAskChange: (ask: TeardownAsk | null) => void;
  onStart: (ask: TeardownAsk, confirmedCents: number) => Promise<void>;
  /** The model switch for work started here. Left out where no model can be chosen. */
  model?: ModelSwitchProps | null;
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
/** The ask: industry, your page, other pages, and whether to look for more. The plan and budget sit under it. */
function StartForm({ initial, quote, onAskChange, onStart, onClose, model }: { model?: ModelSwitchProps | null; initial: TeardownAsk; quote: PagesQuote | null; onAskChange: (ask: TeardownAsk | null) => void; onStart: PagesTabProps["onStart"]; onClose: () => void }) {
  const credits = useCredits();
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
                  Budget: at most <span className="font-semibold">{credits.words(quote.maxCents)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  The run stops at this cap and you pay only for what it uses. Opening {quote.maxPages === 1 ? "the page" : `the ${quote.maxPages} pages`} is at most {credits.words(quote.readingCents)} of it; the rest is reading them against the framework.
                  {quote.availableCents !== null && !quote.coversMax ? ` Your balance is ${credits.words(quote.availableCents)}, so the run stops early if it runs out.` : ""}
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
                    {busy ? "Starting…" : `Start teardown · up to ${credits.words(quote.maxCents)}`}
                  </Button>
                  {model ? <ModelSwitch {...model} /> : null}
                  {!quote.ready && !quote.industry ? <span className="text-xs text-muted-foreground">Name the industry first.</span> : null}
                  {!quote.ready && quote.industry && quote.maxPages === 0 ? <span className="text-xs text-muted-foreground">Add a page, or tick the box to find some.</span> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">An Owner, Admin or Member can start a teardown.</p>
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

/** The Pages workspace, drawn from data so the screen and its story are the same component. */
export function PagesTabView({ base, editor, tab, quote, onAskChange, onStart, model, view, page, onSelect, onSelectPage, decisions, tryActions, review, briefJson, initialAsk }: PagesTabProps) {
  const credits = useCredits();
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

      {form ? <StartForm initial={initialAsk ?? EMPTY_ASK} quote={quote} onAskChange={onAskChange} onStart={onStart} onClose={close} model={model} /> : null}

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
                  <span className="text-xs text-muted-foreground">{credits.words(run.priceCents)} so far</span>
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
            Give Vistrial your landing page and a few others in your industry, or let it find some. It opens each public page the way a visitor would and matches every section to the job it should do. {editor ? "" : "An Owner, Admin or Member can start one."}
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
  const { scope, clientId } = useClientScope();
  const tab = useQuery(api.landingTeardown.tab, { workspaceId, scope });
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [ask, setAsk] = useState<TeardownAsk | null>(null);
  const start = useMutation(api.landingTeardown.start);
  const modelChoice = useModelChoice(workspaceId, "landing-page-teardown");
  const review = useReviewActions(workspaceId);

  const assetId = (selected ?? tab?.results[0]?.id ?? null) as Id<"assets"> | null;
  const view = useQuery(api.landingTeardown.view, assetId ? { workspaceId, assetId } : "skip");
  const shownPage = pageId && view?.pages.some((row) => row.id === pageId) ? pageId : (view?.pages[0]?.id ?? null);
  const page = useQuery(api.landingTeardown.page, assetId && shownPage ? { workspaceId, assetId, pageId: shownPage } : "skip");
  const brief = useQuery(api.landingTeardown.brief, assetId && view?.hasBrief ? { workspaceId, assetId } : "skip");
  const quote = useQuery(api.landingTeardown.quote, ask ? { workspaceId, industry: ask.industry, ownUrl: ask.ownUrl || undefined, urls: ask.urls, find: ask.find, ...(modelChoice.picked ? { model: modelChoice.picked } : {}) } : "skip");
  const { byIndex, actions } = useItemDecisions(workspaceId, assetId);

  if (!tab) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <PagesTabView
      base={base}
      editor={editor}
      tab={tab}
      quote={quote ?? null}
      onAskChange={setAsk}
      model={editor ? modelChoice.props : null}
      onStart={async (next, confirmedCents) => {
        await start({ workspaceId, industry: next.industry, ownUrl: next.ownUrl || undefined, urls: next.urls, find: next.find, note: next.note || undefined, confirmedCents, clientId, ...(modelChoice.picked ? { model: modelChoice.picked } : {}) });
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
