"use client";

import { NoteTakersView, type NoteTakersData } from "@/components/work/note-takers";

import { StoryFrame } from "../work-tabs/story-frame";

const NOW = Date.UTC(2026, 10, 14, 15);
const DAY = 86_400_000;
const noop = async () => undefined;

/** A coaching agency's recent calls. Sample data. */
function data(view: string): NoteTakersData {
  return {
    canConnect: true,
    canImport: true,
    fireflies: view === "connected" ? { connected: true, accountLabel: "Nora Quinn" } : null,
    fathom: "Fathom connects once its sign-in is confirmed with Fathom. Until then, copy a Fathom transcript and add it in Transcripts.",
    transcribing: view === "connected",
    recordings: [
      { ref: "m1", leadName: "Jordan Lee", at: NOW - DAY, minutes: 24, imported: false },
      { ref: "m2", leadName: "Priya Shah", at: NOW - 3 * DAY, minutes: 31, imported: true },
    ],
  };
}

const calls = [
  { id: "t1", title: "Discovery call: Harbor Fitness", at: NOW - DAY, minutes: 32, imported: false },
  { id: "t2", title: "Follow-up: Priya Shah", at: NOW - 2 * DAY, minutes: 18, imported: true },
];

export function NoteTakersStory({ view, theme }: { view: string; theme: string }) {
  return (
    <StoryFrame theme={theme} role="owner">
      <NoteTakersView data={data(view)} initialCalls={view === "connected" ? calls : null} actions={{ connect: noop, listFireflies: async () => calls, importFireflies: noop, transcribe: noop }} />
    </StoryFrame>
  );
}
