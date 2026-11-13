"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, useState } from "react";

import { type SourceLite } from "@/components/research/findings";
import { StudioLayout } from "@/components/research/studio-layout";
import { type Studio } from "@/components/research/studio-parts";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

const WS = "ws1" as Id<"workspaces">;
const S = (n: number) => `src${n}`;

export const SOURCES: SourceLite[] = [
  { id: S(1), title: "Rival Growth: booked calls for coaches", url: "https://rival-growth.example.com/", platform: "web", publisher: "Rival Growth", origin: "supplied" },
  { id: S(2), title: "How we filled a coach's calendar in 30 days", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", platform: "youtube", publisher: "Brightside Agency" },
  { id: S(3), title: "It's not magic, it's the checklist", url: "https://coachfunnelco.example.com/", platform: "web", publisher: "Coach Funnel Co" },
  { id: S(4), title: "A coach's calendar, before and after", url: "https://www.tiktok.com/@team/video/7234567890123456789", platform: "tiktok", publisher: "family-run team" },
];

const CHECKS_PASSED = {
  passed: true,
  results: [
    [1, "Understood the objective"],
    [2, "Used the business context"],
    [3, "Three distinct opportunities"],
    [4, "Claims point to evidence"],
    [5, "Every claim has a basis"],
    [6, "Limits are named"],
    [7, "Required structure"],
    [8, "Within the cost cap"],
  ].map(([id, name]) => ({ id: id as number, name: name as string, passed: true, detail: id === 8 ? "The run used 245 credits of its 900 credits limit." : "Passed." })),
};

const OPPS = [
  {
    opportunity: "Lead with visible fixed pricing",
    evidence: { sourceRefIds: [S(1), S(2)], uncertainty: "hypothesis" },
    businessRelevance: { text: "Your retainer has a stated price ($2,500 a month, $3,500 setup). No competitor excerpt we saw showed a price.", profileFields: ["offer"], factIds: [] },
    proposedAction: "Check the top agency pages for prices first. If most hide them, state both prices on your landing page and say 'fixed price, no quote call needed'.",
    validationMethod: "Record four weeks of profile calls and clicks as a baseline, then compare the four to eight weeks after.",
  },
  {
    opportunity: "Publish a checklist instead of generic trust claims",
    evidence: { sourceRefIds: [S(3), S(1)], uncertainty: "hypothesis" },
    businessRelevance: { text: "Four competitors lead with 'trust'. One proves consistency with a checklist, which fits your plain, trustworthy voice.", profileFields: ["brandVoice"], factIds: [] },
    proposedAction: "Write a line-by-line list of what the $3,500 setup and the $2,500 retainer include and exclude, and use it as the ad landing page.",
    validationMethod: "Track checklist page views to bookings, and count 'what is included?' questions before and after.",
  },
  {
    opportunity: "Client result videos with the $3,500 setup price",
    evidence: { sourceRefIds: [S(4)], uncertainty: "hypothesis" },
    businessRelevance: { text: "Movers are a core audience, and your $1,500 a month Meta budget (verified) can test this.", profileFields: ["audience"], factIds: ["f1"] },
    proposedAction: "Film two or three real client results and test price-first against 'calendar full in 30 days' on Meta for three to four weeks.",
    validationMethod: "Compare cost per lead and booked calls for the two angles in Ads Manager.",
  },
];

export function studioFor(kind: "done" | "review" | "waiting" | "timedOut" | "working"): Studio {
  const base = {
    project: {
      id: "p1",
      title: "Agencies for coaches",
      objective: "Find the offers and messages agencies for coaches lead with, and where we can stand out.",
      market: kind === "waiting" || kind === "timedOut" ? "" : "Marketing agencies for coaches",
      geography: "Austin, TX",
      competitors: [{ name: "Rival Growth", url: "https://rival-growth.example.com" }],
      platforms: ["web", "youtube", "tiktok"],
      suppliedUrls: [],
      status: "ready",
      createdAt: 1793800000000,
    },
    context: {
      market: kind === "waiting" || kind === "timedOut" ? "" : "Marketing agencies for coaches",
      geography: "Austin, TX",
      profile: { versionId: "pv1", offer: "Done-for-you lead generation for coaches, fixed monthly price", audience: "Coaches and consultants already selling", geography: "Austin, TX" },
      facts: [
        { id: "f1", factKey: "monthlyAdBudget", value: "$1,500 a month on Meta", status: "verified", sourceType: "owner", recordedAt: 1793800000000 },
        { id: "f2", factKey: "topObjection", value: "Customers worry about hidden fees", status: "unverified", sourceType: "agent", recordedAt: 1793700000000 },
      ],
      gaps: kind === "waiting" || kind === "timedOut" ? ["researchMarket"] : [],
      known: [
        { key: "geography", label: "Area", value: "Austin, TX", origin: "profile", status: "verified", recordedAt: 1793600000000 },
        { key: "offer", label: "Offer", value: "Done-for-you lead generation for coaches, fixed monthly price", origin: "profile", status: "verified", recordedAt: 1793600000000 },
        { key: "monthlyAdBudget", label: "Ad budget", value: "$1,500 a month on Meta", origin: "fact", status: "verified", recordedAt: 1793800000000 },
        { key: "topObjection", label: "Top objection", value: "Customers worry about hidden fees", origin: "fact", status: "unverified", recordedAt: 1793700000000 },
      ],
      missing: kind === "waiting" || kind === "timedOut" ? [{ key: "researchMarket", blocking: true }] : [],
      assumptions: [],
    },
    brief:
      kind === "waiting" || kind === "timedOut"
        ? null
        : {
            objective: "Find the offers and messages agencies for coaches lead with.",
            deliverables: ["A report with three opportunities"],
            researchQuestions: ["What do competing agencies lead with?", "Who shows a price?", "What do their ads promise?"],
            searchQueries: ["marketing agency for coaches", "lead generation for coaches price", "Rival Growth agency"],
            competitorsToLookUp: ["Rival Growth"],
            known: { profileVersionId: "pv1", factIds: ["f1"] },
            missing: [{ gap: "Competitor prices", blocks: false }],
            assumptions: ["No competitor price list is on record, so prices are checked on the pages found."],
          },
    checks: null,
    report: null,
    assetId: null,
  };
  const run = (status: string, extra: object = {}) => ({
    id: "r1",
    status,
    stopReason: status === "completed" ? "done" : null,
    costCents: status === "completed" ? 81.62 : 12.4,
    startedAt: T0,
    finishedAt: status === "completed" ? T0 + 298_000 : null,
    waitingFor: null,
    needsInputReason: null,
    stepsDone: 15,
    reserveSkipped: false,
    ...extra,
  });
  const report = (n: number) => ({
    objective: base.project.objective,
    summary: "Competing agencies we could see lead with trust or with before-and-after results, and none of the excerpts showed a price. Evidence is thin, so all three ideas are tests, not conclusions.",
    findings: [
      { statement: "Trust is the most repeated lead message among the agencies we saw.", basis: "observed", sourceRefIds: [S(1), S(3)] },
      { statement: "Brightside Agency leads its videos with client results.", basis: "observed", sourceRefIds: [S(2)] },
      { statement: "A visible fixed price may set the business apart, once checked on full pages.", basis: "inferred", sourceRefIds: [S(1), S(2)] },
      { statement: "Not enough data: no competitor prices or Meta ads were collected.", basis: "insufficient", sourceRefIds: [] },
    ],
    opportunities: OPPS.slice(0, n),
    limits: [
      { platform: "web", text: "Partial. Most agency pages were link-only, so offers and prices on them were not seen." },
      { platform: "tiktok", text: "No public search. Only 8 videos were collected." },
    ],
    contextUsed: { profileVersionId: "pv1", factIds: ["f1"] },
    missingOpportunityReason: n < 3 ? "The sources support only two distinct opportunities." : "",
  });
  switch (kind) {
    case "done":
      return { ...base, run: run("completed"), checks: CHECKS_PASSED, report: report(3), assetId: "a1" } as unknown as Studio;
    case "review":
      return {
        ...base,
        run: run("completed"),
        checks: {
          passed: false,
          results: CHECKS_PASSED.results.map((row) =>
            row.id === 3 ? { ...row, passed: false, detail: "Only 2 opportunities could be supported by the available evidence. Additional research or user input is required." } : row,
          ),
        },
        report: report(2),
        assetId: "a1",
      } as unknown as Studio;
    case "waiting":
      return { ...base, run: run("waiting", { waitingFor: { questionId: "q1", question: "Which industry or market should I research?", askedAt: 1793800000000 }, costCents: 0 }) } as unknown as Studio;
    case "timedOut":
      return { ...base, run: run("needsInput", { waitingFor: { questionId: "q1", question: "Which industry or market should I research?", askedAt: 1793200000000 }, needsInputReason: "timedOut", costCents: 0 }) } as unknown as Studio;
    case "working":
      return { ...base, run: run("running") } as unknown as Studio;
  }
}

const T0 = 1793800000000;
/** Seconds after the start at which each phase finished, from the dev run. */
const AT: Record<string, number> = { context: 2, ask: 3, brief: 21, research: 118, collect: 131, classify: 176, applyClassification: 177, compute: 178, prioritize: 214, write: 296, check: 297, save: 298 };
const stepRow = (phase: string, extra: Record<string, unknown> = {}) => ({
  phase,
  status: "completed",
  kind: "tool",
  resultCode: "ok",
  at: T0 + (AT[phase] ?? 0) * 1000,
  ...(phase === "research" ? { webSearches: 9, webFetches: 14 } : {}),
  ...extra,
});
export const STEPS: Record<string, { phase: string; status: string; kind: string; resultCode: string; at?: number; webSearches?: number; webFetches?: number }[]> = {
  done: ["context", "brief", "research", "collect", "classify", "applyClassification", "compute", "prioritize", "write", "check", "save"].map((phase) => stepRow(phase, phase === "check" ? { resultCode: "passed" } : {})),
  working: ["context", "brief", "research", "collect", "classify"].map((phase) => stepRow(phase)),
  waiting: [stepRow("context", { resultCode: "missing_context" }), stepRow("ask", { kind: "note", resultCode: "waiting_for_user" })],
};

const STORIES = [
  { key: "done", label: "Finished, all checks passed" },
  { key: "review", label: "Needs review (two opportunities)" },
  { key: "waiting", label: "Waiting for User" },
  { key: "timedOut", label: "Needs Input, timed out" },
  { key: "working", label: "Working" },
] as const;

const WIDTHS = [
  { value: "full", label: "Full width" },
  { value: "390", label: "Phone, 390 px" },
  { value: "320", label: "Phone, 320 px" },
];

/** The Research Studio from fake data. Development only. */
const META = {
  done: { label: "Completed", tone: "good" },
  review: { label: "Completed", tone: "good" },
  waiting: { label: "Waiting for User", tone: "warning" },
  timedOut: { label: "Needs Input — Timed Out", tone: "critical" },
  working: { label: "Running", tone: "brand" },
} as const;

export function ResearchStudioStory({ initialState, initialWidth, initialSection }: { initialState?: string; initialWidth?: string; initialSection?: string }) {
  const client = useMemo(() => new ConvexReactClient("https://story-only.convex.cloud"), []);
  const [key, setKey] = useState<(typeof STORIES)[number]["key"]>(
    () => (STORIES.find((row) => row.key === initialState)?.key ?? "done"),
  );
  const [width, setWidth] = useState(() => (WIDTHS.some((row) => row.value === initialWidth) ? initialWidth! : "full"));
  // The working story starts three minutes ago, so its clock and timings read like a live run.
  const [liveStart] = useState(() => Date.now() - 180_000);
  const shift = key === "working" ? liveStart - T0 : 0;
  const base = studioFor(key);
  const studio = (shift && base.run ? { ...base, run: { ...base.run, startedAt: liveStart } } : base) as Studio;
  const steps = (STEPS[key === "review" ? "done" : key === "timedOut" ? "waiting" : key] ?? STEPS.waiting).map((row) => (row.at ? { ...row, at: row.at + shift } : row));
  const open = key === "waiting" || key === "working";
  const sources = new Map(SOURCES.map((row) => [row.id, row]));
  return (
    <ConvexProvider client={client}>
      <div className="grid min-h-screen gap-6 bg-background p-4 sm:p-8">
        <div className="mx-auto grid w-full max-w-3xl gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">Research Studio story page. Fake data from the dev run, development only.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select aria-label="State" density="compact" value={key} options={STORIES.map((row) => ({ value: row.key, label: row.label }))} onChange={(e) => setKey(e.target.value as typeof key)} />
            <Select aria-label="Width" density="compact" value={width} options={WIDTHS} onChange={(e) => setWidth(e.target.value)} />
          </div>
        </div>
        <div className={cn("mx-auto w-full", width === "390" && "max-w-[390px]", width === "320" && "max-w-[320px]")}>
          <StudioLayout
            workspaceId={WS}
            studio={studio}
            steps={steps}
            open={open}
            meta={META[key]}
            statuses={
              key === "waiting" || key === "timedOut"
                ? []
                : [
                    { platform: "web", state: "partial", reasonCode: "ok", found: 30 },
                    { platform: "youtube", state: "available", reasonCode: "ok", found: 22 },
                    { platform: "tiktok", state: "available", reasonCode: "ok", found: 8 },
                  ]
            }
            counts={key === "waiting" || key === "timedOut" ? new Map() : new Map([["web", 30], ["youtube", 22], ["tiktok", 8]])}
            sources={key === "waiting" || key === "timedOut" ? new Map() : sources}
            assetStatus={key === "review" ? "needsReview" : key === "done" ? "draft" : null}
            reportAsset={key === "done" || key === "review" ? { id: "a1", title: "Market report: agencies for coaches", status: key === "review" ? "needsReview" : "draft", currentVersion: key === "review" ? 2 : 1 } : null}
            capCents={300}
            editor
            initialSection={initialSection}
            researchSlot={<p className="text-sm text-muted-foreground">The board renders here. See /dev/research-board for it with fixtures.</p>}
          />
        </div>
      </div>
    </ConvexProvider>
  );
}
