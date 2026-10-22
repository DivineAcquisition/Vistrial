import { registrySeed } from "@/lib/agents/roster";
import { buildAgentSummary, type AgentSummary, type RawAgent, type RawSummary } from "@/lib/agents/summary";
import type { WorkspaceRole } from "@/lib/auth/types";

/**
 * Sample summaries for the layout reference: every presence state and every
 * workspace agent state, made from the seeded registry. No real workspace,
 * lead or person. Names are invented.
 */

const NOW = Date.parse("2026-10-22T15:00:00.000Z");
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const FACTS = { waiting: { approvals: 0, questions: 0 }, openRun: null, latestRun: null, waitingRunsWithoutItem: 0, doneToday: 0, lastDoneAt: null, outputs: [] };

function agent(id: string, patch: Partial<RawAgent>): RawAgent {
  const seed = registrySeed().agents.find((row) => row.id === id)!;
  return {
    id,
    area: seed.area_id as string | null,
    name: seed.name as string,
    sublabel: seed.sublabel as string,
    description: seed.description as string,
    glyph: seed.glyph as string,
    accent: seed.accent as string,
    promise: seed.promise as string,
    availability: "available",
    inCohort: true,
    planAllowed: true,
    lockedReason: seed.locked_reason as string,
    prerequisites: [],
    sort: seed.sort as number,
    startsOn: seed.starts_on as boolean,
    activitySource: seed.activity_source as "runs" | "scores",
    outputSource: seed.output_source as RawAgent["outputSource"],
    version: 1,
    stage: "on",
    paused: false,
    pausedByName: null,
    pausedAt: null,
    pausedReason: null,
    halted: false,
    haltedAt: null,
    queue: null,
    facts: { ...FACTS },
    ...patch,
  };
}

function raw(agents: RawAgent[], role: WorkspaceRole, waitingTotal: number): RawSummary {
  return {
    orgId: "sample",
    generatedAt: new Date(NOW).toISOString(),
    access: role,
    workspace: { status: "active", agentsHalted: false, billingState: "active" },
    backlog: { pending: 0, oldestSeconds: 0 },
    sidebar: true,
    areas: registrySeed().areas.map((area) => ({
      id: area.id as string,
      name: area.name as string,
      description: area.description as string,
      recordKind: area.record_kind as string,
      workPage: area.work_page as RawSummary["areas"][number]["workPage"],
      homePage: area.home_page as RawSummary["areas"][number]["homePage"],
      availability: area.availability as "available" | "coming_soon",
      sort: area.sort as number,
    })),
    agents,
    waitingTotal,
  };
}

export const SIDEBAR_SAMPLE_STATES = [
  { id: "busy", label: "Working and waiting" },
  { id: "trouble", label: "Needs attention and stopped" },
  { id: "paused", label: "Paused by a person and by Vistrial" },
  { id: "setup", label: "Needs setup and waiting for an OK" },
  { id: "quiet", label: "All idle" },
] as const;

export type SidebarSampleState = (typeof SIDEBAR_SAMPLE_STATES)[number]["id"];

export function isSidebarSampleState(value: unknown): value is SidebarSampleState {
  return SIDEBAR_SAMPLE_STATES.some((item) => item.id === value);
}

export function sidebarSample(state: SidebarSampleState, role: WorkspaceRole, orgId: string): AgentSummary {
  const lead = (name: string, id: string) => ({ leadId: id, leadName: name });
  const sets: Record<SidebarSampleState, RawAgent[]> = {
    busy: [
      agent("compass", { facts: { ...FACTS, doneToday: 4, lastDoneAt: at(6) } }),
      agent("sentry", {
        facts: { ...FACTS, outputs: [{ id: "w1", kind: "window", state: "at_risk", deadlineAt: new Date(NOW + 12 * 60_000).toISOString(), at: at(1), ...lead("Alex Kim", "l1") }] },
      }),
      agent("scribe", {
        facts: {
          ...FACTS,
          openRun: { id: "r1", status: "working", step: "Reading the call from 2:14 PM", subject: "the call", lastProgressAt: at(1), createdAt: at(2) },
          outputs: [{ id: "o1", kind: "file", title: "Case file built for a lead", at: at(19), runId: "r0", ...lead("Maria Lopez", "l2") }],
        },
      }),
      agent("relay", {
        facts: {
          ...FACTS,
          waiting: { approvals: 3, questions: 0 },
          outputs: [{ id: "a1", kind: "approval", title: "Follow-up for a lead", status: "pending", at: at(4), ...lead("Jordan Reyes", "l3") }],
        },
      }),
      agent("assay", { facts: { ...FACTS, doneToday: 14, lastDoneAt: at(3), outputs: [{ id: "t1", kind: "tier", tier: "warm", previousTier: "cool", at: at(3), ...lead("Dana Brooks", "l4") }] } }),
    ],
    trouble: [
      agent("compass", {}),
      agent("sentry", {}),
      agent("scribe", { facts: { ...FACTS, openRun: { id: "r2", status: "working", step: "Reading", subject: "the call", lastProgressAt: at(25), createdAt: at(30) } } }),
      agent("relay", { facts: { ...FACTS, latestRun: { id: "r3", status: "failed", plainError: "Relay could not reach your CRM. The Vistrial team will look at it.", finishedAt: at(40) } } }),
      agent("assay", {}),
    ],
    paused: [
      agent("compass", {}),
      agent("sentry", { halted: true, haltedAt: at(30) }),
      agent("scribe", {}),
      agent("relay", { paused: true, pausedByName: "Sam Rivera", pausedAt: at(15) }),
      agent("assay", {}),
    ],
    setup: [
      agent("compass", {}),
      agent("sentry", { prerequisites: ["crm_connected"] }),
      agent("scribe", {}),
      agent("relay", { stage: "pending", requestedByLabel: "Sam, Vistrial Service Team" }),
      agent("assay", { planAllowed: false }),
    ],
    quiet: ["compass", "sentry", "scribe", "relay", "assay"].map((id) => agent(id, { facts: { ...FACTS, doneToday: 0, lastDoneAt: at(90) } })),
  };
  const agents = sets[state];
  const total = agents.reduce((sum, row) => sum + (row.facts?.waiting.approvals ?? 0) + (row.facts?.waiting.questions ?? 0), 0);
  const summary = buildAgentSummary(raw(agents, role, total), { crm_connected: state !== "setup", call_source: true }, NOW);
  return { ...summary, orgId };
}
