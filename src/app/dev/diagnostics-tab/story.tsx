"use client";

import { DiagnosticsTabView } from "@/components/work/diagnostics-tab";
import { SkillChatView } from "@/components/work/skill-chat";

import { storyDiagnosisChat, storyDiagnostics, storyRoadmapDecisions, storyTab } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

/** The Diagnostics workspace with fixture data: the goal first, where growth stalls, and the 90-day roadmap. */
export function DiagnosticsTabStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  const data = storyDiagnostics(state);
  return (
    <StoryFrame tab="work/diagnostics" theme={theme} role={editor ? "owner" : "rep"}>
      <DiagnosticsTabView
        base="/app/agents/growth-architect"
        editor={editor}
        chat={<SkillChatView data={state === "empty" ? storyDiagnosisChat() : null} editor={editor} placeholder="What should we look at in your growth?" onSend={noop} onStart={noop} onReset={() => undefined} />}
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
