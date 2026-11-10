"use client";

import { AgentOverviewView, overviewFrom } from "@/components/agents/agent-overview";

import { STORY_AGENTS } from "../journey-sidebar/fixtures";
import { storyTab } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

/** The agent's home with fixture data: status, what is waiting, recent results across tabs, and skills. */
export function AgentOverviewStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  const agent = STORY_AGENTS.find((row) => row.slug === "growth-architect")!;
  const base = "/app/agents/growth-architect";
  const tabs = (["market-intelligence", "offer-intelligence", "growth-diagnostics"] as const).map((skill) => storyTab(skill, state));
  const chats = state === "empty" ? [] : [{ id: "i2", title: "Why did we stop adding retained clients?", status: "ready" }];
  return (
    <StoryFrame theme={theme} role={editor ? "owner" : "rep"} header>
      <AgentOverviewView base={base} promise={agent.promise} stateLabel="On" on editor={editor} data={overviewFrom(base, tabs, chats)} skills={agent.skills ?? []} />
    </StoryFrame>
  );
}
