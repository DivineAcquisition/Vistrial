"use client";

import { useState } from "react";

import { OffersTabView } from "@/components/work/offers-tab";

import { StoryFrame } from "../work-tabs/story-frame";
import { STORY_PROFILE_OFFER, storyAnalysis, storyCards, storyDecisions, storyTab } from "../work-tabs/fixtures";

const noop = async () => undefined;

/**
 * The Offers workspace with fixture data. `state`: full (the card, its versions, the analysis under it),
 * empty, rep, analysing, new (the builder, blank), build (the builder mid-way, step from `step`), edit.
 */
export function OffersTabStory({ state, theme, step, view }: { state: string; theme: string; step: number; view: string }) {
  const editor = state !== "rep";
  const data = state === "new" ? "full" : state === "build" || state === "edit" ? "full" : state;
  const { cards, card } = storyCards(data);
  const [chosen, setChosen] = useState(card);
  const builder = state === "new" ? { mode: "new" as const, step } : state === "build" || state === "edit" ? { mode: "edit" as const, step } : null;
  return (
    <StoryFrame theme={theme} role={editor ? "owner" : "viewer"}>
      <OffersTabView
        base="/app/agents/growth-architect"
        editor={editor}
        tab={storyTab("offer-intelligence", data)}
        cards={cards}
        card={chosen}
        starter={STORY_PROFILE_OFFER}
        onSelectCard={(cardId) => setChosen(cardId === card?.id ? card : null)}
        onSaveCard={noop}
        onAnalyse={noop}
        analysis={data === "empty" || data === "analysing" ? null : storyAnalysis()}
        analysisId="a1"
        onSelectAnalysis={() => undefined}
        onCardFromAnalysis={noop}
        decisions={data === "empty" ? new Map() : storyDecisions()}
        tryActions={{ plan: noop, record: noop, remove: noop }}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
        initialBuilder={builder}
        initialView={view === "canvas" ? "canvas" : "cards"}
      />
    </StoryFrame>
  );
}
