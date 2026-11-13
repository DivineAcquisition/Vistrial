"use client";

import { useState } from "react";

import { OnboardingSetup, type SetupStage } from "@/components/onboarding/setup";
import { connectCards, HIGHLEVEL_KEY } from "@/lib/onboarding/connect";

import { STORY_CAPTURES } from "../settings-brand/story";
import { StoryTheme } from "../story-theme";

const GOALS = [
  { kind: "leads", label: "Get more leads" },
  { kind: "ads", label: "Make my ads work better" },
  { kind: "competitors", label: "Understand my competitors" },
  { kind: "prices", label: "Price and package my services" },
  { kind: "retention", label: "Keep customers coming back" },
  { kind: "other", label: "Something else" },
] as const;

const STAGES: SetupStage[] = ["website", "connect", "confirm"];

/** Onboarding with an in-memory backend, for a paid ads agency that serves coaches. */
export function OnboardingStory({ step, site }: { step: string; site: string }) {
  const [stage, setStage] = useState<SetupStage>(STAGES.includes(step as SetupStage) ? (step as SetupStage) : "website");
  const capture = site === "none" ? null : (STORY_CAPTURES[site] ?? STORY_CAPTURES.done);
  const cards = connectCards({
    meta: { configured: true, connected: stage !== "website", label: "Brightline Media Ads" },
    providers: [
      { key: "google_calendar", readiness: "ready", connection: null },
      { key: "calendly", readiness: "ready", connection: { status: "connected", accountLabel: "dana@brightline-media.example.com" } },
      { key: HIGHLEVEL_KEY, readiness: "not_built", connection: null },
    ],
    uploads: 0,
  });
  const noop = async () => undefined;
  return (
    <>
      <StoryTheme theme="light" />
      <OnboardingSetup
        key={stage}
        data={{
          stage,
          person: { fullName: "Dana Ruiz", role: "" },
          business: { name: "", website: capture?.url ?? "", offer: "", area: "", audience: "" },
          goal: { kind: "", text: "" },
          goals: GOALS,
          hasWorkspace: true,
        }}
        capture={capture}
        connect={cards}
        actions={{ submitWebsite: noop, skipWebsite: async () => setStage("connect"), goTo: async (next) => setStage(next), connect: noop, confirm: noop }}
      />
    </>
  );
}
