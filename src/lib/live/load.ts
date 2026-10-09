import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isLiveAgentId, type LiveAgentId } from "@/lib/agents/roster";
import {
  mapControl,
  mapEvent,
  mapOutput,
  mapRun,
  mapStep,
  mapWaiting,
  OPEN_REQUEST_STATUSES,
  OPEN_RUN_STATUSES,
  type AgentControl,
  type LiveEvent,
  type LiveOutput,
  type LiveRun,
  type LiveStep,
  type StaffRunDetail,
  type WaitingItem,
} from "@/lib/live/model";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the live experience. Always through the signed-in person's RLS
 * client, so every loader returns only what agent_activity_visible() allows.
 */

type Untyped = SupabaseClient;

async function rls(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped;
}

const RUN_COLUMNS =
  "id, org_id, agent_id, lead_id, actor_member_id, subject_label, subject_href, status, current_step_label, plan, reason_summary, plain_error, needs_person, sources, config_version, batch_id, simulated, created_at, started_at, finished_at, last_progress_at";

export type LiveSnapshot = {
  orgId: string;
  runs: LiveRun[];
  events: LiveEvent[];
  controls: AgentControl[];
  waiting: WaitingItem[];
  loadedAt: string;
};

function runs(rows: unknown[] | null): LiveRun[] {
  return (rows ?? []).map((row) => mapRun(row as Record<string, unknown>)).filter((run): run is LiveRun => run !== null);
}

function events(rows: unknown[] | null): LiveEvent[] {
  return (rows ?? []).map((row) => mapEvent(row as Record<string, unknown>)).filter((event): event is LiveEvent => event !== null);
}

/** Current state for the strip, panel, and Home, from saved data. */
export async function loadLiveSnapshot(orgId: string, options: { eventLimit?: number } = {}): Promise<LiveSnapshot> {
  const db = await rls();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const [openRuns, recentRuns, recentEvents, controls, waiting] = await Promise.all([
    db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).in("status", OPEN_RUN_STATUSES).order("created_at", { ascending: false }).limit(50),
    db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).gte("created_at", since).order("created_at", { ascending: false }).limit(60),
    db.from("agent_activity_events").select("id, run_id, agent_id, lead_id, kind, label, occurred_at").eq("org_id", orgId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(options.eventLimit ?? 120),
    db.from("agent_presence_controls").select("agent_id, paused, changed_at, changed_by_name, reason").eq("org_id", orgId),
    db.from("approval_items").select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at").eq("org_id", orgId).in("status", [...OPEN_REQUEST_STATUSES]).not("agent_id", "is", null).order("created_at", { ascending: false }).limit(40),
  ]);
  const byId = new Map<string, LiveRun>();
  for (const run of [...runs(recentRuns.data), ...runs(openRuns.data)]) byId.set(run.id, run);
  return {
    orgId,
    runs: [...byId.values()],
    events: events(recentEvents.data),
    controls: (controls.data ?? []).map((row) => mapControl(row as Record<string, unknown>)).filter((c): c is AgentControl => c !== null),
    waiting: (waiting.data ?? []).map((row) => mapWaiting(row as Record<string, unknown>)),
    loadedAt: new Date().toISOString(),
  };
}

/** Everything changed since a moment, to fill a gap after a dropped connection. */
export async function loadLiveSince(orgId: string, sinceIso: string): Promise<LiveSnapshot> {
  const db = await rls();
  const [changedRuns, newEvents, controls, waiting] = await Promise.all([
    db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(100),
    db.from("agent_activity_events").select("id, run_id, agent_id, lead_id, kind, label, occurred_at").eq("org_id", orgId).gte("occurred_at", sinceIso).order("occurred_at", { ascending: false }).limit(200),
    db.from("agent_presence_controls").select("agent_id, paused, changed_at, changed_by_name, reason").eq("org_id", orgId),
    db.from("approval_items").select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at").eq("org_id", orgId).in("status", [...OPEN_REQUEST_STATUSES]).not("agent_id", "is", null).limit(40),
  ]);
  return {
    orgId,
    runs: runs(changedRuns.data),
    events: events(newEvents.data),
    controls: (controls.data ?? []).map((row) => mapControl(row as Record<string, unknown>)).filter((c): c is AgentControl => c !== null),
    waiting: (waiting.data ?? []).map((row) => mapWaiting(row as Record<string, unknown>)),
    loadedAt: new Date().toISOString(),
  };
}

export type RunDetail = {
  run: LiveRun;
  steps: LiveStep[];
  events: LiveEvent[];
  outputs: LiveOutput[];
  waiting: WaitingItem | null;
  /** Null for customers: RLS returns nothing. */
  staff: StaffRunDetail | null;
  leadName: string | null;
};

export async function loadRunDetail(runId: string): Promise<RunDetail | null> {
  const db = await rls();
  const { data: row } = await db.from("agent_activity_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  const run = row ? mapRun(row as Record<string, unknown>) : null;
  if (!run) return null;
  const [steps, evs, outs, staff, waiting, lead] = await Promise.all([
    db.from("agent_activity_steps").select("id, run_id, seq, label, status, detail, reason, sources, started_at, finished_at, duration_ms").eq("run_id", runId).order("seq").limit(500),
    db.from("agent_activity_events").select("id, run_id, agent_id, lead_id, kind, label, occurred_at").eq("run_id", runId).order("occurred_at").limit(500),
    db.from("agent_activity_outputs").select("id, run_id, agent_id, lead_id, kind, title, body, before_value, after_value, created_at").eq("run_id", runId).order("created_at").limit(100),
    db.from("agent_activity_staff").select("detail, error_detail").eq("run_id", runId).maybeSingle(),
    db.from("approval_items").select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at").eq("run_id", runId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    run.leadId
      ? db.from("leads").select("first_name, last_name").eq("id", run.leadId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const leadRow = lead.data as { first_name?: string | null; last_name?: string | null } | null;
  return {
    run,
    steps: (steps.data ?? []).map((item) => mapStep(item as Record<string, unknown>)),
    events: events(evs.data),
    outputs: (outs.data ?? []).map((item) => mapOutput(item as Record<string, unknown>)).filter((o): o is LiveOutput => o !== null),
    waiting: waiting.data ? mapWaiting(waiting.data as Record<string, unknown>) : null,
    staff: staff.data
      ? { detail: ((staff.data as { detail?: Record<string, unknown> }).detail ?? {}), errorDetail: (staff.data as { error_detail?: string | null }).error_detail ?? null }
      : null,
    leadName: leadRow ? [leadRow.first_name, leadRow.last_name].filter(Boolean).join(" ") || null : null,
  };
}

/** The latest run per agent on one lead, plus pending requests for it. */
export async function loadLeadPipeline(orgId: string, leadId: string): Promise<{ runs: LiveRun[]; waiting: WaitingItem[] }> {
  const db = await rls();
  const [leadRuns, waiting] = await Promise.all([
    db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).eq("lead_id", leadId).order("created_at", { ascending: false }).limit(40),
    db.from("approval_items").select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at").eq("org_id", orgId).contains("lead_ids", [leadId]).order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    runs: runs(leadRuns.data),
    waiting: (waiting.data ?? []).map((row) => mapWaiting(row as Record<string, unknown>)),
  };
}

export type AgentHistoryFilter = {
  result?: string | null;
  leadId?: string | null;
  from?: string | null;
  to?: string | null;
};

export type AgentStats = {
  runsToday: number;
  averageMs: number | null;
  needsPersonPercent: number | null;
  failedToday: number;
};

export async function loadAgentPage(
  orgId: string,
  agentId: LiveAgentId,
  filter: AgentHistoryFilter
): Promise<{ current: LiveRun[]; history: LiveRun[]; stats: AgentStats; control: AgentControl | null }> {
  const db = await rls();
  let history = db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).eq("agent_id", agentId);
  if (filter.result) history = history.eq("status", filter.result);
  if (filter.leadId) history = history.eq("lead_id", filter.leadId);
  if (filter.from) history = history.gte("created_at", filter.from);
  if (filter.to) history = history.lte("created_at", filter.to);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [current, past, week, control] = await Promise.all([
    db.from("agent_activity_runs").select(RUN_COLUMNS).eq("org_id", orgId).eq("agent_id", agentId).in("status", OPEN_RUN_STATUSES).order("created_at", { ascending: false }).limit(20),
    history.order("created_at", { ascending: false }).limit(100),
    db.from("agent_activity_runs").select("status, started_at, finished_at, created_at").eq("org_id", orgId).eq("agent_id", agentId).gte("created_at", weekAgo).limit(2000),
    db.from("agent_presence_controls").select("agent_id, paused, changed_at, changed_by_name, reason").eq("org_id", orgId).eq("agent_id", agentId).maybeSingle(),
  ]);
  const weekRows = (week.data ?? []) as Array<{ status: string; started_at: string | null; finished_at: string | null; created_at: string }>;
  const today = weekRows.filter((row) => Date.parse(row.created_at) >= startOfDay.getTime());
  const durations = weekRows
    .filter((row) => row.started_at && row.finished_at && row.status === "completed")
    .map((row) => Date.parse(row.finished_at!) - Date.parse(row.started_at!))
    .filter((ms) => ms >= 0);
  const finished = weekRows.filter((row) => !OPEN_RUN_STATUSES.includes(row.status as never));
  return {
    current: runs(current.data),
    history: runs(past.data),
    stats: {
      runsToday: today.length,
      averageMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      needsPersonPercent: finished.length
        ? Math.round((finished.filter((row) => row.status === "needs_person" || row.status === "waiting_person").length / finished.length) * 100)
        : null,
      failedToday: today.filter((row) => row.status === "failed" || row.status === "stuck").length,
    },
    control: control.data ? mapControl(control.data as Record<string, unknown>) : null,
  };
}

export type AwaySummary = {
  since: string;
  lines: Array<{ agentId: LiveAgentId; text: string; href: string }>;
};

/** What each agent did since the person last visited. */
export async function loadAwaySummary(orgId: string, sinceIso: string): Promise<AwaySummary> {
  const db = await rls();
  const { data } = await db
    .from("agent_activity_runs")
    .select("agent_id, status")
    .eq("org_id", orgId)
    .gte("created_at", sinceIso)
    .limit(5000);
  const counts = new Map<string, Record<string, number>>();
  for (const row of (data ?? []) as Array<{ agent_id: string; status: string }>) {
    const entry = counts.get(row.agent_id) ?? {};
    entry[row.status] = (entry[row.status] ?? 0) + 1;
    counts.set(row.agent_id, entry);
  }
  const { data: pending } = await db
    .from("approval_items")
    .select("agent_id")
    .eq("org_id", orgId)
    .in("status", [...OPEN_REQUEST_STATUSES])
    .not("agent_id", "is", null)
    .limit(500);
  const waitingBy = new Map<string, number>();
  for (const row of (pending ?? []) as Array<{ agent_id: string }>) {
    waitingBy.set(row.agent_id, (waitingBy.get(row.agent_id) ?? 0) + 1);
  }
  const lines: AwaySummary["lines"] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const scribe = counts.get("scribe");
  if (scribe?.completed) lines.push({ agentId: "scribe", text: `Scribe built ${plural(scribe.completed, "case file", "case files")}`, href: "/app/agents/scribe" });
  const sentry = counts.get("sentry");
  const sentryTotal = sentry ? Object.values(sentry).reduce((a, b) => a + b, 0) : 0;
  if (sentryTotal) lines.push({ agentId: "sentry", text: `Sentry checked ${plural(sentryTotal, "lead", "leads")}`, href: "/app/agents/sentry" });
  const relayWaiting = waitingBy.get("relay") ?? 0;
  if (relayWaiting) lines.push({ agentId: "relay", text: `Relay has ${plural(relayWaiting, "draft", "drafts")} waiting for you`, href: "/app/agents/relay" });
  const compass = counts.get("compass");
  const compassTotal = compass ? Object.values(compass).reduce((a, b) => a + b, 0) : 0;
  if (compassTotal) lines.push({ agentId: "compass", text: `Compass answered ${plural(compassTotal, "question", "questions")}`, href: "/app/agents/compass" });
  for (const [agentId, entry] of counts) {
    const failed = (entry.failed ?? 0) + (entry.stuck ?? 0);
    if (failed && isLiveAgentId(agentId)) {
      lines.push({ agentId, text: `${plural(failed, "run", "runs")} by ${agentId.charAt(0).toUpperCase()}${agentId.slice(1)} need attention`, href: `/app/agents/${agentId}` });
    }
  }
  return { since: sinceIso, lines };
}

export type WorkspaceHealth = {
  orgId: string;
  name: string;
  status: string;
  working: number;
  waiting: number;
  stopped: number;
  erroring: number;
  lastActivityAt: string | null;
};

/** Agent health across every workspace the staff member is assigned to. */
export async function loadStaffHealth(): Promise<WorkspaceHealth[]> {
  const db = await rls();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: orgs }, { data: recent }, { data: pending }] = await Promise.all([
    db.from("organizations").select("id, name, status").order("name").limit(500),
    db.from("agent_activity_runs").select("org_id, status, last_progress_at").gte("last_progress_at", since).limit(5000),
    db.from("approval_items").select("org_id").in("status", [...OPEN_REQUEST_STATUSES]).not("agent_id", "is", null).limit(5000),
  ]);
  const health = new Map<string, WorkspaceHealth>();
  for (const org of (orgs ?? []) as Array<{ id: string; name: string; status: string }>) {
    health.set(org.id, { orgId: org.id, name: org.name, status: org.status, working: 0, waiting: 0, stopped: 0, erroring: 0, lastActivityAt: null });
  }
  for (const row of (recent ?? []) as Array<{ org_id: string; status: string; last_progress_at: string }>) {
    const entry = health.get(row.org_id);
    if (!entry) continue;
    if (row.status === "working" || row.status === "queued") entry.working += 1;
    if (row.status === "waiting_person") entry.waiting += 1;
    if (row.status === "paused" || row.status === "stopped") entry.stopped += 1;
    if (row.status === "failed" || row.status === "stuck" || row.status === "waiting_provider") entry.erroring += 1;
    if (!entry.lastActivityAt || row.last_progress_at > entry.lastActivityAt) entry.lastActivityAt = row.last_progress_at;
  }
  for (const row of (pending ?? []) as Array<{ org_id: string }>) {
    const entry = health.get(row.org_id);
    if (entry) entry.waiting += 1;
  }
  return [...health.values()].sort(
    (a, b) => b.erroring - a.erroring || b.waiting - a.waiting || b.working - a.working || a.name.localeCompare(b.name)
  );
}

export async function loadCalmMode(userId: string): Promise<boolean> {
  const db = await rls();
  const { data } = await db.from("user_preferences").select("calm_mode").eq("user_id", userId).maybeSingle();
  return (data as { calm_mode?: boolean } | null)?.calm_mode === true;
}
