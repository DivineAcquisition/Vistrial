"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, useState } from "react";

import { StartChat } from "@/components/chat/start-chat";
import { LoopHomeView, type ProvenItem, type WaitingItem } from "@/components/home/loop-home";
import { JourneySidebarView, SearchResults } from "@/components/shell/journey-sidebar";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS, STORY_HITS, storyOverview } from "../journey-sidebar/fixtures";
import { StoryTheme } from "../story-theme";

const DAY = 86_400_000;

function waitingFor(now: number): WaitingItem[] {
  return [
    {
      kind: "question",
      key: "q1",
      agentSlug: "growth-architect",
      runId: "r1" as Id<"agentRuns">,
      status: "waiting",
      question: "Should I compare against companies in Round Rock too, or only inside Austin city limits?",
      at: now - 3_600_000,
      projectId: "p1" as Id<"researchProjects">,
      projectTitle: "Austin deep cleaning",
    },
    {
      kind: "checkIn",
      key: "c1",
      agentSlug: "growth-architect",
      decisionId: "d1" as Id<"decisions">,
      proposedAction: "Lead the move-out page with a deposit-back promise and a fixed two-bed price.",
      at: now - 2 * DAY,
      projectId: "p2" as Id<"researchProjects">,
    },
    {
      kind: "approval",
      key: "a1",
      agentSlug: "growth-architect",
      asset: { id: "a1" as Id<"assets">, title: "Austin deep cleaning: market report", kind: "marketReport", status: "needsReview", currentVersion: 2, createdAt: now - 5 * 3_600_000, createdByRun: "r0" as Id<"agentRuns"> },
      at: now - 5 * 3_600_000,
      sources: 38,
    },
    {
      kind: "approval",
      key: "a2",
      agentSlug: "growth-architect",
      asset: { id: "a2" as Id<"assets">, title: "Offer analysis: recurring cleans", kind: "offerAnalysis", status: "draft", currentVersion: 1, createdAt: now - DAY, createdByRun: "r2" as Id<"agentRuns"> },
      at: now - DAY,
      sources: 21,
    },
  ];
}

function provenFor(now: number): ProvenItem[] {
  return [
    {
      id: "d9" as Id<"decisions">,
      projectId: "p3" as Id<"researchProjects">,
      proposedAction: "Offer 20% off the first clean for new recurring customers.",
      result: "better",
      note: "Ran it for four weeks on Meta and the site.",
      recordedAt: now - 3 * DAY,
      changes: [
        { source: "meta", label: "Meta ads", metric: "spend", before: 1200, after: 1100, percent: -8.3 },
        { source: "meta", label: "Meta ads", metric: "conversions", before: 40, after: 58, percent: 45 },
        { source: "upload", label: "Jobber bookings", metric: "revenue", before: 9800, after: 12400, percent: 26.5 },
      ],
    },
  ];
}

/** The home page inside the app frame, fed by fixtures. ?state=busy|empty|rep. */
export function HomeStory({ state, theme }: { state: string; theme: string }) {
  const client = useMemo(() => new ConvexReactClient("https://story-fixture-123.convex.cloud"), []);
  const [now] = useState(() => Date.now());
  const empty = state === "empty";
  const shell: WorkspaceShell = { workspaceId: "ws1" as Id<"workspaces">, role: state === "rep" ? "rep" : "owner", setupDone: true, agents: STORY_AGENTS };
  const overview = storyOverview(state);
  return (
    <ConvexProvider client={client}>
      <ShellProvider value={shell}>
        <StoryTheme theme={theme} />
        <div className="flex min-h-dvh min-w-0 overflow-x-hidden bg-background text-foreground">
          <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border md:flex md:flex-col">
            <JourneySidebarView
              agents={STORY_AGENTS}
              data={{ overview, credits: { on: true, balanceCents: 4280 } }}
              pathname="/app"
              renderSearch={(text, close) => <SearchResults text={text} hits={STORY_HITS} close={close} />}
            />
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
            <LoopHomeView
              chat={<StartChat size="hero" placeholder="Ask in your own words: who are we losing to, which offer to lead with, why sign-ups dropped…" />}
              overview={overview}
              waiting={empty ? [] : waitingFor(now)}
              proven={empty ? [] : provenFor(now)}
            />
          </main>
        </div>
      </ShellProvider>
    </ConvexProvider>
  );
}
