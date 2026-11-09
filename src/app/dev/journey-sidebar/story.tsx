"use client";

import { SearchResults, JourneySidebarView } from "@/components/shell/journey-sidebar";
import { StoryTheme } from "../story-theme";
import { STORY_AGENTS, STORY_HITS, storyOverview } from "./fixtures";

/** The sidebar with live-looking counts. On a phone it fills the screen, as the drawer does. */
export function JourneySidebarStory({ state, theme, path }: { state: string; theme: string; path: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <StoryTheme theme={theme} />
      <div className="flex h-dvh w-full flex-col border-border md:w-72 md:border-r">
        <JourneySidebarView
          agents={STORY_AGENTS}
          data={{ overview: storyOverview(state), credits: { on: true, balanceCents: state === "empty" ? 0 : 4280 } }}
          pathname={path}
          renderSearch={(text, close) => (
            <SearchResults text={text} hits={STORY_HITS.filter((hit) => hit.title.toLowerCase().includes(text.trim().toLowerCase()))} close={close} />
          )}
        />
      </div>
    </div>
  );
}
