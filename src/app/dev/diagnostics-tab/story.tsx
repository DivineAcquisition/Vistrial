"use client";

import { Activity } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DiagnosticsTabView } from "@/components/work/diagnostics-tab";

import { storyDiagnostics, storyRoadmapDecisions, storyTab } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

/** The Diagnostics workspace with fixture data: the goal first, where growth stalls, and the 90-day roadmap. */
export function DiagnosticsTabStory({ state, theme, view }: { state: string; theme: string; view: string }) {
  const editor = state !== "rep";
  const data = storyDiagnostics(state);
  return (
    <StoryFrame tab="work/diagnostics" theme={theme} role={editor ? "owner" : "rep"}>
      <DiagnosticsTabView
        base="/app/agents/growth-architect"
        editor={editor}
        data={data.data}
        run={
          <Button>
            <Activity aria-hidden /> Run diagnosis
          </Button>
        }
        initialView={view === "canvas" ? "canvas" : "cards"}
        tab={storyTab("growth-diagnostics", state)}
        goal={data.goal}
        diagnosis={data.diagnosis}
        onSaveGoal={noop}
        decisions={state === "empty" ? new Map() : storyRoadmapDecisions()}
        tryActions={{ plan: noop, record: noop, remove: noop }}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
      />
    </StoryFrame>
  );
}
