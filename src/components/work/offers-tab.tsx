"use client";

import { useClientScope } from "@/components/shell/shell-context";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Copy, Download, FileImage, LayoutList, LoaderCircle, PenLine, Plus, ScaleIcon, Store, Target } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { EMPTY_OFFER, cleanOffer, compareOffers, type OfferContent, type OfferInput } from "../../../convex/lib/offerCards";

import { ViewSwitch, useWorkView, type WorkView } from "./board-canvas";
import { NextStep, VerdictStrip } from "@/components/readable";
import { offerGlance } from "@/lib/readable/analysis";

import { CompetitorSideBySide, GapsList, TestPlan } from "./offer-analysis";
import { OfferBuilder } from "./offer-builder";
import { OfferCardView, OfferCompareView, exportOfferImage, exportOfferPdf } from "./offer-card";
import type { TryActions } from "./try-this";
import { useItemDecisions } from "./try-this";
import type { ItemDecision, OfferAnalysisView, OfferCardFull, OfferCardRow, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { OffersCanvas } from "./work-canvases";
import { RefineInChat, ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, WorkLayout, refineLink, suggestionHref } from "./work-shell";
import { ModelSwitch, type ModelSwitchProps } from "@/components/models/model-switch";
import { useModelChoice } from "@/components/models/use-model-choice";
import { agentWork } from "../../../convex/lib/workWords";

export type OffersTabProps = {
  base: string;
  editor: boolean;
  tab: TabData;
  cards: OfferCardRow[];
  card: OfferCardFull | null;
  /** A draft from the business profile for "Start from", or null when there is no profile. */
  starter: OfferContent | null;
  onSelectCard: (cardId: string) => void;
  onSaveCard: (cardId: string | null, offer: OfferInput, note: string, copyOf: string | null) => Promise<void>;
  /** "Analyse this offer": runs Offer Intelligence on the card's saved version. */
  onAnalyse: (cardId: string) => Promise<void>;
  /** The model switch for work started here. Left out where no model can be chosen. */
  model?: ModelSwitchProps | null;
  analysis: OfferAnalysisView | null;
  analysisId: string | null;
  onSelectAnalysis: (assetId: string) => void;
  onCardFromAnalysis: (assetId: string, cardId: string | null) => Promise<void>;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
  /** Opens the builder straight away (stories and deep links). */
  initialBuilder?: { mode: "new" | "edit"; step?: number } | null;
  /** Opens on Cards or Canvas (stories). Otherwise the view a person last chose. */
  initialView?: WorkView;
};

/** A version row as card content alone. */
function contentOf(row: OfferContent): OfferContent {
  return cleanOffer({ ...EMPTY_OFFER, ...row });
}

/** The offer workspace: the builder, the card, its versions and a comparison of any two, and the analysis under it. */
function CardsPanel(props: OffersTabProps & { onBuilderClosed?: () => void }) {
  const { base, editor, tab, cards, card, starter, onSelectCard, onSaveCard, onAnalyse, model, initialBuilder } = props;
  const [building, setBuilding] = useState<"new" | "edit" | null>(initialBuilder?.mode ?? null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [compare, setCompare] = useState<[number, number] | null>(null);
  const [exporting, setExporting] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [notice, setNotice] = useState("");
  const node = useRef<HTMLDivElement>(null);
  const versions = card?.versions ?? [];
  const current = versions.find((row) => row.version === (viewing ?? card?.currentVersion)) ?? versions[versions.length - 1] ?? null;
  const latest = versions.find((row) => row.version === card?.currentVersion) ?? null;
  const comparison = (() => {
    if (!compare) return null;
    const from = versions.find((row) => row.version === compare[0]);
    const to = versions.find((row) => row.version === compare[1]);
    return from && to ? { from, to, changes: compareOffers(contentOf(from), contentOf(to)) } : null;
  })();
  const run = card?.analyses[0] ?? null;
  const running = run?.state === "running";

  const exportAs = async (kind: "image" | "pdf") => {
    if (!current) return;
    setExporting(kind);
    try {
      if (kind === "image" && node.current) await exportOfferImage(node.current, current.name);
      if (kind === "pdf") await exportOfferPdf(contentOf(current), current.version);
    } catch (error) {
      showError(error, "The export did not finish.");
    } finally {
      setExporting("");
    }
  };

  if (building) {
    const editing = building === "edit" && card && latest ? { name: latest.name, nextVersion: Math.max(...versions.map((row) => row.version)) + 1 } : null;
    return (
      <OfferBuilder
        key={editing ? `edit-${card?.id}` : "new"}
        initial={editing && latest ? contentOf(latest) : EMPTY_OFFER}
        editing={editing}
        start={{ profile: starter, copies: cards.map((row) => ({ id: row.id, offer: contentOf(row.current) })) }}
        initialStep={initialBuilder?.step}
        onCancel={() => {
          setBuilding(null);
          props.onBuilderClosed?.();
        }}
        onSave={(offer, note, copyOf) =>
          onSaveCard(editing ? (card?.id ?? null) : null, offer, note, copyOf).then(() => {
            setBuilding(null);
            props.onBuilderClosed?.();
            setViewing(null);
            setCompare(null);
          })
        }
      />
    );
  }

  return (
    <section className="grid gap-3" aria-label="Your offers">
      <SectionTitle icon={Store}>Your offers</SectionTitle>
      {cards.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Choose an offer">
          {cards.map((row) => (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={card?.id === row.id}
              onClick={() => {
                setViewing(null);
                setCompare(null);
                setNotice("");
                onSelectCard(row.id);
              }}
              className={cn("max-w-full truncate rounded-full border px-3 py-1 text-sm transition-colors", card?.id === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
            >
              {row.current.name}
            </button>
          ))}
        </div>
      ) : null}
      {!current ? (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-border p-5">
          <div className="grid gap-1">
            <p className="text-sm text-card-foreground">No offer yet.</p>
            <p className="text-sm text-muted-foreground">
              Build your first offer in five short steps, for example &ldquo;Done-for-you lead generation retainer, $2,500/mo&rdquo;. Each change you save is kept as a version.
            </p>
          </div>
          {editor ? (
            <Button size="sm" onClick={() => setBuilding("new")}>
              <Plus aria-hidden className="size-4" /> Build an offer
            </Button>
          ) : null}
        </div>
      ) : null}
      {current && card ? (
        <div className="grid gap-3">
          <OfferCardView ref={node} offer={contentOf(current)} version={current.version} origin={current.origin} at={current.createdAt} />
          {current.version !== card.currentVersion ? <p className="text-xs text-muted-foreground">You are looking at an earlier version. Editing and analysing use the newest, version {card.currentVersion}.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {editor ? (
              <>
                <Button
                  size="sm"
                  disabled={analysing || running}
                  onClick={() => {
                    setAnalysing(true);
                    setNotice("");
                    void onAnalyse(card.id).then(
                      () => {
                        setAnalysing(false);
                        setNotice("Started. The side-by-side and the test plan show below when it finishes.");
                      },
                      (error: unknown) => {
                        setAnalysing(false);
                        setNotice(showError(error, "The analysis did not start."));
                      },
                    );
                  }}
                >
                  <ScaleIcon aria-hidden className="size-4" /> {running ? "Analysing…" : analysing ? "Starting…" : "Analyse this offer"}
                </Button>
                {model ? <ModelSwitch {...model} /> : null}
                <Button size="sm" variant="outline" onClick={() => setBuilding("edit")}>
                  <PenLine aria-hidden className="size-4" /> Edit
                </Button>
                <RefineInChat href={refineLink(base, "offer-intelligence", { kind: "offer", id: card.id, title: latest?.name ?? card.name })} />
              </>
            ) : null}
            <Button size="sm" variant="ghost" disabled={exporting !== ""} onClick={() => void exportAs("image")}>
              <FileImage aria-hidden className="size-4" /> {exporting === "image" ? "Saving…" : "Image"}
            </Button>
            <Button size="sm" variant="ghost" disabled={exporting !== ""} onClick={() => void exportAs("pdf")}>
              <Download aria-hidden className="size-4" /> {exporting === "pdf" ? "Saving…" : "PDF"}
            </Button>
          </div>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {editor && !tab.state.approvedReport ? <p className="text-xs text-muted-foreground">Analyse this offer needs an approved market report: it sets your offer beside competitors from approved research only.</p> : null}
          {versions.length > 0 ? (
            <div className="grid gap-2 rounded-2xl border border-border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LayoutList aria-hidden className="size-3.5 text-primary" /> {versions.length === 1 ? "1 version. Saving a change makes version 2." : `${versions.length} versions`}
              </p>
              {versions.length > 1 ? (
                <>
                  <ol className="flex flex-wrap gap-1.5">
                    {versions.map((row) => (
                      <li key={row.version}>
                        <button
                          type="button"
                          onClick={() => setViewing(row.version)}
                          aria-pressed={row.version === current.version}
                          className={cn("rounded-lg border px-2.5 py-1 text-xs transition-colors", row.version === current.version ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
                          title={row.note ?? undefined}
                        >
                          v{row.version} · {shortDate(row.createdAt)}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCompare(compare ? null : [versions[versions.length - 2].version, versions[versions.length - 1].version])}>
                      <ScaleIcon aria-hidden className="size-4" /> {compare ? "Hide comparison" : "Compare versions"}
                    </Button>
                    {compare ? (
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <select aria-label="Compare from" value={compare[0]} onChange={(event) => setCompare([Number(event.target.value), compare[1]])} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-card-foreground">
                          {versions.map((row) => (
                            <option key={row.version} value={row.version}>
                              v{row.version}
                            </option>
                          ))}
                        </select>
                        to
                        <select aria-label="Compare to" value={compare[1]} onChange={(event) => setCompare([compare[0], Number(event.target.value)])} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-card-foreground">
                          {versions.map((row) => (
                            <option key={row.version} value={row.version}>
                              v{row.version}
                            </option>
                          ))}
                        </select>
                      </span>
                    ) : null}
                  </div>
                  {comparison ? <OfferCompareView comparison={comparison} /> : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Where the newest "Analyse this offer" run on this card stands. */
function AnalysisRun({ card }: { card: OfferCardFull }) {
  const run = card.analyses[0];
  if (!run || run.state === "done") return null;
  return (
    <Link href={`/app/runs/${run.runId}`} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors hover:border-primary/50", run.state === "running" ? "border-primary/30 bg-primary/[0.06] text-card-foreground" : "border-border text-muted-foreground")}>
      {run.state === "running" ? <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" /> : null}
      {run.state === "running" ? `Analysing version ${run.version} of this offer. Follow each step.` : `The analysis of version ${run.version} stopped before it finished. See what happened.`}
    </Link>
  );
}

/** The newest analysis drawn as data: the side-by-side, gaps, and the test plan. */
function AnalysisPanel({ base, tab, analysis, analysisId, onSelectAnalysis, onCardFromAnalysis, card, decisions, tryActions, editor }: OffersTabProps) {
  const [notice, setNotice] = useState("");
  const options = tab.results.filter((row) => row.status !== "rejected");
  if (options.length === 0) {
    return (
      <Panel className="grid gap-2 p-4 sm:p-5">
        <SectionTitle icon={ScaleIcon}>You vs competitors</SectionTitle>
        <p className="text-sm text-muted-foreground">
          {tab.state.approvedReport ? "Press Analyse this offer on a saved offer. The side-by-side with competitors and the test plan show here, built from your approved research." : "Approve a market report first: the side-by-side is built only from approved research."}
        </p>
        {card ? <AnalysisRun card={card} /> : null}
      </Panel>
    );
  }
  const ready = analysis !== null && analysis.status !== "rejected";
  const glance = analysis ? offerGlance(analysis) : null;
  const next = analysis?.changes.find((row) => !decisions.has(row.index)) ?? null;
  return (
    <Panel className="grid gap-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionTitle icon={ScaleIcon}>You vs competitors</SectionTitle>
        {options.length > 1 ? (
          <select aria-label="Choose an analysis" value={analysisId ?? ""} onChange={(event) => onSelectAnalysis(event.target.value)} className="max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-card-foreground">
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {shortDate(row.createdAt)} · {row.status === "approved" ? "Approved" : "Draft"}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {card ? <AnalysisRun card={card} /> : null}
      {analysis && glance ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge label={analysis.status === "approved" ? "Approved" : analysis.status === "needsReview" ? "Needs review" : "Draft"} tone={analysis.status === "approved" ? "good" : "warning"} className="[&_span]:normal-case" />
            <span>Built on {analysis.reports.map((row) => `${row.title} (v${row.version})`).join(", ") || "approved research"}</span>
          </div>
          <VerdictStrip
            text={analysis.summary || "This analysis has no summary. The comparison is below."}
            label={glance.weakest}
            counts={[
              { value: String(glance.competitors), words: glance.competitors === 1 ? "competitor compared" : "competitors compared" },
              { value: String(glance.fieldsBehind.length), words: `of 2 fields a competitor states and you do not${glance.fieldsBehind.length ? ` (${glance.fieldsBehind.join(", ")})` : ""}` },
              { value: String(glance.gaps), words: glance.gaps === 1 ? "gap" : "gaps" },
              { value: String(glance.risks), words: glance.risks === 1 ? "risk" : "risks" },
              { value: String(glance.changes), words: glance.changes === 1 ? "change to test" : "changes to test" },
            ]}
          />
          <CompetitorSideBySide ours={analysis.ours} competitors={analysis.competitors} />
          {editor && analysis.ours.basis !== "insufficient" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void onCardFromAnalysis(analysis.assetId, card?.id ?? null).then(
                    () => setNotice("Added to your offer as a new version."),
                    (error: unknown) => setNotice(showError(error, "That did not save.")),
                  )
                }
              >
                <Copy aria-hidden className="size-4" /> {card ? "Update my offer from this" : "Make an offer from this"}
              </Button>
              <RefineInChat href={refineLink(base, "offer-intelligence", { kind: "asset", id: analysis.assetId, title: analysis.title })} />
              {notice ? <span className="text-xs text-muted-foreground">{notice}</span> : null}
            </div>
          ) : null}
          {analysis.gapsAndRisks.length ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium text-card-foreground">Gaps and risks</h3>
              <GapsList gaps={analysis.gapsAndRisks} />
            </div>
          ) : null}
          <div className="grid gap-3">
            <SectionTitle icon={Target}>Test plan</SectionTitle>
            <p className="text-sm text-muted-foreground">Two or three changes to test. Pick one, set a check-in, and record what happened.</p>
            <TestPlan changes={analysis.changes} decisions={decisions} actions={tryActions} editor={editor} ready={ready} />
          </div>
          {ready && next ? <NextStep title={next.title} label={next.basisLabel} note={`Change ${next.index + 1} of ${analysis.changes.length} in the test plan. Nothing changes in your offer until you change it.`} href={`#offer-change-${next.index + 1}`} /> : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading the analysis.</p>
      )}
    </Panel>
  );
}

export function OffersTabView(props: OffersTabProps) {
  const { base, editor, tab, review } = props;
  // The builder's own button lives in the hero, so the panel is remounted with the builder open.
  const [builderKey, setBuilderKey] = useState(0);
  const [openNew, setOpenNew] = useState(false);
  const [view, setView] = useWorkView(props.initialView);
  const building = openNew || Boolean(props.initialBuilder);
  // The canvas shows a saved offer; building one always happens in Cards.
  const canvas = view === "canvas" && props.card !== null && !building;
  const hero = (
    <WorkHero
      icon={Store}
      eyebrow={agentWork(null, "offer-intelligence")}
      title="Offers"
      promise="Build your offer step by step, keep every version, and set it beside what competitors lead with."
      working={tab.running.length > 0}
      action={
        <>
          {props.card ? <ViewSwitch view={view} onChange={setView} /> : null}
          {editor ? (
            <Button
              onClick={() => {
                setOpenNew(true);
                setBuilderKey((value) => value + 1);
              }}
            >
              <Plus aria-hidden className="size-4" /> New offer
            </Button>
          ) : null}
        </>
      }
    />
  );
  const results = <ResultsList results={tab.results} actions={review} editor={editor} empty="Offer analyses appear here for you to review." refineHref={(row) => refineLink(base, "offer-intelligence", { kind: "asset", id: row.id, title: row.title })} />;
  const rail = (
    <>
      <RunningNow running={tab.running} finished={tab.finished} />
      <SuggestedNext suggestions={tab.suggestions} hrefFor={(row) => suggestionHref(base, row)} />
      <SharedLinks base={base} />
    </>
  );
  // The canvas takes the full width: the board needs the room. What sat beside it moves underneath.
  if (canvas && props.card) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-5">
        {hero}
        <OffersCanvas card={props.card} analysis={props.analysis} decisions={props.decisions} tryActions={props.tryActions} editor={editor} />
        {results}
        <aside className="grid min-w-0 content-start gap-5 md:grid-cols-3">{rail}</aside>
      </div>
    );
  }
  return (
    <WorkLayout
      main={
        <>
          {hero}
          <CardsPanel key={builderKey} {...props} initialBuilder={openNew ? { mode: "new" } : props.initialBuilder} onBuilderClosed={() => setOpenNew(false)} />
          <AnalysisPanel {...props} />
          {results}
        </>
      }
      rail={rail}
    />
  );
}

/** The Offers tab fed by Convex. `analysisId` (from a chat's result link) opens on that analysis. */
export function OffersTab({ workspaceId, base, editor, analysisId: linked }: { workspaceId: Id<"workspaces">; base: string; editor: boolean; analysisId?: string | null }) {
  const { scope, clientId } = useClientScope();
  const tab = useQuery(api.workTabs.tab, { workspaceId, scope, skillSlug: "offer-intelligence" });
  const cards = useQuery(api.offers.list, { workspaceId, scope });
  const starter = useQuery(api.offers.starter, { workspaceId });
  const [cardId, setCardId] = useState<string | null>(null);
  const chosenCard = (cardId ?? cards?.[0]?.id ?? null) as Id<"offerCards"> | null;
  const card = useQuery(api.offers.get, chosenCard ? { workspaceId, cardId: chosenCard } : "skip");
  const [analysisId, setAnalysisId] = useState<string | null>(linked ?? null);
  // The analysis under the card: the one chosen, else the newest run from this card, else the newest of all.
  const fromCard = card?.analyses.find((row) => row.assetId && row.assetStatus !== "rejected")?.assetId ?? null;
  const firstAnalysis = tab?.results.find((row) => row.status !== "rejected")?.id ?? null;
  const chosenAnalysis = (analysisId ?? fromCard ?? firstAnalysis) as Id<"assets"> | null;
  const analysis = useQuery(api.offers.analysis, chosenAnalysis ? { workspaceId, assetId: chosenAnalysis } : "skip");
  const save = useMutation(api.offers.saveVersion);
  const analyse = useMutation(api.offerRuns.analyse);
  const modelChoice = useModelChoice(workspaceId, "offer-intelligence");
  const fromAnalysis = useMutation(api.offers.fromAnalysis);
  const { byIndex, actions } = useItemDecisions(workspaceId, chosenAnalysis);
  const review = useReviewActions(workspaceId);
  if (!tab || !cards) return <p className="text-sm text-muted-foreground">Loading offers.</p>;
  return (
    <OffersTabView
      base={base}
      editor={editor}
      tab={tab}
      cards={cards}
      card={card ?? null}
      starter={starter?.profile?.offer ?? null}
      onSelectCard={(id) => {
        setCardId(id);
        setAnalysisId(null);
      }}
      onSaveCard={async (id, offer, note, copyOf) => {
        const result = await save({ workspaceId, ...(id ? { cardId: id as Id<"offerCards"> } : {}), ...offer, note, ...(copyOf && !id ? { copyOf: copyOf as Id<"offerCards"> } : {}), ...(!id && !copyOf && clientId ? { clientId } : {}) });
        setCardId(result.cardId);
      }}
      model={editor ? modelChoice.props : null}
      onAnalyse={async (id) => {
        await analyse({ workspaceId, cardId: id as Id<"offerCards">, ...(modelChoice.picked ? { model: modelChoice.picked } : {}) });
        setAnalysisId(null);
      }}
      analysis={analysis ?? null}
      analysisId={chosenAnalysis}
      onSelectAnalysis={setAnalysisId}
      onCardFromAnalysis={async (assetId, id) => {
        const result = await fromAnalysis({ workspaceId, assetId: assetId as Id<"assets">, ...(id ? { cardId: id as Id<"offerCards"> } : {}) });
        setCardId(result.cardId);
      }}
      decisions={byIndex}
      tryActions={actions}
      review={review}
    />
  );
}
