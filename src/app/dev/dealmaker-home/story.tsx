"use client";

import { useState } from "react";

import { DealmakerHomeView } from "@/components/agents/dealmaker-home";

import { StoryFrame } from "../work-tabs/story-frame";

export function DealmakerHomeStory({ state, theme }: { state: string; theme: string }) {
  const [on, setOn] = useState(state === "on");
  return (
    <StoryFrame theme={theme} role={state === "member" ? "viewer" : "owner"}>
      <DealmakerHomeView base="/app/agents/sales-conversion" on={on} canTurnOn={state !== "member"} onTurnOn={async () => setOn(true)} />
    </StoryFrame>
  );
}
