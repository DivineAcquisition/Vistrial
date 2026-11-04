import type { RunStepView, RunView, SourceStatusView } from "@/lib/runs/view";

/** Fake runs for the development story page. Every state the run viewer can show, with no backend. */

const T0 = Date.UTC(2026, 9, 27, 14, 0, 0);

function step(index: number, toolSlug: string | null, extra: Partial<RunStepView> = {}): RunStepView {
  const kind = toolSlug ? "tool" : "model";
  return {
    id: `step-${index}`,
    index,
    kind,
    toolSlug,
    workKind: kind === "model" ? "write" : null,
    status: "completed",
    resultCode: "ok",
    durationMs: kind === "model" ? 4200 : 350,
    inputTokens: kind === "model" ? 1800 : 0,
    outputTokens: kind === "model" ? 650 : 0,
    ...extra,
  };
}

const base: RunView = {
  id: "story-run",
  agentSlug: "growth-architect",
  skillSlug: "ad-research",
  status: "running",
  stopReason: null,
  startedAt: T0,
  finishedAt: null,
  startedByName: "Ana Ruiz",
  maxSteps: 40,
  maxDurationMs: 300_000,
  cost: {
    spentCents: 6,
    runCapCents: 25,
    softWarningCents: 20,
    daySpentCents: 48,
    dayCapCents: 200,
    inputTokens: 1800,
    outputTokens: 650,
  },
  steps: [],
  sources: [],
  artifacts: [],
  assets: [],
  question: null,
  timedOut: false,
  completion: null,
};

const researchSteps = [
  step(0, "profile.read"),
  step(1, "web.fetch"),
  step(2, "web.fetch"),
  step(3, "web.fetch"),
  step(4, "source.metaAdLibrary"),
  step(5, null),
];

const report = {
  id: "story-asset",
  title: "Ad research: home cleaning, Austin",
  kind: "researchReport",
  status: "draft" as const,
  currentVersion: 1,
};

const sources: SourceStatusView[] = [
  { source: "web", state: "ok", reasonCode: null },
  { source: "meta", state: "partial", reasonCode: "page_limit" },
  { source: "tiktok", state: "blocked", reasonCode: "challenge_page" },
  { source: "google", state: "unavailable", reasonCode: "layout_changed" },
];

export type Story = { key: string; label: string; run: RunView; connected?: boolean; skillName?: string };

export const STORIES: Story[] = [
  { key: "queued", label: "Queued", run: { ...base, status: "queued", cost: { ...base.cost, spentCents: 0, inputTokens: 0, outputTokens: 0 } } },
  { key: "running", label: "Running", run: { ...base, steps: researchSteps.slice(0, 4) } },
  {
    key: "waiting",
    label: "Waiting for User",
    run: {
      ...base,
      status: "waiting",
      steps: [step(0, null, { kind: "note", workKind: null, resultCode: "asked", durationMs: 0, inputTokens: 0, outputTokens: 0 })],
      question: { questionId: "q1", text: "Which industry or market should I research?", askedAt: T0 },
    },
  },
  {
    key: "needs-input",
    label: "Needs Input — Timed Out",
    run: {
      ...base,
      status: "needsInput",
      timedOut: true,
      steps: [step(0, null, { kind: "note", workKind: null, resultCode: "asked", durationMs: 0, inputTokens: 0, outputTokens: 0 })],
      question: { questionId: "q1", text: "Which industry or market should I research?", askedAt: T0 },
    },
  },
  {
    key: "needs-review",
    label: "Needs Review",
    run: {
      ...base,
      status: "completed",
      stopReason: "done",
      finishedAt: T0 + 240_000,
      cost: { ...base.cost, spentCents: 128, runCapCents: 300, softWarningCents: 240 },
      steps: [...researchSteps, step(6, "asset.create")],
      assets: [{ ...report, title: "Market report: deep cleaning", kind: "marketReport", status: "needsReview", currentVersion: 2 }],
      completion: {
        needsReview: true,
        revisionSkipped: false,
        checks: [
          { key: "objectiveAndContext", passed: true, detail: "The report answers the brief's objective, and each opportunity names the business context it uses." },
          { key: "threeOpportunities", passed: false, detail: "Only two opportunities could be supported by the available evidence. Additional research or user input is required." },
          { key: "claimsSourced", passed: true, detail: "Every claim points to sources in this workspace or says it is untested." },
        ],
      },
    },
  },
  {
    key: "completed",
    label: "Completed",
    run: {
      ...base,
      status: "completed",
      stopReason: "done",
      finishedAt: T0 + 64_000,
      cost: { ...base.cost, spentCents: 14 },
      steps: [...researchSteps, step(6, "asset.create")],
      artifacts: [
        { id: "a1", kind: "tool", byteSize: 18_204 },
        { id: "a2", kind: "model", byteSize: 4_310 },
      ],
      assets: [report],
    },
  },
  {
    key: "failed",
    label: "Failed (no profile)",
    run: {
      ...base,
      status: "failed",
      stopReason: "error",
      finishedAt: T0 + 2_000,
      cost: { ...base.cost, spentCents: 0 },
      steps: [step(0, "profile.read", { status: "failed", resultCode: "no_confirmed_profile" })],
    },
  },
  {
    key: "cap",
    label: "Stopped by the cost cap",
    run: {
      ...base,
      status: "stopped",
      stopReason: "cap",
      finishedAt: T0 + 120_000,
      cost: { ...base.cost, spentCents: 27, daySpentCents: 96 },
      steps: researchSteps,
      assets: [report],
    },
  },
  {
    key: "near-cap",
    label: "Close to the cap",
    run: { ...base, cost: { ...base.cost, spentCents: 21 }, steps: researchSteps },
  },
  {
    key: "paused",
    label: "Stopped by a pause",
    run: { ...base, status: "stopped", stopReason: "cancelled", finishedAt: T0 + 30_000, steps: researchSteps.slice(0, 3) },
  },
  {
    key: "halted",
    label: "Stopped by a person",
    run: { ...base, status: "stopped", stopReason: "halted", finishedAt: T0 + 45_000, steps: researchSteps.slice(0, 5) },
  },
  {
    key: "blocked-source",
    label: "A source was blocked",
    run: {
      ...base,
      status: "completed",
      stopReason: "done",
      finishedAt: T0 + 90_000,
      steps: [...researchSteps, step(6, "asset.create")],
      sources,
      assets: [report],
    },
  },
  {
    key: "zero",
    label: "No steps",
    run: { ...base, status: "stopped", stopReason: "cap", finishedAt: T0, cost: { ...base.cost, spentCents: 0, daySpentCents: 200 } },
  },
  {
    key: "long",
    label: "300 steps",
    run: {
      ...base,
      maxSteps: 200,
      steps: Array.from({ length: 300 }, (_, index) =>
        step(index, index % 7 === 6 ? null : index % 3 === 0 ? "web.search" : "web.fetch", index === 150 ? { status: "failed", resultCode: "tool_error" } : {}),
      ),
    },
  },
  {
    key: "long-label",
    label: "A very long name",
    skillName:
      "Ad research for the commercial and residential deep cleaning market across the greater Austin, Round Rock and San Marcos area",
    run: { ...base, startedByName: "Maximiliana Alejandra de la Cruz-Villanueva", steps: researchSteps.slice(0, 2) },
  },
  { key: "reconnecting", label: "Reconnecting", connected: false, run: { ...base, steps: researchSteps.slice(0, 3) } },
];
