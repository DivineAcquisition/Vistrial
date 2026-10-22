import { AGENT_ACCENT_KEYS, AGENT_GLYPHS, type AgentAccentKey, type AgentGlyph } from "@/lib/agents/roster";
import { waitingPhrase } from "@/lib/agents/contract";
import { TIER_LABEL, type Tier } from "@/lib/assay/vocabulary";
import type { WorkspaceRole } from "@/lib/auth/types";

/**
 * The shared agent summary: one request per workspace, read by the sidebar,
 * the status strip, the agent panel, the Home crew band, the Decisions count
 * and the badges. agent_summary() in Postgres gathers the facts under the
 * person's row-level security; buildAgentSummary() turns them into rows.
 * Every screen uses this one function, so state, lines and counts cannot
 * disagree.
 *
 * Count rules (the only definitions):
 * - Waiting on you: an open agent request the person can see (pending, or
 *   approved and waiting to be sent). agent_waiting_for() in Postgres.
 * - Needs attention: a run with no progress past STUCK_AFTER_MS on the
 *   Postgres copy's own timestamps, a run waiting on an outside service, or
 *   a run flagged stuck in the last day.
 * - Stopped: the latest run failed in the last day.
 */

export const STUCK_AFTER_MS = 10 * 60 * 1000;
const RECENT_MS = 24 * 60 * 60 * 1000;
/** The copy is behind when a change has waited this long. */
const BACKLOG_ATTENTION_SECONDS = 10;

export type WorkspaceAgentState =
  | "not_available"
  | "locked"
  | "available"
  | "needs_setup"
  | "pending"
  | "on"
  | "off";

export type SummaryPresence = "idle" | "working" | "waiting" | "attention" | "paused" | "stopped";

export const SUMMARY_PRESENCE_LABEL: Record<SummaryPresence, string> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting on you",
  attention: "Needs attention",
  paused: "Paused",
  stopped: "Stopped",
};

/** Most urgent first. An area header shows the most urgent state among its agents. */
const URGENCY: SummaryPresence[] = ["attention", "stopped", "waiting", "working", "paused", "idle"];

export type OutputLine = { id: string; text: string; at: string; href: string | null };

export type AgentSummaryRow = {
  id: string;
  name: string;
  sublabel: string;
  description: string;
  promise: string;
  glyph: AgentGlyph;
  accent: AgentAccentKey;
  area: string | null;
  sort: number;
  version: number;
  state: WorkspaceAgentState;
  /** Set when state is needs_setup: the single missing step. */
  setupStep: { label: string; href: string } | null;
  lockedReason: string | null;
  /** Null unless the agent is on. */
  presence: SummaryPresence | null;
  stateLabel: string;
  /** The one live line: the real step, the waiting count, or the last real action. */
  line: string;
  waiting: { approvals: number; questions: number; total: number };
  paused: { byName: string | null; at: string | null; byVistrial: boolean; reason: string | null } | null;
  currentRunId: string | null;
  outputs: OutputLine[];
  /** Shown in the sidebar (On, Needs setup, Pending confirmation). */
  inSidebar: boolean;
  /** Hidden from this person's own sidebar. It keeps running. */
  hidden: boolean;
  /** Who turned it on for the Owner to confirm. */
  requestedBy: string | null;
  /** What this workspace already asked for (notify_me, request_access, early_access). */
  interest: string[];
  availability: "available" | "beta" | "coming_soon";
};

export type AreaSummary = {
  id: string;
  name: string;
  workPage: { label: string; href: string } | null;
  homePage: string | null;
  availability: "available" | "coming_soon";
  description: string;
  interest: string[];
  /** Most urgent presence among its sidebar agents, or null when it has none. */
  urgent: SummaryPresence | null;
  waiting: number;
  agentIds: string[];
  inSidebar: boolean;
};

export type AgentSummary = {
  orgId: string;
  generatedAt: string;
  role: WorkspaceRole;
  /** The new sidebar is switched on for this workspace. */
  sidebar: boolean;
  /** The copy is behind: show the quiet Reconnecting note, never stale Working. */
  reconnecting: boolean;
  waitingTotal: number;
  areas: AreaSummary[];
  agents: AgentSummaryRow[];
};

// ---------------------------------------------------------------------------
// Raw shapes from agent_summary()
// ---------------------------------------------------------------------------

type RawRun = {
  id: string;
  status: string;
  step?: string | null;
  subject?: string | null;
  plainError?: string | null;
  finishedAt?: string | null;
  lastProgressAt?: string | null;
  createdAt?: string | null;
};

type RawOutput = {
  id: string;
  kind: string;
  title?: string | null;
  status?: string | null;
  state?: string | null;
  tier?: string | null;
  previousTier?: string | null;
  deadlineAt?: string | null;
  at: string;
  runId?: string | null;
  leadId?: string | null;
  leadName?: string | null;
};

export type RawAgent = {
  id: string;
  area: string | null;
  name: string;
  sublabel: string;
  description: string;
  glyph: string;
  accent: string;
  promise: string;
  availability: "available" | "beta" | "coming_soon";
  inCohort: boolean;
  planAllowed: boolean;
  lockedReason: string;
  prerequisites: string[];
  sort: number;
  startsOn: boolean;
  activitySource: "runs" | "scores";
  outputSource: "activity" | "requests" | "windows" | "tiers";
  version: number;
  stage: string | null;
  requestedByLabel?: string | null;
  requestedAt?: string | null;
  hidden?: boolean;
  interest?: string[];
  paused: boolean;
  pausedByName: string | null;
  pausedAt: string | null;
  pausedReason: string | null;
  halted: boolean;
  haltedAt: string | null;
  queue: { running: number; pending: number; oldestRunningAt: string | null } | null;
  facts: {
    waiting: { approvals: number; questions: number };
    openRun: RawRun | null;
    latestRun: RawRun | null;
    waitingRunsWithoutItem: number;
    doneToday: number;
    lastDoneAt: string | null;
    outputs: RawOutput[];
  } | null;
};

export type RawArea = {
  id: string;
  name: string;
  description: string;
  recordKind: string;
  workPage: { label: string; href: string; roles: string[] } | null;
  homePage: { href: string; roles: string[] } | null;
  availability: "available" | "coming_soon";
  sort: number;
  interest?: string[];
};

export type RawSummary = {
  orgId: string;
  generatedAt: string;
  access: WorkspaceRole;
  workspace: { status: string; agentsHalted: boolean; billingState: string | null };
  backlog: { pending: number; oldestSeconds: number };
  sidebar?: boolean;
  areas: RawArea[];
  agents: RawAgent[];
  waitingTotal: number;
};

/** What the workspace has in place, from agent_setup_facts(). */
export type SetupFacts = Record<string, boolean>;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const SETUP_STEPS: Record<string, { label: string; href: string }> = {
  crm_connected: { label: "Connect your CRM", href: "/app/settings/connections" },
  call_source: { label: "Connect where your calls are recorded", href: "/app/settings/connections" },
};

const CASE_ROLES: WorkspaceRole[] = ["owner", "operator", "service_team", "platform_admin"];

export function ago(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function within(iso: string | null | undefined, now: number, ms: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && now - at < ms;
}

/** Stored labels say "a lead"; show the name when this person can see it. */
function withName(text: string, name: string | null | undefined): string {
  if (!name) return text;
  return text.replace(/\ba lead\b/, name);
}

function tierWord(value: string | null | undefined): string {
  return value && value in TIER_LABEL ? TIER_LABEL[value as Tier] : "a new tier";
}

export function outputLine(raw: RawOutput, role: WorkspaceRole, now: number): OutputLine {
  const who = raw.leadName ?? null;
  let text: string;
  switch (raw.kind) {
    case "approval":
      text = raw.status === "approved"
        ? `${withName(raw.title ?? "A draft", who)}, approved and ready to send`
        : `${withName(raw.title ?? "A draft", who)}, waiting for approval`;
      break;
    case "question":
      text = `${withName(raw.title ?? "A question", who)}, waiting for an answer`;
      break;
    case "window": {
      const lead = who ?? "A lead";
      const minutes = raw.deadlineAt ? Math.round((Date.parse(raw.deadlineAt) - now) / 60_000) : null;
      if (raw.state === "missed" || (minutes !== null && minutes < 0)) text = `${lead} is past the reply window`;
      else if (minutes === null || minutes < 1) text = `${who ? `${who}'s` : "A lead's"} window ends now`;
      else text = `${who ? `${who}'s` : "A lead's"} window ends in ${minutes} minute${minutes === 1 ? "" : "s"}`;
      break;
    }
    case "tier":
      text = `${who ?? "A lead"} moved to ${tierWord(raw.tier)}`;
      break;
    default:
      text = withName(raw.title ?? "Finished a piece of work", who);
  }
  const canOpenLead = Boolean(raw.leadId) && CASE_ROLES.includes(role);
  const href = canOpenLead ? `/app/cases/${raw.leadId}` : raw.runId ? `/app/runs/${raw.runId}` : null;
  return { id: raw.id, text, at: raw.at, href };
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

const ON_STAGES = new Set(["on", "watch", "drafts_only"]);

export function workspaceState(agent: RawAgent, setup: SetupFacts): { state: WorkspaceAgentState; step: { label: string; href: string } | null } {
  if (agent.availability === "coming_soon" || agent.stage === "coming_soon" || !agent.inCohort) {
    return { state: "not_available", step: null };
  }
  if (!agent.planAllowed) return { state: "locked", step: null };
  if (agent.stage === "pending") return { state: "pending", step: null };
  if (agent.stage === "off_by_choice") return { state: "off", step: null };
  // No row means the agent runs (agent_may_run treats it the same way).
  const on = agent.stage === null || ON_STAGES.has(agent.stage);
  if (!on) return { state: "available", step: null };
  const missing = agent.prerequisites.find((key) => setup[key] === false);
  if (missing) return { state: "needs_setup", step: SETUP_STEPS[missing] ?? { label: "Finish setup", href: "/app/settings" } };
  return { state: "on", step: null };
}

type Presence = {
  presence: SummaryPresence;
  line: string;
  currentRunId: string | null;
};

function presenceFor(agent: RawAgent, raw: RawSummary, now: number, reconnecting: boolean): Presence {
  const facts = agent.facts;
  const waiting = facts?.waiting ?? { approvals: 0, questions: 0 };
  const total = waiting.approvals + waiting.questions;
  const status = raw.workspace.status;

  if (status !== "active" && status !== "onboarding") {
    return {
      presence: "paused",
      line: status === "closed" ? "This workspace is closed, so agents are not running." : "This workspace is paused, so agents are not running.",
      currentRunId: null,
    };
  }
  if (agent.halted || raw.workspace.agentsHalted) {
    return { presence: "paused", line: "Paused by the Vistrial team.", currentRunId: null };
  }
  if (agent.paused) {
    return { presence: "paused", line: agent.pausedByName ? `Paused by ${agent.pausedByName}.` : "Paused by a person.", currentRunId: null };
  }

  if (agent.activitySource === "scores") {
    const queue = agent.queue;
    if (queue && queue.running > 0) {
      if (queue.oldestRunningAt && !within(queue.oldestRunningAt, now, STUCK_AFTER_MS)) {
        return { presence: "attention", line: "Scoring has not moved for a while. The Vistrial team has been told.", currentRunId: null };
      }
      return { presence: "working", line: "Scoring leads", currentRunId: null };
    }
  } else {
    const open = facts?.openRun ?? null;
    if (open) {
      const progressed = open.lastProgressAt ?? open.createdAt;
      if (!within(progressed, now, STUCK_AFTER_MS)) {
        return { presence: "attention", line: "This stopped making progress. The Vistrial team has been told.", currentRunId: open.id };
      }
      if (open.status === "waiting_provider") {
        return { presence: "attention", line: "Waiting on an outside service. It will continue on its own.", currentRunId: open.id };
      }
      if (reconnecting) {
        return { presence: "attention", line: "Catching up. The latest steps are on their way.", currentRunId: open.id };
      }
      return { presence: "working", line: open.step ?? `Working on ${open.subject ?? "a piece of work"}`, currentRunId: open.id };
    }
  }

  if (total > 0) {
    return { presence: "waiting", line: waitingPhrase(agent.id, waiting) ?? "", currentRunId: null };
  }

  const latest = facts?.latestRun ?? null;
  if (latest && within(latest.finishedAt ?? latest.lastProgressAt, now, RECENT_MS)) {
    if (latest.status === "failed") {
      return {
        presence: "stopped",
        line: latest.plainError ?? `Stopped while working on ${latest.subject ?? "a piece of work"}. The Vistrial team will look at it.`,
        currentRunId: latest.id,
      };
    }
    if (latest.status === "stuck" || latest.status === "needs_person") {
      return { presence: "attention", line: latest.plainError ?? "Something looked unusual. The Vistrial team will look at it.", currentRunId: latest.id };
    }
  }

  if ((facts?.waitingRunsWithoutItem ?? 0) > 0) {
    return { presence: "idle", line: "Waiting on someone on your team.", currentRunId: null };
  }
  if (facts?.lastDoneAt) {
    const done = facts.doneToday;
    const noun = agent.activitySource === "scores" ? (done === 1 ? "score change" : "score changes") : "finished";
    const head = done > 0 ? `${done} ${noun} today` : "Last run";
    return { presence: "idle", line: `${head}, last ${ago(facts.lastDoneAt, now)}`, currentRunId: null };
  }
  return { presence: "idle", line: "Nothing to do right now.", currentRunId: null };
}

const SIDEBAR_STATES = new Set<WorkspaceAgentState>(["on", "needs_setup", "pending"]);

function asGlyph(value: string): AgentGlyph {
  return (AGENT_GLYPHS as readonly string[]).includes(value) ? (value as AgentGlyph) : "spark";
}

function asAccent(value: string): AgentAccentKey {
  return (AGENT_ACCENT_KEYS as readonly string[]).includes(value) ? (value as AgentAccentKey) : "neutral";
}

export function buildAgentSummary(raw: RawSummary, setup: SetupFacts, now: number = Date.now()): AgentSummary {
  const role = raw.access;
  const reconnecting = raw.backlog.pending > 0 && raw.backlog.oldestSeconds >= BACKLOG_ATTENTION_SECONDS;
  const agents: AgentSummaryRow[] = [...raw.agents]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((agent) => {
      const { state, step } = workspaceState(agent, setup);
      const live = state === "on" || state === "needs_setup";
      const presence = live && agent.facts ? presenceFor(agent, raw, now, reconnecting) : null;
      const waiting = agent.facts?.waiting ?? { approvals: 0, questions: 0 };
      const stateLabel =
        state === "needs_setup"
          ? "Needs setup"
          : state === "pending"
            ? role === "owner"
              ? "Waiting for your OK"
              : "Waiting for the Owner"
            : presence
              ? presence.presence === "paused" && (agent.halted || raw.workspace.agentsHalted)
                ? "Paused by the Vistrial team"
                : SUMMARY_PRESENCE_LABEL[presence.presence]
              : "Off";
      return {
        id: agent.id,
        name: agent.name,
        sublabel: agent.sublabel,
        description: agent.description,
        promise: agent.promise,
        glyph: asGlyph(agent.glyph),
        accent: asAccent(agent.accent),
        area: agent.area,
        sort: agent.sort,
        version: agent.version,
        state,
        setupStep: step,
        lockedReason: state === "locked" ? agent.lockedReason : null,
        presence: presence?.presence ?? null,
        stateLabel,
        line:
          state === "needs_setup" && step
            ? step.label
            : state === "pending"
              ? role === "owner"
                ? "Turned on by the Vistrial team. It starts once you confirm."
                : "Waiting for the Owner to confirm."
              : presence?.line ?? agent.description,
        waiting: live ? { ...waiting, total: waiting.approvals + waiting.questions } : { approvals: 0, questions: 0, total: 0 },
        paused:
          agent.halted || raw.workspace.agentsHalted
            ? { byName: null, at: agent.haltedAt, byVistrial: true, reason: null }
            : agent.paused
              ? { byName: agent.pausedByName, at: agent.pausedAt, byVistrial: false, reason: agent.pausedReason }
              : null,
        currentRunId: presence?.currentRunId ?? null,
        outputs: live ? (agent.facts?.outputs ?? []).slice(0, 5).map((output) => outputLine(output, role, now)) : [],
        inSidebar: SIDEBAR_STATES.has(state),
        hidden: agent.hidden === true,
        requestedBy: state === "pending" ? agent.requestedByLabel ?? "The Vistrial team" : null,
        interest: agent.interest ?? [],
        availability: agent.availability,
      };
    });

  const areas: AreaSummary[] = [...raw.areas]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((area) => {
      const members = agents.filter((agent) => agent.area === area.id && agent.inSidebar && !agent.hidden);
      const urgent = URGENCY.find((state) => members.some((agent) => agent.presence === state)) ?? null;
      return {
        id: area.id,
        name: area.name,
        workPage: area.workPage && area.workPage.roles.includes(role) ? { label: area.workPage.label, href: area.workPage.href } : null,
        homePage: area.homePage && area.homePage.roles.includes(role) ? area.homePage.href : null,
        availability: area.availability,
        description: area.description,
        interest: area.interest ?? [],
        urgent,
        waiting: members.reduce((sum, agent) => sum + agent.waiting.total, 0),
        agentIds: members.map((agent) => agent.id),
        inSidebar: members.length > 0,
      };
    });

  return {
    orgId: raw.orgId,
    generatedAt: raw.generatedAt,
    role,
    sidebar: raw.sidebar === true,
    reconnecting,
    waitingTotal: raw.waitingTotal,
    areas,
    agents,
  };
}

/** "Relay, waiting on you, 3 drafts waiting". Read by screen readers. */
export function rowLabel(row: AgentSummaryRow): string {
  const parts = [row.name, row.stateLabel.toLowerCase()];
  if (row.waiting.total > 0) parts.push(waitingPhrase(row.id, row.waiting) ?? "");
  return parts.filter(Boolean).join(", ");
}
