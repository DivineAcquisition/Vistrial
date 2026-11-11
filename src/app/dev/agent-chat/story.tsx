"use client";

import { useState } from "react";

import { ChatLayout, ConversationFrame, ConversationList, NewChatView, ROUTE_LOOK, type ChatContext } from "@/components/chat/agent-chat";
import { ChatComposer } from "@/components/chat/chat-composer";
import { SkillChatView } from "@/components/work/skill-chat";
import type { ChatRoute } from "../../../../convex/lib/chatRouting";

import { storyChats, storyFinishedChat, storyPlanChat, storyUndecidedChat } from "../work-tabs/fixtures";
import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;
const base = "/app/agents/growth-architect";
const OPEN: Record<string, string> = { unclear: "i1", plan: "i2", finished: "i3" };

function NewChat({ editor, preset, attached }: { editor: boolean; preset: ChatRoute | null; attached: ChatContext | null }) {
  const [route, setRoute] = useState<ChatRoute | null>(preset);
  const [context, setContext] = useState<ChatContext | null>(attached);
  return (
    <NewChatView
      agentName="Growth Architect"
      editor={editor}
      preset={route}
      onPreset={setRoute}
      context={context}
      onClearContext={() => setContext(null)}
      composer={(starter) => (
        <ChatComposer
          key={starter}
          size="hero"
          disabled={!editor}
          initialText={starter}
          placeholder={!editor ? "Owners, Admins and Members start work. You can read every conversation." : route ? ROUTE_LOOK[route].hint : "Ask about your market, your offer or your growth…"}
          footnote="It asks only what it needs, then shows a plan with its budget. Nothing runs or spends until you press Start."
          onSubmit={noop}
        />
      )}
    />
  );
}

/** The Chat tab with fixture data: a new chat, the unclear case, a plan ready to start, and a finished job. */
export function AgentChatStory({ state, theme }: { state: string; theme: string }) {
  const editor = state !== "rep";
  const rows = state === "empty" ? [] : storyChats();
  const plan = storyPlanChat();
  const finished = storyFinishedChat();
  return (
    <StoryFrame theme={theme} role={editor ? "owner" : "viewer"}>
      <ChatLayout list={<ConversationList rows={rows} activeId={OPEN[state] ?? null} base={base} canStart={editor} />}>
        {state === "unclear" ? (
          <ConversationFrame chat={storyUndecidedChat()} base={base}>
            <SkillChatView data={{ intake: { id: storyUndecidedChat().id, skillSlug: null, status: "chatting", asking: "skill", answers: {}, runId: null, projectId: null, questions: [] }, messages: storyUndecidedChat().messages }} editor placeholder="Say which, or tap a choice…" onSend={noop} onStart={noop} onReset={() => undefined} />
          </ConversationFrame>
        ) : state === "plan" ? (
          <ConversationFrame chat={plan.chat} base={base}>
            <SkillChatView data={plan.data} editor placeholder="Answer, or tap a choice…" onSend={noop} onStart={noop} onReset={() => undefined} />
          </ConversationFrame>
        ) : state === "finished" ? (
          <ConversationFrame chat={finished.chat} base={base}>
            <SkillChatView data={finished.data} editor placeholder="" onSend={noop} onStart={noop} onReset={() => undefined} />
          </ConversationFrame>
        ) : (
          <NewChat
            editor={editor}
            preset={state === "research" ? "market-intelligence" : state === "context" ? "offer-intelligence" : null}
            attached={state === "context" ? { kind: "offer", id: "c1", title: "Done-for-you lead generation retainer" } : null}
          />
        )}
      </ChatLayout>
    </StoryFrame>
  );
}
