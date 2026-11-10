"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";

import { Download, FileImage, LayoutList, PenLine, Plus, ScaleIcon, Store, Target } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { compareOffers } from "../../../convex/lib/offerCards";

import { CompetitorSideBySide, GapsList, TestPlan } from "./offer-analysis";
import { OfferCardView, OfferCompareView, OfferEditor, exportOfferImage, exportOfferPdf, type OfferContent } from "./offer-card";
import type { TryActions } from "./try-this";
import { useItemDecisions } from "./try-this";
import type { ItemDecision, OfferAnalysisView, OfferCardFull, OfferCardRow, ReviewActions, TabData } from "./types";
import { useReviewActions } from "./use-review";
import { ResultsList, RunningNow, SectionTitle, SharedLinks, SuggestedNext, WorkHero, WorkLayout, refineLink, suggestionHref } from "./work-shell";

export type OffersTabProps = {
  base: string;
  editor: boolean;
  tab: TabData;
  cards: OfferCardRow[];
  card: OfferCardFull | null;
  onSelectCard: (cardId: string) => void;
  onSaveCard: (cardId: string | null, offer: OfferContent, note: string) => Promise<void>;
  analysis: OfferAnalysisView | null;
  analysisId: string | null;
  onSelectAnalysis: (assetId: string) => void;
  onCardFromAnalysis: (assetId: string, cardId: string | null) => Promise<void>;
  decisions: Map<number, ItemDecision>;
  tryActions: TryActions;
  review: ReviewActions;
};

function contentOf(row: OfferContent): OfferContent {
  return { name: row.name, price: row.price, included: row.included, guarantee: row.guarantee, terms: row.terms, targetCustomer: row.targetCustomer };
}

const EMPTY: OfferContent = { name: "", price: "", included: [], guarantee: "", terms: "", targetCustomer: "" };

/** The offer card workspace: the card, its versions and a comparison of any two. */
function CardsPanel({ editor, cards, card, onSelectCard, onSaveCard }: Pick<OffersTabProps, "editor" | "cards" | "card" | "onSelectCard" | "onSaveCard">) {
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [compare, setCompare] = useState<[number, number] | null>(null);
  const [exporting, setExporting] = useState("");
  const node = useRef<HTMLDivElement>(null);
  const versions = card?.versions ?? [];
  const current = versions.find((row) => row.version === (viewing ?? card?.currentVersion)) ?? versions[versions.length - 1] ?? null;
  const comparison = (() => {
    if (!compare) return null;
    const from = versions.find((row) => row.version === compare[0]);
    const to = versions.find((row) => row.version === compare[1]);
    return from && to ? { from, to, changes: compareOffers(contentOf(from), contentOf(to)) } : null;
  })();

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

  return (
    <section className="grid gap-3" aria-label="Offer cards">
      <SectionTitle
        icon={Store}
        aside={
          editor && editing === null ? (
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <Plus aria-hidden className="size-4" /> New offer
            </Button>
          ) : null
        }
      >
        Your offers
      </SectionTitle>
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
                onSelectCard(row.id);
              }}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors", card?.id === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
            >
              {row.current.name}
            </button>
          ))}
        </div>
      ) : null}
      {editing === "new" ? (
        <OfferEditor initial={EMPTY} onCancel={() => setEditing(null)} onSave={(offer, note) => onSaveCard(null, offer, note).then(() => setEditing(null))} />
      ) : null}
      {!current && editing !== "new" ? (
        <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-border p-5">
          <p className="text-sm text-card-foreground">No offer card yet.</p>
          <p className="text-sm text-muted-foreground">Tell the chat above about your offer, or write the card yourself. Each change is kept as a version.</p>
        </div>
      ) : null}
      {current && card ? (
        <div className="grid gap-3">
          {editing === "edit" ? (
            <OfferEditor initial={contentOf(current)} onCancel={() => setEditing(null)} onSave={(offer, note) => onSaveCard(card.id, offer, note).then(() => setEditing(null))} />
          ) : (
            <OfferCardView ref={node} offer={contentOf(current)} version={current.version} origin={current.origin} at={current.createdAt} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {editor && editing === null ? (
              <Button size="sm" variant="outline" onClick={() => setEditing("edit")}>
                <PenLine aria-hidden className="size-4" /> Edit
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={exporting !== ""} onClick={() => void exportAs("image")}>
              <FileImage aria-hidden className="size-4" /> {exporting === "image" ? "Saving…" : "Image"}
            </Button>
            <Button size="sm" variant="ghost" disabled={exporting !== ""} onClick={() => void exportAs("pdf")}>
              <Download aria-hidden className="size-4" /> {exporting === "pdf" ? "Saving…" : "PDF"}
            </Button>
          </div>
          {versions.length > 1 ? (
            <div className="grid gap-2 rounded-2xl border border-border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LayoutList aria-hidden className="size-3.5 text-primary" /> {versions.length} versions
              </p>
              <ol className="flex flex-wrap gap-1.5">
                {versions.map((row) => (
                  <li key={row.version}>
                    <button
                      type="button"
                      onClick={() => setViewing(row.version)}
                      className={cn("rounded-lg border px-2.5 py-1 text-xs transition-colors", row.version === current.version ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
                      title={row.note ?? undefined}
                    >
                      v{row.version} · {shortDate(row.createdAt)}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
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
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The newest analysis drawn as data: the side-by-side, gaps, and the test plan. */
function AnalysisPanel({ tab, analysis, analysisId, onSelectAnalysis, onCardFromAnalysis, card, decisions, tryActions, editor }: OffersTabProps) {
  const [notice, setNotice] = useState("");
  const options = tab.results.filter((row) => row.status !== "rejected");
  if (options.length === 0) {
    return (
      <Panel className="grid gap-2 p-4 sm:p-5">
        <SectionTitle icon={ScaleIcon}>You vs competitors</SectionTitle>
        <p className="text-sm text-muted-foreground">
          {tab.state.approvedReport ? "Ask the chat to analyse your offer. It builds the side-by-side from your approved research." : "Approve a market report first: the side-by-side is built only from approved research."}
        </p>
      </Panel>
    );
  }
  const ready = analysis !== null && analysis.status !== "rejected";
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
      {analysis ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge label={analysis.status === "approved" ? "Approved" : analysis.status === "needsReview" ? "Needs review" : "Draft"} tone={analysis.status === "approved" ? "good" : "warning"} className="[&_span]:normal-case" />
            <span>Built on {analysis.reports.map((row) => `${row.title} (v${row.version})`).join(", ") || "approved research"}</span>
          </div>
          {analysis.summary ? <p className="text-sm text-card-foreground">{analysis.summary}</p> : null}
          <CompetitorSideBySide ours={analysis.ours} competitors={analysis.competitors} />
          {editor && analysis.ours.basis !== "insufficient" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void onCardFromAnalysis(analysis.assetId, card?.id ?? null).then(
                    () => setNotice("Added to your offer card as a new version."),
                    (error: unknown) => setNotice(showError(error, "That did not save.")),
                  )
                }
              >
                <LayoutList aria-hidden className="size-4" /> {card ? "Update my card from this" : "Make a card from this"}
              </Button>
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
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading the analysis.</p>
      )}
    </Panel>
  );
}

export function OffersTabView(props: OffersTabProps) {
  const { base, editor, tab, review } = props;
  return (
    <WorkLayout
      main={
        <>
          <WorkHero icon={Store} eyebrow="Growth Architect · Offer Intelligence" title="Offers" promise="Your offer as a card, set beside what competitors lead with, and the changes worth testing." />
          <CardsPanel {...props} />
          <AnalysisPanel {...props} />
          <ResultsList results={tab.results} actions={review} editor={editor} empty="Offer analyses appear here for you to review." refineHref={(row) => refineLink(base, "offer-intelligence", { kind: "asset", id: row.id, title: row.title })} />
        </>
      }
      rail={
        <>
          <RunningNow running={tab.running} finished={tab.finished} />
          <SuggestedNext suggestions={tab.suggestions} hrefFor={(row) => suggestionHref(base, row)} />
          <SharedLinks base={base} />
        </>
      }
    />
  );
}

/** The Offers tab fed by Convex. */
export function OffersTab({ workspaceId, base, editor, analysisId: linked }: { workspaceId: Id<"workspaces">; base: string; editor: boolean; analysisId?: string | null }) {
  const tab = useQuery(api.workTabs.tab, { workspaceId, skillSlug: "offer-intelligence" });
  const cards = useQuery(api.offers.list, { workspaceId });
  const [cardId, setCardId] = useState<string | null>(null);
  const chosenCard = (cardId ?? cards?.[0]?.id ?? null) as Id<"offerCards"> | null;
  const card = useQuery(api.offers.get, chosenCard ? { workspaceId, cardId: chosenCard } : "skip");
  const [analysisId, setAnalysisId] = useState<string | null>(linked ?? null);
  const firstAnalysis = tab?.results.find((row) => row.status !== "rejected")?.id ?? null;
  const chosenAnalysis = (analysisId ?? firstAnalysis) as Id<"assets"> | null;
  const analysis = useQuery(api.offers.analysis, chosenAnalysis ? { workspaceId, assetId: chosenAnalysis } : "skip");
  const save = useMutation(api.offers.saveVersion);
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
      onSelectCard={setCardId}
      onSaveCard={async (id, offer, note) => {
        const result = await save({ workspaceId, ...(id ? { cardId: id as Id<"offerCards"> } : {}), ...offer, note });
        setCardId(result.cardId);
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
