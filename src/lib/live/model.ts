import { AGENTS, LIVE_AGENT_IDS, isLiveAgentId, type LiveAgentId } from "@/lib/agents/roster";

/**
 * The shared record of agent work, as the screens see it. Pure and
 * client-safe: mapping, presence, grouping, and plain-language copy.
 */

export type RunStatus =
  | "queued"
  | "working"
  | "waiting_person"
  | "waiting_provider"
  | "paused"
  | "completed"
  | "needs_person"
  | "failed"
  | "stopped"
  | "expired"
  | "stuck";

export const OPEN_RUN_STATUSES: RunStatus[] = ["queued", "working", "waiting_person", "waiting_provider", "paused"];
export const FINISHED_RUN_STATUSES: RunStatus[] = ["completed", "needs_person", "failed", "stopped", "expired", "stuck"];

export type SourceKind = "transcript" | "case_file" | "configuration" | "lead" | "note" | "call" | "record" | "file";

export type SourceRef = { kind: SourceKind; label: string; href?: string | null };

export type NeedsPerson = {
  kind: "approval" | "question";
  prompt: string;
  approvalItemId?: string | null;
  whoCanAct: string;
};

export type LiveRun = {
  id: string;
  orgId: string;
  agentId: LiveAgentId;
  leadId: string | null;
  actorMemberId: string | null;
  subjectLabel: string;
  subjectHref: string | null;
  status: RunStatus;
  currentStepLabel: string | null;
  plan: string[];
  reasonSummary: string | null;
  plainError: string | null;
  needsPerson: NeedsPerson | null;
  sources: SourceRef[];
  configVersion: string | null;
  batchId: string | null;
  simulated: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastProgressAt: string;
};

export type StepStatus = "pending" | "working" | "done" | "failed" | "skipped" | "waiting" | "paused";

export type LiveStep = {
  id: string;
  runId: string;
  seq: number;
  label: string;
  status: StepStatus;
  detail: string | null;
  reason: string | null;
  sources: SourceRef[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type EventKind =
  | "run_started"
  | "step_started"
  | "step_finished"
  | "output"
  | "input_needed"
  | "approval_requested"
  | "approval_given"
  | "approval_rejected"
  | "error"
  | "run_finished"
  | "paused"
  | "resumed"
  | "stuck"
  | "waiting_provider";

export type LiveEvent = {
  id: string;
  runId: string;
  agentId: LiveAgentId;
  leadId: string | null;
  kind: EventKind;
  label: string;
  occurredAt: string;
};

export type OutputKind = "summary" | "score" | "draft" | "alert" | "file" | "change" | "answer" | "note";

export type LiveOutput = {
  id: string;
  runId: string;
  agentId: LiveAgentId;
  leadId: string | null;
  kind: OutputKind;
  title: string;
  body: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type AgentControl = {
  agentId: LiveAgentId;
  paused: boolean;
  changedAt: string;
  changedByName: string | null;
  reason: string | null;
};

export type WaitingItem = {
  id: string;
  agentId: LiveAgentId | null;
  runId: string | null;
  kind: "approval" | "question";
  title: string;
  reason: string | null;
  preview: string | null;
  leadIds: string[];
  status: string;
  createdAt: string;
};

export type StaffRunDetail = {
  detail: Record<string, unknown>;
  errorDetail: string | null;
};

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function arr<T>(value: unknown, pick: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(pick).filter((item): item is T => item !== null);
}

function source(value: unknown): SourceRef | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Row;
  const label = str(item.label);
  const kind = str(item.kind) as SourceKind | null;
  if (!label || !kind) return null;
  return { kind, label, href: str(item.href) };
}

function needs(value: unknown): NeedsPerson | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Row;
  const prompt = str(item.prompt);
  if (!prompt) return null;
  return {
    kind: item.kind === "question" ? "question" : "approval",
    prompt,
    approvalItemId: str(item.approvalItemId) ?? str(item.approval_item_id),
    whoCanAct: str(item.whoCanAct) ?? str(item.who_can_act) ?? "An owner or the Vistrial team",
  };
}

export function mapRun(row: Row): LiveRun | null {
  const agentId = row.agent_id;
  if (!isLiveAgentId(agentId)) return null;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    agentId,
    leadId: str(row.lead_id),
    actorMemberId: str(row.actor_member_id),
    subjectLabel: String(row.subject_label ?? ""),
    subjectHref: str(row.subject_href),
    status: (str(row.status) ?? "queued") as RunStatus,
    currentStepLabel: str(row.current_step_label),
    plan: arr(row.plan, (item) => (typeof item === "string" ? item : null)),
    reasonSummary: str(row.reason_summary),
    plainError: str(row.plain_error),
    needsPerson: needs(row.needs_person),
    sources: arr(row.sources, source),
    configVersion: str(row.config_version),
    batchId: str(row.batch_id),
    simulated: row.simulated === true,
    createdAt: String(row.created_at),
    startedAt: str(row.started_at),
    finishedAt: str(row.finished_at),
    lastProgressAt: String(row.last_progress_at ?? row.created_at),
  };
}

export function mapStep(row: Row): LiveStep {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    seq: Number(row.seq ?? 0),
    label: String(row.label ?? ""),
    status: (str(row.status) ?? "working") as StepStatus,
    detail: str(row.detail),
    reason: str(row.reason),
    sources: arr(row.sources, source),
    startedAt: String(row.started_at),
    finishedAt: str(row.finished_at),
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
  };
}

export function mapEvent(row: Row): LiveEvent | null {
  if (!isLiveAgentId(row.agent_id)) return null;
  return {
    id: String(row.id),
    runId: String(row.run_id),
    agentId: row.agent_id,
    leadId: str(row.lead_id),
    kind: String(row.kind) as EventKind,
    label: String(row.label ?? ""),
    occurredAt: String(row.occurred_at),
  };
}

export function mapOutput(row: Row): LiveOutput | null {
  if (!isLiveAgentId(row.agent_id)) return null;
  return {
    id: String(row.id),
    runId: String(row.run_id),
    agentId: row.agent_id,
    leadId: str(row.lead_id),
    kind: String(row.kind) as OutputKind,
    title: String(row.title ?? ""),
    body: str(row.body),
    before: row.before_value ?? null,
    after: row.after_value ?? null,
    createdAt: String(row.created_at),
  };
}

export function mapControl(row: Row): AgentControl | null {
  if (!isLiveAgentId(row.agent_id)) return null;
  return {
    agentId: row.agent_id,
    paused: row.paused === true,
    changedAt: String(row.changed_at),
    changedByName: str(row.changed_by_name),
    reason: str(row.reason),
  };
}

export function mapWaiting(row: Row): WaitingItem {
  const agentId = isLiveAgentId(row.agent_id) ? row.agent_id : null;
  return {
    id: String(row.id),
    agentId,
    runId: str(row.run_id),
    kind: row.action_type === "agent_question" ? "question" : "approval",
    title: String(row.title ?? ""),
    reason: str(row.reason),
    preview: str(row.preview),
    leadIds: Array.isArray(row.lead_ids) ? (row.lead_ids as string[]) : [],
    status: String(row.status ?? "pending"),
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export type PresenceState = "idle" | "working" | "waiting" | "attention" | "paused" | "stopped";

export type AgentPresence = {
  agentId: LiveAgentId;
  state: PresenceState;
  /** Always present; states are never shown by color alone. */
  stateLabel: string;
  /** "Scribe is reading the call from 2:14 PM" when working. */
  liveLabel: string | null;
  waitingCount: number;
  currentRunId: string | null;
  /** One line about the current or latest run. */
  runSummary: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
};

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting on you",
  attention: "Needs attention",
  paused: "Paused",
  stopped: "Stopped",
};

export type WorkspaceRunState = "active" | "paused" | "closed";

function lowerFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function liveStepLabel(agentId: LiveAgentId, step: string | null): string {
  const name = AGENTS[agentId].name;
  return step ? `${name} is ${lowerFirst(step)}` : `${name} is starting`;
}

const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function derivePresence(input: {
  agentId: LiveAgentId;
  runs: LiveRun[];
  control: AgentControl | null;
  waiting: WaitingItem[];
  workspace: WorkspaceRunState;
  now?: number;
}): AgentPresence {
  const now = input.now ?? Date.now();
  const mine = input.runs
    .filter((run) => run.agentId === input.agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waitingRuns = mine.filter((run) => run.status === "waiting_person");
  const waitingItems = input.waiting.filter(
    (item) => item.agentId === input.agentId && item.status === "pending"
  );
  const runIdsWithItem = new Set(waitingItems.map((item) => item.runId).filter(Boolean));
  const waitingCount = waitingItems.length + waitingRuns.filter((run) => !runIdsWithItem.has(run.id)).length;
  const working = mine.find((run) => run.status === "working" || run.status === "queued");
  const latest = mine[0] ?? null;
  const base = {
    agentId: input.agentId,
    waitingCount,
    pausedBy: null as string | null,
    pausedAt: null as string | null,
  };

  if (input.workspace !== "active") {
    const closed = input.workspace === "closed";
    return {
      ...base,
      state: "paused",
      stateLabel: PRESENCE_LABEL.paused,
      liveLabel: null,
      currentRunId: null,
      runSummary: closed ? "This workspace is closed, so agents are not running." : "This workspace is paused, so agents are not running.",
    };
  }

  if (input.control?.paused) {
    return {
      ...base,
      state: "paused",
      stateLabel: PRESENCE_LABEL.paused,
      liveLabel: null,
      currentRunId: null,
      runSummary: input.control.changedByName
        ? `Paused by ${input.control.changedByName}.`
        : "Paused by a person.",
      pausedBy: input.control.changedByName,
      pausedAt: input.control.changedAt,
    };
  }

  if (working) {
    return {
      ...base,
      state: "working",
      stateLabel: PRESENCE_LABEL.working,
      liveLabel: liveStepLabel(input.agentId, working.currentStepLabel),
      currentRunId: working.id,
      runSummary: `Working on ${working.subjectLabel}.`,
    };
  }

  if (waitingCount > 0) {
    return {
      ...base,
      state: "waiting",
      stateLabel: PRESENCE_LABEL.waiting,
      liveLabel: null,
      currentRunId: waitingRuns[0]?.id ?? null,
      runSummary: waitingCount === 1 ? "One item needs you." : `${waitingCount} items need you.`,
    };
  }

  const recent = latest && now - Date.parse(latest.finishedAt ?? latest.lastProgressAt) < ATTENTION_WINDOW_MS;
  if (latest && recent && latest.status === "failed") {
    return {
      ...base,
      state: "stopped",
      stateLabel: PRESENCE_LABEL.stopped,
      liveLabel: null,
      currentRunId: latest.id,
      runSummary: latest.plainError ?? `Stopped while working on ${latest.subjectLabel}.`,
    };
  }
  if (latest && recent && (latest.status === "stuck" || latest.status === "waiting_provider" || latest.status === "needs_person")) {
    return {
      ...base,
      state: "attention",
      stateLabel: PRESENCE_LABEL.attention,
      liveLabel: null,
      currentRunId: latest.id,
      runSummary:
        latest.status === "waiting_provider"
          ? "Waiting on an outside service. It will continue on its own."
          : latest.plainError ?? `Something looked unusual on ${latest.subjectLabel}.`,
    };
  }

  return {
    ...base,
    state: "idle",
    stateLabel: PRESENCE_LABEL.idle,
    liveLabel: null,
    currentRunId: null,
    runSummary: latest ? `Last: ${runOneLine(latest)}` : "Nothing to do right now.",
  };
}

export function deriveAllPresence(input: {
  runs: LiveRun[];
  controls: AgentControl[];
  waiting: WaitingItem[];
  workspace: WorkspaceRunState;
  now?: number;
}): AgentPresence[] {
  return LIVE_AGENT_IDS.map((agentId) =>
    derivePresence({
      agentId,
      runs: input.runs,
      control: input.controls.find((control) => control.agentId === agentId) ?? null,
      waiting: input.waiting,
      workspace: input.workspace,
      now: input.now,
    })
  ).sort((a, b) => AGENTS[a.agentId].order - AGENTS[b.agentId].order);
}

// ---------------------------------------------------------------------------
// Plain language
// ---------------------------------------------------------------------------

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Starting",
  working: "Working",
  waiting_person: "Waiting on you",
  waiting_provider: "Waiting on an outside service",
  paused: "Paused",
  completed: "Done",
  needs_person: "Needs a person",
  failed: "Stopped by an error",
  stopped: "Stopped by a person",
  expired: "Expired",
  stuck: "Stopped making progress",
};

export type StatusTone = "brand" | "neutral" | "good" | "warning" | "critical";

export const RUN_STATUS_TONE: Record<RunStatus, StatusTone> = {
  queued: "brand",
  working: "brand",
  waiting_person: "warning",
  waiting_provider: "warning",
  paused: "neutral",
  completed: "good",
  needs_person: "warning",
  failed: "critical",
  stopped: "neutral",
  expired: "neutral",
  stuck: "critical",
};

export const PRESENCE_TONE: Record<PresenceState, StatusTone> = {
  idle: "neutral",
  working: "brand",
  waiting: "warning",
  attention: "warning",
  paused: "neutral",
  stopped: "critical",
};

export function runOneLine(run: LiveRun): string {
  const name = AGENTS[run.agentId].name;
  switch (run.status) {
    case "working":
    case "queued":
      return liveStepLabel(run.agentId, run.currentStepLabel);
    case "completed":
      return run.reasonSummary ? `${name}: ${run.reasonSummary}` : `${name} finished ${run.subjectLabel}.`;
    case "waiting_person":
      return `${name} is waiting on you for ${run.subjectLabel}.`;
    case "waiting_provider":
      return `${name} is waiting on an outside service for ${run.subjectLabel}.`;
    case "failed":
      return run.plainError ?? `${name} could not finish ${run.subjectLabel}.`;
    case "stuck":
      return `${name} stopped making progress on ${run.subjectLabel}.`;
    case "paused":
      return `${name} is paused on ${run.subjectLabel}.`;
    case "needs_person":
      return `${name} needs a person to look at ${run.subjectLabel}.`;
    case "stopped":
      return `${name} was stopped on ${run.subjectLabel}.`;
    case "expired":
      return `${name}'s request for ${run.subjectLabel} expired.`;
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return "under a second";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export type FeedGroup = { id: "now" | "today" | "yesterday" | "earlier"; label: string; events: LiveEvent[] };

/** Group by "Now", "Earlier today", "Yesterday", "Earlier" in the viewer's timezone. */
export function groupFeed(events: LiveEvent[], now: Date = new Date()): FeedGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const nowCut = now.getTime() - 15 * 60 * 1000;
  const groups: FeedGroup[] = [
    { id: "now", label: "Now", events: [] },
    { id: "today", label: "Earlier today", events: [] },
    { id: "yesterday", label: "Yesterday", events: [] },
    { id: "earlier", label: "Earlier", events: [] },
  ];
  for (const event of [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
    const at = Date.parse(event.occurredAt);
    if (at >= nowCut) groups[0].events.push(event);
    else if (at >= startOfToday.getTime()) groups[1].events.push(event);
    else if (at >= startOfYesterday.getTime()) groups[2].events.push(event);
    else groups[3].events.push(event);
  }
  return groups.filter((group) => group.events.length > 0);
}

/**
 * Collapse rapid events from one run into its latest line, so a burst does not
 * flood the feed. Keeps run-level milestones (start, finish, errors, requests).
 */
export function collapseBurst(events: LiveEvent[], cap = 60): LiveEvent[] {
  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const seenStepLine = new Set<string>();
  const out: LiveEvent[] = [];
  for (const event of sorted) {
    if (event.kind === "step_started" || event.kind === "step_finished") {
      if (seenStepLine.has(event.runId)) continue;
      seenStepLine.add(event.runId);
    }
    out.push(event);
    if (out.length >= cap) break;
  }
  return out;
}

export function presenceForWorkspaceStatus(status: string | null | undefined): WorkspaceRunState {
  if (status === "closed") return "closed";
  if (status === "paused") return "paused";
  return "active";
}
