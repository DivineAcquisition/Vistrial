import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS, LIVE_AGENT_IDS, type LiveAgentId } from "@/lib/agents/roster";
import { canSeeMoney } from "@/lib/auth/portal-access";
import type { AuthContext } from "@/lib/auth/types";
import { complianceForDispatch } from "@/lib/compliance/dispatch";
import { connectorByKey } from "@/lib/connectors/catalog";
import type { GhlDb } from "@/lib/ghl/tokens";
import { ACTION_TYPES } from "@/lib/home/catalog";
import { loadGateState } from "@/lib/home/gate";
import { localDate, zonedStartOfDay } from "@/lib/home/periods";
import { loadFacts, loadSummary, type Summary, type WorkspaceFacts } from "@/lib/metrics/load";
import { loadCustomerView } from "@/lib/onboarding/load";
import { finalMessage } from "@/lib/relay/footer";
import { createClient } from "@/lib/supabase/server";
import { aggregateBriefing, type AggregatedBriefing } from "@/lib/workspace/briefing";
import { orderDueNow, orderWorkNext, sortTasks, type DueRow, type TaskRow, type WorkRow } from "@/lib/workspace/work";
import { OPERATOR_NUMBERS, outcomeCatalog, outcomeValue, type OutcomeTile } from "@/lib/workspace/outcomes";
import { detectWorkspaceState, sourceLearningStarted, type Problem, type WorkspaceState } from "@/lib/workspace/state";
import type { ChecksInput, CrewFacts, SuggestionFacts, Tier, WelcomeFacts } from "@/lib/workspace/voice";
import type { HomeState } from "@/lib/workspace/home-state";
import type { OutcomeMetricId } from "../../../convex/homeRules";

/**
 * Reads for the agentic workspace. Always through the signed-in person's
 * row-level-security client: workspace and Operator lead scope are enforced
 * by the database, not here. Rows carry ids, names, states, and counts; no
 * message text or transcript text leaves this file except a draft body,
 * which only goes into the compliance check and never into the result.
 */

type Db = SupabaseClient;

async function rls(): Promise<Db> {
  return (await createClient()) as unknown as Db;
}

function leadName(row: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string {
  if (!row) return "A lead";
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "A lead";
}

function startOfToday(timeZone: string, now = new Date()): Date {
  const [y, m, d] = localDate(now, timeZone).split("-").map(Number);
  return zonedStartOfDay(timeZone, y, m, d);
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  return error ? 0 : (n ?? 0);
}

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

export type FrameFacts = {
  state: WorkspaceState;
  wentLiveAt: string | null;
  imported: number;
  sentry: { mode: "off" | "practice" | "live"; watchFrom: string | null };
  textingEnabled: boolean;
  agentTasks: "suggested" | "direct";
};

export async function loadFrame(ctx: AuthContext, home: HomeState): Promise<FrameFacts> {
  const db = await rls();
  const operator = ctx.workspaceRole === "operator";
  const [view, imports, sentry, connections, recentRuns, closed, routing] = await Promise.all([
    operator ? Promise.resolve(null) : loadCustomerView(ctx.org.id).catch(() => null),
    db.from("onboarding_import_runs").select("status, imported").eq("org_id", ctx.org.id).in("status", ["queued", "running"]).limit(5),
    db.from("sentry_workspaces").select("mode, watch_from").eq("org_id", ctx.org.id).maybeSingle(),
    operator
      ? Promise.resolve({ data: [] })
      : db.from("workspace_connections").select("connector_key, status").eq("org_id", ctx.org.id).in("status", ["needs_reconnecting", "delayed"]).limit(20),
    db
      .from("agent_activity_runs")
      .select("agent_id, status, created_at")
      .eq("org_id", ctx.org.id)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
    operator
      ? Promise.resolve({ data: [] })
      : db.from("leads").select("source").eq("org_id", ctx.org.id).eq("is_test", false).in("status", ["closed_won", "closed_lost"]).limit(5000),
    db.from("routing_settings").select("agent_tasks").eq("org_id", ctx.org.id).maybeSingle(),
  ]);

  const wentLiveAt = view?.wentLiveAt ?? (operator && ctx.org.status === "active" ? new Date(0).toISOString() : null);
  const runsSinceLive = wentLiveAt
    ? await count(db.from("agent_activity_runs").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).gte("created_at", wentLiveAt).limit(1))
    : 0;

  const problems: Problem[] = [];
  for (const row of (connections.data ?? []) as Array<{ connector_key: string; status: string }>) {
    const name = connectorByKey(row.connector_key)?.name ?? "A connected tool";
    problems.push(
      row.status === "needs_reconnecting"
        ? { kind: "reconnect", connector: name, href: "/app/settings/connections" }
        : { kind: "delayed", connector: name, href: "/app/settings/connections" }
    );
  }
  const latestByAgent = new Map<string, string>();
  for (const row of (recentRuns.data ?? []) as Array<{ agent_id: string; status: string }>) {
    if (!latestByAgent.has(row.agent_id)) latestByAgent.set(row.agent_id, row.status);
  }
  for (const [agentId, status] of latestByAgent) {
    if ((status === "failed" || status === "stuck") && (LIVE_AGENT_IDS as readonly string[]).includes(agentId)) {
      problems.push({ kind: "agent_stopped", agentId: agentId as LiveAgentId, href: `/app/agents/${agentId}` });
    }
  }

  const bySource: Record<string, number> = {};
  for (const row of (closed.data ?? []) as Array<{ source: string | null }>) {
    const key = row.source ?? "unknown";
    bySource[key] = (bySource[key] ?? 0) + 1;
  }

  const importRows = (imports.data ?? []) as Array<{ status: string; imported: number | null }>;
  const imported = importRows.reduce((sum, row) => sum + (row.imported ?? 0), 0);
  const sentryRow = sentry.data as { mode?: string; watch_from?: string | null } | null;
  const mode = sentryRow?.mode === "live" || sentryRow?.mode === "practice" ? sentryRow.mode : "off";

  return {
    state: detectWorkspaceState({
      role: ctx.workspaceRole,
      workspaceStatus: ctx.org.status,
      wentLiveAt,
      importRunning: importRows.length > 0,
      imported,
      runsSinceLive,
      learning: !operator && !sourceLearningStarted(bySource),
      problems,
      welcome: { firstSeenAt: home.prefs.firstSeenAt, dismissedAt: home.prefs.welcomeDismissedAt },
      now: home.now,
    }),
    wentLiveAt,
    imported,
    sentry: { mode, watchFrom: sentryRow?.watch_from ?? null },
    textingEnabled: view?.textingEnabled ?? true,
    agentTasks: (routing.data as { agent_tasks?: string } | null)?.agent_tasks === "direct" ? "direct" : "suggested",
  };
}

// ---------------------------------------------------------------------------
// Crew band and trust line
// ---------------------------------------------------------------------------

export type CrewServerFacts = Omit<CrewFacts, "relay"> & { trustAutoRun: string[] };

export async function loadCrewFacts(ctx: AuthContext, frame: FrameFacts): Promise<CrewServerFacts> {
  const db = await rls();
  const now = new Date();
  const today = startOfToday(ctx.org.timezone, now).toISOString();
  const [clocks, scribe, scoredToday, hotNow, gate] = await Promise.all([
    db
      .from("sentry_clocks")
      .select("state, deadline_at")
      .eq("org_id", ctx.org.id)
      .in("state", ["on_time", "at_risk", "missed"])
      .is("resolved_at", null)
      .limit(2000),
    db
      .from("agent_activity_runs")
      .select("finished_at")
      .eq("org_id", ctx.org.id)
      .eq("agent_id", "scribe")
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("lead_score_history").select("lead_id").eq("org_id", ctx.org.id).eq("historic", false).gte("created_at", today).limit(2000),
    count(
      db.from("lead_scores").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("tier", "hot").eq("contactable", true).eq("historic", false)
    ),
    loadGateState(db as unknown as GhlDb, ctx.org.id).catch(() => null),
  ]);
  const clockRows = (clocks.data ?? []) as Array<{ state: string; deadline_at: string | null }>;
  const upcoming = clockRows
    .filter((row) => row.state !== "missed" && row.deadline_at && Date.parse(row.deadline_at) > now.getTime())
    .map((row) => row.deadline_at as string)
    .sort();
  const scoredIds = [...new Set(((scoredToday.data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id))];
  const hotToday = scoredIds.length
    ? await count(
        db
          .from("lead_scores")
          .select("lead_id", { count: "exact", head: true })
          .eq("org_id", ctx.org.id)
          .eq("tier", "hot")
          .in("lead_id", scoredIds.slice(0, 500))
      )
    : 0;
  const autoRun = gate
    ? ACTION_TYPES.filter((type) => type.reachesPeople && gate.choice(type.id).mode === "auto_run").map((type) => type.label.toLowerCase())
    : [];
  return {
    sentry: { mode: frame.sentry.mode, watching: clockRows.length, nextDeadlineAt: upcoming[0] ?? null },
    scribe: { lastFinishedAt: (scribe.data as { finished_at?: string | null } | null)?.finished_at ?? null },
    assay: { scoredToday: scoredIds.length, hotToday, hotNow, paused: false },
    trustAutoRun: autoRun,
  };
}

export type AutonomyFacts = {
  sentryMode: "off" | "practice" | "live";
  agentTasks: "suggested" | "direct";
  gate: Array<{ id: string; label: string; reachesPeople: boolean; mode: string }>;
  trustAutoRun: string[];
};

export async function loadAutonomy(ctx: AuthContext): Promise<AutonomyFacts> {
  const db = await rls();
  const [gate, sentry, routing] = await Promise.all([
    loadGateState(db as unknown as GhlDb, ctx.org.id).catch(() => null),
    db.from("sentry_workspaces").select("mode").eq("org_id", ctx.org.id).maybeSingle(),
    db.from("routing_settings").select("agent_tasks").eq("org_id", ctx.org.id).maybeSingle(),
  ]);
  const rows = ACTION_TYPES.map((type) => ({
    id: type.id,
    label: type.label,
    reachesPeople: type.reachesPeople,
    mode: gate ? gate.choice(type.id).mode : "ask_first",
  }));
  const mode = (sentry.data as { mode?: string } | null)?.mode;
  return {
    sentryMode: mode === "live" || mode === "practice" ? mode : "off",
    agentTasks: (routing.data as { agent_tasks?: string } | null)?.agent_tasks === "direct" ? "direct" : "suggested",
    gate: rows,
    trustAutoRun: rows.filter((row) => row.reachesPeople && row.mode === "auto_run").map((row) => row.label.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionMeta = {
  leadId: string | null;
  leadName: string | null;
  windowEndsAt: string | null;
  tier: Tier | null;
  checks: ChecksInput;
};

export type SuggestedTask = { id: string; text: string; because: string | null; leadId: string | null; leadName: string | null; source: string };

export type DecisionsData = {
  meta: Record<string, DecisionMeta>;
  suggestedTasks: SuggestedTask[];
  reconnect: Array<{ connector: string; href: string }>;
  lastDecisionAt: string | null;
  canDecide: boolean;
};

const CHECK_LIMIT = 10;

export async function loadDecisions(ctx: AuthContext, frame: FrameFacts): Promise<DecisionsData> {
  const db = await rls();
  const canDecide = ctx.isStaff ? ctx.staffMayApprove : ctx.workspaceRole === "owner" || ctx.member.canApprove;
  const [items, suggested, decided, connections] = await Promise.all([
    db
      .from("approval_items")
      .select("id, agent_id, lead_ids, status, created_at")
      .eq("org_id", ctx.org.id)
      .not("agent_id", "is", null)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: true })
      .limit(50),
    db
      .from("next_actions")
      .select("id, action_text, source_sentence, lead_id, source_kind")
      .eq("org_id", ctx.org.id)
      .eq("owner_member_id", ctx.member.id)
      .eq("status", "suggested")
      .order("created_at", { ascending: true })
      .limit(20),
    db
      .from("approval_items")
      .select("decided_at")
      .eq("org_id", ctx.org.id)
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.workspaceRole === "owner" || ctx.isStaff
      ? db.from("workspace_connections").select("connector_key").eq("org_id", ctx.org.id).eq("status", "needs_reconnecting").limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const rows = (items.data ?? []) as Array<{ id: string; agent_id: string; lead_ids: string[] | null; status: string; created_at: string }>;
  const leadIds = [
    ...new Set([
      ...rows.flatMap((row) => row.lead_ids?.slice(0, 1) ?? []),
      ...((suggested.data ?? []) as Array<{ lead_id: string | null }>).flatMap((row) => (row.lead_id ? [row.lead_id] : [])),
    ]),
  ].slice(0, 200);
  const [leads, clocks, scores] = leadIds.length
    ? await Promise.all([
        db.from("leads").select("id, first_name, last_name, email").in("id", leadIds),
        db.from("sentry_clocks").select("lead_id, deadline_at, state").in("lead_id", leadIds).is("resolved_at", null),
        db.from("lead_scores").select("lead_id, tier").in("lead_id", leadIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const names = new Map(((leads.data ?? []) as Array<{ id: string }>).map((row) => [row.id, leadName(row as never)]));
  const windows = new Map(
    ((clocks.data ?? []) as Array<{ lead_id: string; deadline_at: string | null; state: string }>)
      .filter((row) => row.state === "on_time" || row.state === "at_risk" || row.state === "missed")
      .map((row) => [row.lead_id, row.deadline_at])
  );
  const tiers = new Map(((scores.data ?? []) as Array<{ lead_id: string; tier: Tier }>).map((row) => [row.lead_id, row.tier]));

  const meta: Record<string, DecisionMeta> = {};
  let checked = 0;
  for (const row of rows) {
    const leadId = row.lead_ids?.[0] ?? null;
    let checks: ChecksInput = { kind: "unknown" };
    if (canDecide && row.agent_id === "relay" && leadId && row.status === "pending" && checked < CHECK_LIMIT) {
      checked += 1;
      checks = await relayChecks(db, ctx, row.id, leadId, names.get(leadId) ?? null, frame.textingEnabled).catch(() => ({ kind: "unknown" as const }));
    }
    meta[row.id] = {
      leadId,
      leadName: leadId ? (names.get(leadId) ?? null) : null,
      windowEndsAt: leadId ? (windows.get(leadId) ?? null) : null,
      tier: leadId ? (tiers.get(leadId) ?? null) : null,
      checks,
    };
  }

  return {
    meta,
    suggestedTasks: ((suggested.data ?? []) as Array<{ id: string; action_text: string; source_sentence: string | null; lead_id: string | null; source_kind: string | null }>).map((row) => ({
      id: row.id,
      text: row.action_text,
      because: row.source_sentence,
      leadId: row.lead_id,
      leadName: row.lead_id ? (names.get(row.lead_id) ?? null) : null,
      source: row.source_kind ?? "person",
    })),
    reconnect: ((connections.data ?? []) as Array<{ connector_key: string }>).map((row) => ({
      connector: connectorByKey(row.connector_key)?.name ?? "A connected tool",
      href: "/app/settings/connections",
    })),
    lastDecisionAt: (decided.data as { decided_at?: string | null } | null)?.decided_at ?? null,
    canDecide,
  };
}

/** The send-time checks, run now so the card can say what would happen. The check runs again when it is marked sent. */
async function relayChecks(db: Db, ctx: AuthContext, itemId: string, leadId: string, name: string | null, textingEnabled: boolean): Promise<ChecksInput> {
  const { data } = await db.from("relay_drafts").select("channel, body, final_body, footer").eq("approval_item_id", itemId).eq("org_id", ctx.org.id).maybeSingle();
  const draft = data as { channel?: string; body?: string | null; final_body?: string | null; footer?: string | null } | null;
  if (!draft) return { kind: "unknown" };
  const channel = draft.channel === "email" ? "email" : "sms";
  if (channel === "sms" && !textingEnabled) return { kind: "blocked", reason: "sender_not_ready" };
  const result = await complianceForDispatch(db as unknown as GhlDb, {
    id: itemId,
    org_id: ctx.org.id,
    lead_id: leadId,
    actor_member_id: ctx.member.id,
    channel,
    body_text: finalMessage(String(draft.final_body ?? draft.body ?? ""), draft.footer ?? null),
  });
  if (result.action === "block") {
    const reason = result.reason === "opted_out" || result.reason === "do_not_contact" || result.reason === "email_suppressed" || result.reason === "missing_disclosure" || result.reason === "config_incomplete"
      ? result.reason
      : "config_incomplete";
    return { kind: "blocked", reason };
  }
  if (result.action === "defer") {
    return result.reason === "quiet_hours"
      ? { kind: "quiet", resumeAt: result.until.toISOString(), leadName: name, timeZone: ctx.org.timezone }
      : { kind: "limit", resumeAt: result.until.toISOString(), timeZone: ctx.org.timezone };
  }
  return { kind: "clear" };
}

// ---------------------------------------------------------------------------
// Due now and work next
// ---------------------------------------------------------------------------

export type WorkData = {
  dueNow: DueRow[];
  workNext: WorkRow[];
  tasks: TaskRow[];
  scope: "mine" | "everyone";
  canSeeEveryone: boolean;
};

const WORK_POOL = 80;

export async function loadWork(ctx: AuthContext, home: HomeState): Promise<WorkData> {
  const db = await rls();
  const operator = ctx.workspaceRole === "operator";
  const me = ctx.member.id;
  const canSeeEveryone = !operator;

  const mineFilter = `assigned_setter_id.eq.${me},assigned_closer_id.eq.${me}`;
  const [clocks, scores, tasks, assignedCount] = await Promise.all([
    db
      .from("sentry_clocks")
      .select("lead_id, kind, state, deadline_at, reason")
      .eq("org_id", ctx.org.id)
      .in("state", ["missed", "at_risk"])
      .is("resolved_at", null)
      .order("deadline_at", { ascending: true })
      .limit(100),
    db
      .from("lead_scores")
      .select("lead_id, score, tier")
      .eq("org_id", ctx.org.id)
      .eq("contactable", true)
      .eq("historic", false)
      .order("score", { ascending: false })
      .limit(WORK_POOL * 3),
    db
      .from("next_actions")
      .select("id, action_text, status, due_at, source_kind, lead_id")
      .eq("org_id", ctx.org.id)
      .eq("owner_member_id", me)
      .in("status", ["open", "snoozed"])
      .not("due_at", "is", null)
      .lt("due_at", new Date(startOfToday(ctx.org.timezone).getTime() + 86_400_000).toISOString())
      .order("due_at", { ascending: true })
      .limit(20),
    operator
      ? Promise.resolve(1)
      : count(db.from("leads").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).or(mineFilter).not("status", "in", "(closed_won,closed_lost)")),
  ]);

  const scope: "mine" | "everyone" = operator
    ? "mine"
    : home.prefs.workScope === "auto"
      ? assignedCount > 0
        ? "mine"
        : "everyone"
      : home.prefs.workScope;

  const clockRows = (clocks.data ?? []) as Array<{ lead_id: string; kind: "first_touch" | "follow_up"; state: "missed" | "at_risk"; deadline_at: string | null; reason: string | null }>;
  const scoreRows = (scores.data ?? []) as Array<{ lead_id: string; score: number; tier: Tier }>;
  const taskRows = (tasks.data ?? []) as Array<{ id: string; action_text: string; status: string; due_at: string; source_kind: string | null; lead_id: string | null }>;
  const ids = [...new Set([...clockRows.map((row) => row.lead_id), ...scoreRows.map((row) => row.lead_id), ...taskRows.flatMap((row) => (row.lead_id ? [row.lead_id] : []))])];

  const [leads, optOuts, reasons] = ids.length
    ? await Promise.all([
        db
          .from("leads")
          .select("id, first_name, last_name, email, phone, status, created_at, do_not_contact, is_test, merged_into, assigned_setter_id, assigned_closer_id")
          .in("id", ids),
        db.from("lead_opt_outs").select("lead_id").in("lead_id", ids).not("opted_out_at", "is", null),
        db.from("queue_rows").select("id, score_reasoning").in("id", scoreRows.slice(0, WORK_POOL * 3).map((row) => row.lead_id)),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  type LeadRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    created_at: string;
    do_not_contact: boolean;
    is_test: boolean;
    merged_into: string | null;
    assigned_setter_id: string | null;
    assigned_closer_id: string | null;
  };
  const optedOut = new Set(((optOuts.data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));
  const byId = new Map<string, LeadRow>();
  for (const row of (leads.data ?? []) as LeadRow[]) {
    if (row.do_not_contact || row.is_test || row.merged_into || optedOut.has(row.id)) continue;
    byId.set(row.id, row);
  }
  const mine = (lead: LeadRow) => lead.assigned_setter_id === me || lead.assigned_closer_id === me;
  const inScope = (lead: LeadRow) => scope === "everyone" || mine(lead) || (operator && !lead.assigned_setter_id && !lead.assigned_closer_id);
  const open = (lead: LeadRow) => lead.status !== "closed_won" && lead.status !== "closed_lost";
  const reasonById = new Map(((reasons.data ?? []) as Array<{ id: string; score_reasoning: string | null }>).map((row) => [row.id, row.score_reasoning]));
  const tierById = new Map(scoreRows.map((row) => [row.lead_id, row]));
  const snoozed = new Set(home.snoozedLeadIds);

  const dueNow = orderDueNow(
    clockRows.flatMap((row) => {
      const lead = byId.get(row.lead_id);
      if (!lead || !open(lead) || !inScope(lead)) return [];
      return [
        {
          leadId: row.lead_id,
          name: leadName(lead),
          phone: lead.phone,
          kind: row.kind,
          state: row.state,
          deadlineAt: row.deadline_at,
          reason: row.reason,
          tier: tierById.get(row.lead_id)?.tier ?? null,
        },
      ];
    })
  );
  const dueIds = new Set(dueNow.map((row) => row.leadId));

  const workNext = orderWorkNext(
    scoreRows.flatMap((row) => {
      const lead = byId.get(row.lead_id);
      if (!lead || !open(lead) || !inScope(lead) || dueIds.has(row.lead_id) || snoozed.has(row.lead_id)) return [];
      return [
        {
          leadId: row.lead_id,
          name: leadName(lead),
          phone: lead.phone,
          tier: row.tier,
          score: row.score,
          reason: reasonById.get(row.lead_id) ?? null,
          createdAt: lead.created_at,
        },
      ];
    }),
    home.prefs.workOrder
  ).slice(0, 5);

  return {
    dueNow: dueNow.slice(0, 10),
    workNext,
    tasks: sortTasks(
      taskRows.map((row) => ({
        id: row.id,
        text: row.action_text,
        dueAt: row.due_at,
        source: row.source_kind ?? "person",
        leadId: row.lead_id,
        leadName: row.lead_id && byId.get(row.lead_id) ? leadName(byId.get(row.lead_id)) : null,
        snoozed: row.status === "snoozed",
      })),
      home.now
    ),
    scope,
    canSeeEveryone,
  };
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

export async function loadBriefingFacts(ctx: AuthContext, sinceIso: string, capped: boolean, dueNow: number): Promise<AggregatedBriefing> {
  const db = await rls();
  const [leads, scribe, review, alerts, relay, moves] = await Promise.all([
    db.from("leads").select("id, created_at").eq("org_id", ctx.org.id).eq("is_test", false).gte("created_at", sinceIso).limit(2000),
    db.from("agent_activity_runs").select("status, finished_at").eq("org_id", ctx.org.id).eq("agent_id", "scribe").gte("finished_at", sinceIso).limit(5000),
    count(db.from("case_files").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "needs_review").gte("updated_at", sinceIso)),
    db.from("sentry_alerts").select("created_at, resolved_at").eq("org_id", ctx.org.id).gte("created_at", sinceIso).limit(2000),
    db.from("approval_items").select("created_at, status").eq("org_id", ctx.org.id).eq("agent_id", "relay").gte("created_at", sinceIso).limit(2000),
    db
      .from("lead_score_history")
      .select("lead_id, score, previous_score, tier, previous_tier, historic, created_at")
      .eq("org_id", ctx.org.id)
      .eq("historic", false)
      .gte("created_at", sinceIso)
      .limit(5000),
  ]);
  const leadRows = (leads.data ?? []) as Array<{ id: string; created_at: string }>;
  const marks = leadRows.length
    ? await db.from("lead_import_marks").select("lead_id").in("lead_id", leadRows.map((row) => row.id).slice(0, 1000)).is("reactivated_at", null)
    : { data: [] };
  const historic = new Set(((marks.data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));
  return aggregateBriefing(
    {
      leads: leadRows.map((row) => ({ ...row, historic: historic.has(row.id) })),
      scribeRuns: (scribe.data ?? []) as BriefingRunRow[],
      caseFilesForReview: review,
      alerts: (alerts.data ?? []) as Array<{ created_at: string; resolved_at: string | null }>,
      relayItems: (relay.data ?? []) as Array<{ created_at: string; status: string }>,
      scoreMoves: (moves.data ?? []) as AggregatedMoves,
      dueNow,
    },
    sinceIso,
    capped
  );
}

type BriefingRunRow = { status: string; finished_at: string | null };
type AggregatedMoves = Parameters<typeof aggregateBriefing>[0]["scoreMoves"];

/** Lead names for ids, only the ones this person may open. */
export async function loadLeadNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const db = await rls();
  const { data } = await db.from("leads").select("id, first_name, last_name, email").in("id", ids.slice(0, 50));
  return new Map(((data ?? []) as Array<{ id: string }>).map((row) => [row.id, leadName(row as never)]));
}

// ---------------------------------------------------------------------------
// Outcome strip
// ---------------------------------------------------------------------------

export type OutcomeData = {
  tiles: OutcomeTile[];
  contribution: { caseFiles: number; clocks: number; drafts: number };
  facts: WorkspaceFacts | null;
};

export async function loadOutcomes(ctx: AuthContext, chosen: OutcomeMetricId[]): Promise<OutcomeData> {
  const db = await rls();
  const facts = await loadFacts(ctx.org.id, db).catch(() => null);
  const catalog = outcomeCatalog({ facts, canSeeMoney: canSeeMoney(ctx), operator: ctx.workspaceRole === "operator" });
  const picked = chosen.filter((id) => catalog.has(id)).slice(0, 4);
  const sources = [...new Set(picked.flatMap((id) => catalog.get(id)!.sources))];
  const now = new Date();
  const todayStart = startOfToday(ctx.org.timezone, now);
  const weekFrom = new Date(todayStart.getTime() - 6 * 86_400_000);
  const range = { from: weekFrom.toISOString(), to: now.toISOString() };
  const previous = { from: new Date(weekFrom.getTime() - 7 * 86_400_000).toISOString(), to: weekFrom.toISOString() };
  const days = Array.from({ length: 7 }, (_, index) => {
    const from = new Date(weekFrom.getTime() + index * 86_400_000);
    return { from: from.toISOString(), to: new Date(Math.min(from.getTime() + 86_400_000, now.getTime())).toISOString() };
  });
  const nowRange = { from: now.toISOString(), to: now.toISOString() };
  const [week, live, daily, contribution] = await Promise.all([
    sources.length ? loadSummary({ orgId: ctx.org.id, metrics: sources, range, previous, db }).catch(() => ({}) as Summary) : Promise.resolve({} as Summary),
    picked.includes("leads_waiting") ? loadSummary({ orgId: ctx.org.id, metrics: ["missed_now", "at_risk_now"], range: nowRange, db }).catch(() => ({}) as Summary) : Promise.resolve({} as Summary),
    sources.length
      ? Promise.all(days.map((day) => loadSummary({ orgId: ctx.org.id, metrics: sources, range: day, db }).catch(() => ({}) as Summary)))
      : Promise.resolve([] as Summary[]),
    ctx.workspaceRole === "operator"
      ? Promise.resolve({} as Summary)
      : loadSummary({ orgId: ctx.org.id, metrics: ["scribe_updated", "relay_prepared", "new_leads"], range, db }).catch(() => ({}) as Summary),
  ]);
  const clocks =
    ctx.workspaceRole === "operator"
      ? 0
      : await count(db.from("sentry_clocks").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).gte("started_at", range.from));
  const tiles = picked.map((id) => outcomeValue(catalog.get(id)!, { week, live, daily }));
  const value = (summary: Summary, id: string) => {
    const entry = summary[id];
    return entry && !entry.hidden ? entry.current.count : 0;
  };
  return {
    tiles: tiles.filter((tile) => tile !== null),
    contribution: { caseFiles: value(contribution, "scribe_updated"), clocks, drafts: value(contribution, "relay_prepared") },
    facts,
  };
}

export type PersonalNumber = { id: string; label: string; unit: "count" | "duration"; value: number | null };

/**
 * An Operator's own numbers this week. compass_metric_summary pins the person
 * filter to the caller for Operators, so these are the same definitions as
 * Results, limited to leads assigned to them.
 */
export async function loadOperatorNumbers(ctx: AuthContext): Promise<PersonalNumber[]> {
  const db = await rls();
  const now = new Date();
  const from = new Date(startOfToday(ctx.org.timezone, now).getTime() - 6 * 86_400_000).toISOString();
  const { data, error } = await db.rpc("compass_metric_summary", {
    p_org_id: ctx.org.id,
    p_metrics: OPERATOR_NUMBERS.map((row) => row.id),
    p_from: from,
    p_to: now.toISOString(),
    p_prev_from: null,
    p_prev_to: null,
    p_filters: {},
  });
  if (error || !data) return [];
  const summary = data as Record<string, { hidden?: boolean; current?: { count?: number; median?: number | null } }>;
  return OPERATOR_NUMBERS.flatMap((row) => {
    const entry = summary[row.id];
    if (!entry || entry.hidden || !entry.current) return [];
    const value = row.unit === "duration" ? (entry.current.median ?? null) : Number(entry.current.count ?? 0);
    return [{ id: row.id, label: row.label, unit: row.unit, value }];
  });
}

export async function loadDueCount(ctx: AuthContext): Promise<number> {
  const db = await rls();
  return count(
    db.from("sentry_clocks").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).in("state", ["missed", "at_risk"]).is("resolved_at", null)
  );
}

// ---------------------------------------------------------------------------
// Live stream extras, command bar, welcome
// ---------------------------------------------------------------------------

export type TierMove = { id: string; leadId: string; name: string; tier: Tier; at: string };

/** Assay does not write agent runs, so its tier moves come from score history. Live scores only. */
export async function loadTierMoves(ctx: AuthContext): Promise<TierMove[]> {
  const db = await rls();
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data } = await db
    .from("lead_score_history")
    .select("id, lead_id, tier, previous_tier, historic, created_at")
    .eq("org_id", ctx.org.id)
    .eq("historic", false)
    .not("previous_tier", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = ((data ?? []) as Array<{ id: string; lead_id: string; tier: Tier; previous_tier: string | null; created_at: string }>).filter(
    (row) => row.previous_tier !== row.tier
  );
  const names = await loadLeadNames([...new Set(rows.map((row) => row.lead_id))]);
  return rows.flatMap((row) => {
    const name = names.get(row.lead_id);
    return name ? [{ id: row.id, leadId: row.lead_id, name, tier: row.tier, at: row.created_at }] : [];
  });
}

export async function loadSuggestionFacts(ctx: AuthContext, decisions: number): Promise<SuggestionFacts> {
  const db = await rls();
  const now = Date.now();
  const yesterday = startOfToday(ctx.org.timezone, new Date(now - 86_400_000));
  const today = startOfToday(ctx.org.timezone);
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();
  const [hot, calls, waiting, caseFiles] = await Promise.all([
    db.from("lead_scores").select("lead_id").eq("org_id", ctx.org.id).eq("tier", "hot").eq("contactable", true).eq("historic", false).limit(200),
    count(
      db
        .from("agent_activity_runs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org.id)
        .eq("agent_id", "scribe")
        .eq("status", "completed")
        .gte("finished_at", yesterday.toISOString())
        .lt("finished_at", today.toISOString())
    ),
    count(
      db
        .from("sentry_clocks")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org.id)
        .eq("kind", "first_touch")
        .in("state", ["at_risk", "missed"])
        .is("resolved_at", null)
        .lte("started_at", new Date(now - 30 * 60_000).toISOString())
    ),
    count(db.from("case_files").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id).gte("updated_at", monthAgo)),
  ]);
  const hotIds = ((hot.data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id);
  const hotUncontacted = hotIds.length
    ? await count(db.from("leads").select("id", { count: "exact", head: true }).in("id", hotIds).is("first_human_touch_at", null))
    : 0;
  return {
    hotUncontacted,
    callsYesterday: calls,
    waitingOver30: waiting,
    caseFilesThisMonth: caseFiles,
    decisions,
    operator: ctx.workspaceRole === "operator",
  };
}

export async function loadWelcomeFacts(ctx: AuthContext, frame: FrameFacts, draftsWaiting: number): Promise<WelcomeFacts & { members: number; firstDraftDecided: boolean; hoursConfirmed: boolean; calendarConnected: boolean }> {
  const db = await rls();
  const [calls, caseFiles, scored, hot, members, decided, connections, view] = await Promise.all([
    count(db.from("calls").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    count(db.from("case_files").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    count(db.from("lead_scores").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    count(db.from("lead_scores").select("lead_id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("tier", "hot").eq("contactable", true)),
    count(db.from("org_members").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("seat", "customer").eq("active", true)),
    count(db.from("approval_items").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).not("decided_at", "is", null)),
    db.from("workspace_connections").select("connector_key, status").eq("org_id", ctx.org.id).limit(50),
    loadCustomerView(ctx.org.id).catch(() => null),
  ]);
  const connected = ((connections.data ?? []) as Array<{ connector_key: string; status: string }>).filter((row) => row.status !== "disconnected");
  const categories = new Set(connected.map((row) => connectorByKey(row.connector_key)?.category).filter(Boolean));
  return {
    businessName: ctx.org.name,
    callsRead: calls,
    caseFiles,
    scored,
    hotNow: hot,
    sentryMode: frame.sentry.mode,
    watchFrom: frame.sentry.watchFrom,
    draftsWaiting,
    callSourceConnected: calls > 0 || categories.has("calls" as never) || categories.has("crm" as never),
    members,
    firstDraftDecided: decided > 0,
    hoursConfirmed: Boolean(view?.approach.confirmedAt),
    calendarConnected: categories.has("calendars" as never),
  };
}

export function agentName(id: LiveAgentId): string {
  return AGENTS[id].name;
}
