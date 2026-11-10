"use client";

import { useState } from "react";

import { OffersTabView } from "@/components/work/offers-tab";

import { StoryFrame } from "../work-tabs/story-frame";
import { storyAnalysis, storyCards, storyDecisions, storyTab } from "../work-tabs/fixtures";

const noop = async () => undefined;

/** The Offers workspace with fixture data: the card and its versions, the side-by-side, and the test plan. */
export function OffersTabStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  const { cards, card } = storyCards(state);
  const [chosen, setChosen] = useState(card);
  return (
    <StoryFrame tab="work/offers" theme={theme} role={editor ? "owner" : "rep"}>
      <OffersTabView
        base="/app/agents/growth-architect"
        editor={editor}
        tab={storyTab("offer-intelligence", state)}
        cards={cards}
        card={chosen}
        onSelectCard={(cardId) => setChosen(cardId === card?.id ? card : null)}
        onSaveCard={noop}
        analysis={state === "empty" ? null : storyAnalysis()}
        analysisId="a1"
        onSelectAnalysis={() => undefined}
        onCardFromAnalysis={noop}
        decisions={state === "empty" ? new Map() : storyDecisions()}
        tryActions={{ plan: noop, record: noop, remove: noop }}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
      />
    </StoryFrame>
  );
}
