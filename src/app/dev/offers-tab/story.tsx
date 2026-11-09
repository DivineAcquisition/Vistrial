"use client";

import { useState } from "react";

import { OffersTabView } from "@/components/work/offers-tab";
import { SkillChatView } from "@/components/work/skill-chat";

import { StoryFrame } from "../work-tabs/story-frame";
import { storyAnalysis, storyCards, storyDecisions, storyOfferChat, storyTab } from "../work-tabs/fixtures";

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
        chat={<SkillChatView data={storyOfferChat(state)} editor={editor} placeholder="What should we look at in your offer?" onSend={noop} onStart={noop} onReset={() => undefined} />}
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
