"use client";

import { useState } from "react";

import { BriefingView, type Kind } from "@/components/briefing/briefing-feed";
import { Step2Frame } from "../step2/frame";
import { NOW, storyFeed } from "./fixtures";

/** The Briefing with an agency's week in it. */
export function BriefingStory({ state, theme, kind: asked }: { state: string; theme: string; kind: string | null }) {
  const [kind, setKind] = useState<Kind | null>((state === "trends-off" ? "trend" : asked) as Kind | null);
  const role = state === "viewer" ? "viewer" : state === "member" ? "member" : state === "admin" ? "admin" : "owner";
  return (
    <Step2Frame theme={theme} role={role} path="/app/briefing" state={state === "empty" ? "empty" : "busy"}>
      <BriefingView feed={storyFeed(state, kind)} kind={kind} agent={null} onKind={setKind} onAgent={() => undefined} agentName={() => "Strategist"} decide={async () => undefined} now={NOW} trendsOn={state !== "trends-off"} />
    </Step2Frame>
  );
}
