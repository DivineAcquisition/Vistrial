"use client";

import { DealmakerChatView, type ChatData } from "@/components/work/dealmaker-chat";
import { DM_QUESTION, NOTHING_RUNS, PLAN_WORDS, RESULT_TAB } from "../../../../convex/lib/dealmaker/chat";

import { StoryFrame } from "../work-tabs/story-frame";

const NOW = Date.UTC(2026, 10, 14, 15);
const noop = async () => undefined;

/** A coaching agency's owner asking Dealmaker. Sample data. */
function chat(view: string): ChatData | null {
  if (view === "new") return null;
  const messages: ChatData["messages"] = [
    { role: "person", text: "How many open deals do I have?", at: NOW, choices: [] },
    { role: "dealmaker", text: "12 open deals worth $54,000: 7 active, 3 cooling, 2 quiet. You see every deal.", at: NOW, choices: [] },
    { role: "person", text: "Can you help me?", at: NOW, choices: [] },
  ];
  if (view === "pick") {
    messages.push({
      role: "dealmaker",
      text: DM_QUESTION,
      at: NOW,
      choices: ["Review my pipeline", "Prepare me for a call", "Review a call", "Draft my follow-ups"].map((label) => ({ label, value: label })),
    });
    return { id: "chat1" as ChatData["id"], title: "How many open deals do I have?", messages, plan: null, canStart: true };
  }
  messages.push(
    { role: "dealmaker", text: DM_QUESTION, at: NOW, choices: [] },
    { role: "person", text: "Draft my follow-ups", at: NOW, choices: [] },
    { role: "dealmaker", text: `${PLAN_WORDS["follow-up-engine"]} Up to 12 credits. ${NOTHING_RUNS}`, at: NOW, choices: [] },
  );
  return {
    id: "chat1" as ChatData["id"],
    title: "How many open deals do I have?",
    messages,
    plan: { skill: "follow-up-engine", maxCredits: 12, result: RESULT_TAB["follow-up-engine"] },
    canStart: true,
  };
}

export function DealmakerChatStory({ view, theme }: { view: string; theme: string }) {
  const list = view === "new" ? [] : [{ id: "chat1" as ChatData["id"], title: "How many open deals do I have?", updatedAt: NOW }];
  return (
    <StoryFrame theme={theme} role="owner">
      <DealmakerChatView chat={chat(view)} list={list as never} editor base="/app/agents/sales-conversion" actions={{ send: noop, start: noop, open: () => undefined }} />
    </StoryFrame>
  );
}
