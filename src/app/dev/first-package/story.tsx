"use client";

import { FirstPackageView, type PackageData, type PackagePart } from "@/components/home/first-package";

import { StoryFrame } from "../work-tabs/story-frame";

const PARTS: Record<PackagePart["key"], Omit<PackagePart, "state" | "phase" | "steps" | "assetId" | "reason">> = {
  research: { key: "research", title: "Market report", gives: "Who competes for your buyers, what they offer and charge, and where you can stand out." },
  offers: { key: "offers", title: "Offer ideas", gives: "One to win customers and one to keep them, built from your offers and prices." },
  teardown: { key: "teardown", title: "Page breakdown", gives: "Up to five of your own pages against the landing page framework, with what to change." },
};
const part = (key: PackagePart["key"], rest: Partial<PackagePart>): PackagePart => ({ ...PARTS[key], state: "waiting", phase: null, steps: 0, assetId: null, reason: null, ...rest });

const STATES: Record<string, PackageData> = {
  running: {
    status: "running",
    reason: null,
    emailed: false,
    dismissed: false,
    parts: [part("research", { state: "running", phase: "collect", steps: 14 }), part("offers", {}), part("teardown", { state: "running", phase: "analyse:2", steps: 7 })],
  },
  done: {
    status: "done",
    reason: null,
    emailed: true,
    dismissed: false,
    parts: [part("research", { state: "done", assetId: "a1" }), part("offers", { state: "done", assetId: "a2" }), part("teardown", { state: "done", assetId: "a3" })],
  },
  review: {
    status: "done",
    reason: null,
    emailed: true,
    dismissed: false,
    parts: [
      part("research", { state: "needsReview", assetId: "a1" }),
      part("offers", { state: "skipped", reason: "The research did not arrive approved, so the offer ideas were not written. Review the research, then ask Strategist for offer ideas." }),
      part("teardown", { state: "skipped", reason: "No pages of your own were read, so there was nothing to tear down." }),
    ],
  },
  nowebsite: {
    status: "running",
    reason: null,
    emailed: true,
    dismissed: false,
    parts: [
      part("research", { state: "done", assetId: "a1" }),
      part("offers", { state: "done", assetId: "a2" }),
      { ...part("teardown", { state: "running", phase: "write", steps: 2 }), title: "Landing page", gives: "A full page to the landing page framework, selling your offer idea, built from the research and what you told us. On the Pages tab." },
    ],
  },
  waiting: { status: "waiting", reason: null, emailed: false, dismissed: false, parts: [part("research", {}), part("offers", {}), part("teardown", {})] },
};

/** The first package as Home shows it, for a paid ads agency that serves coaches. */
export function FirstPackageStory({ state }: { state: string }) {
  return (
    <StoryFrame theme="light">
      <FirstPackageView data={STATES[state] ?? STATES.running} onDismiss={() => undefined} />
    </StoryFrame>
  );
}
