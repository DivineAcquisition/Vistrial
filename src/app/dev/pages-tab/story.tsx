"use client";

import { useState } from "react";

import { PagesTabView, type TeardownAsk } from "@/components/work/pages-tab";
import type { ItemDecision, PagesQuote, PagesTabData, TeardownPageView, TeardownView } from "@/components/work/types";

import { StoryFrame } from "../work-tabs/story-frame";
import fixture from "./fixture.json";

const noop = async () => undefined;

/**
 * The fixture is what the real queries returned for a scripted run over a made-up agency's page and two
 * others (convex/landingTeardown.test.ts writes it). Nothing here is a real business or a real result.
 */
const data = fixture as unknown as { tab: PagesTabData; view: TeardownView; pages: TeardownPageView[]; quote: PagesQuote; brief: unknown };

const BANDS: Record<string, string> = { Nav: "#c3b6fe", Hero: "#9a88fc", Results: "#52d6a4", "Problem agitation": "#f0b45c", Solution: "#7fd1f7", "The offer": "#7e67f2", "With vs without": "#f6a5c0", "Process timeline": "#a3a3a3", FAQ: "#d9d1fe", "Final CTA": "#9a88fc" };

/** A stand-in for a screenshot: the page's sections as labelled bands. A real one comes from the hosted browser. */
function wireframe(sections: string[], width: number) {
  const band = width > 600 ? 150 : 210;
  const rows = sections.map((name, index) => {
    const y = index === 0 ? 0 : 56 + (index - 1) * band;
    const height = index === 0 ? 56 : band;
    return `<rect x="0" y="${y}" width="${width}" height="${height}" fill="${BANDS[name] ?? "#e6e6ec"}" opacity="${index % 2 ? 0.28 : 0.4}"/><text x="${width > 600 ? 40 : 20}" y="${y + (index === 0 ? 34 : 44)}" font-family="sans-serif" font-size="${index === 0 ? 16 : 22}" fill="#1e1940">${name}</text><rect x="${width > 600 ? 40 : 20}" y="${y + (index === 0 ? 100 : 66)}" width="${width * 0.55}" height="10" rx="5" fill="#1e1940" opacity="${index === 0 ? 0 : 0.18}"/><rect x="${width > 600 ? 40 : 20}" y="${y + 88}" width="${width * 0.4}" height="10" rx="5" fill="#1e1940" opacity="${index === 0 ? 0 : 0.12}"/>`;
  });
  const height = 56 + (sections.length - 1) * band;
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${rows.join("")}</svg>`)}`;
}

const ASK: TeardownAsk = { industry: "Marketing agencies for coaches", ownUrl: "https://brightside-agency.example.com/", urls: ["https://rival-growth.example.com/apply", "https://northlight-growth.example.com/"], find: true, note: "" };

const DECISION = {
  id: "d1",
  itemKind: "pageChange",
  phase: null,
  assetId: data.view.assetId,
  opportunityIndex: 0,
  opportunity: data.view.suggestions[0]?.title ?? "",
  proposedAction: data.view.suggestions[0]?.change ?? "",
  validationMethod: data.view.suggestions[0]?.howToTell ?? "",
  checkInAt: Date.UTC(2026, 11, 10),
  createdAt: Date.UTC(2026, 10, 10),
  due: false,
  baseline: [],
  outcome: null,
} as unknown as ItemDecision;

/** The Pages workspace with fixture data: the start form with its plan, and a teardown with the screenshot beside the breakdown. */
export function PagesTabStory({ state, theme, pageId }: { state: string; theme: string; pageId: string }) {
  const editor = state !== "rep";
  const [selected, setSelected] = useState(pageId);
  const empty = state === "empty";
  const running = state === "running";
  const shots = state !== "noshots";
  const found = data.pages.find((row) => row.id === selected) ?? data.pages[0];
  const names = found.sections.map((row) => row.name);
  const page: TeardownPageView = shots ? { ...found, driver: "browser", screenshots: { desktop: wireframe(names, 1280), phone: wireframe(names, 390) } } : found;
  const tab: PagesTabData = empty
    ? { ...data.tab, results: [], running: [], stopped: [] }
    : running
      ? { ...data.tab, running: [{ id: "run1" as never, startedAt: Date.UTC(2026, 10, 10), priceCents: 42, industry: "Marketing agencies for coaches", words: "Reading page 2 against the framework" }], stopped: [{ id: "run0" as never, status: "stopped", stopReason: "cap", startedAt: Date.UTC(2026, 10, 8) }] }
      : data.tab;
  return (
    <StoryFrame tab="work/pages" theme={theme} role={editor ? "owner" : "rep"}>
      <PagesTabView
        base="/app/agents/growth-architect"
        editor={editor}
        tab={tab}
        quote={state === "form" ? { ...data.quote, driver: "browser", screenshots: true, steps: data.quote.steps.map((step) => step.replace(" (no screenshots: the hosted browser is not set up)", ", with a screenshot at desktop and phone widths")), availableCents: 4200, coversMax: true } : null}
        onAskChange={() => undefined}
        onStart={noop}
        view={empty || state === "form" || running ? null : { ...data.view, measured: state !== "noshots" }}
        page={empty || state === "form" || running ? null : page}
        onSelect={() => undefined}
        onSelectPage={setSelected}
        decisions={new Map(state === "full" ? [[0, DECISION]] : [])}
        tryActions={{ plan: noop, record: noop, remove: noop }}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
        briefJson={JSON.stringify(data.brief, null, 2)}
        initialAsk={state === "form" ? ASK : undefined}
      />
    </StoryFrame>
  );
}
