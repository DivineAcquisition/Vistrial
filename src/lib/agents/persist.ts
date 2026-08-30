import "server-only";

import { agentDisplayName } from "@/lib/agents/labels";
import { resolveModel, type RouteTable } from "@/lib/agents/router";
import { routesFromRows } from "@/lib/agents/router";
import { seededOrgAgentSettings } from "@/lib/agents/caps";
import { agentDefinition } from "@/lib/agents/catalog";
import { emptyHaltState } from "@/lib/agents/halt";
import { actorFromMember } from "@/lib/agents/identity";
import { failureNextState } from "@/lib/agents/retry";
import type {
  AgentActor,
  AgentHaltState,
  AgentId,
  AgentMode,
  AgentRunState,
  ModelRoute,
  OrgAgentSettings,
  TriggerKind,
  WorkKind,
} from "@/lib/agents/types";
import type { Json } from "@/types/database";

type Query = {
  select: (columns?: string, options?: Record<string, unknown>) => Query;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Query;
  update: (values: Record<string, unknown>) => Query;
  upsert: (values: Record<string, unknown> | Record<string, unknown>[], options?: Record<string, unknown>) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
  gte: (column: string, value: unknown) => Query;
  lte: (column: string, value: unknown) => Query;
  is: (column: string, value: unknown) => Query;
  not: (column: string, op: string, value: unknown) => Query;
  order: (column: string, options?: Record<string, unknown>) => Query;
  limit: (n: number) => Query;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then?: unknown;
};

type Db = { from: (table: string) => Query };

function table(db: Db, name: string): Query {
  return db.from(name);
}

function todayStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function loadHaltState(db: Db, orgId: string): Promise<AgentHaltState> {
  const { data } = await table(db, "organizations")
    .select("agents_halted, agent_crm_writes_halted, agent_calendar_writes_halted")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return emptyHaltState();
  return {
    global: Boolean(data.agents_halted),
    apps: {
      crm: Boolean(data.agent_crm_writes_halted),
      calendar: Boolean(data.agent_calendar_writes_halted),
    },
  };
}

export async function loadOrgAgentSettings(
  db: Db,
  orgId: string,
  agentId: AgentId,
): Promise<OrgAgentSettings> {
  const definition = agentDefinition(agentId);
  const fallback = definition ? seededOrgAgentSettings(orgId, definition) : seededOrgAgentSettings(orgId, agentDefinition("operator")!);
  const { data } = await table(db, "org_agent_settings")
    .select("org_id, agent_id, enabled, observation_mode, daily_run_cap, daily_spend_cap_usd")
    .eq("org_id", orgId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!data) return { ...fallback, orgId };
  return {
    orgId,
    agentId,
    enabled: Boolean(data.enabled),
    observationMode: Boolean(data.observation_mode),
    dailyRunCap: Number(data.daily_run_cap ?? fallback.dailyRunCap),
    dailySpendCapUsd: Number(data.daily_spend_cap_usd ?? fallback.dailySpendCapUsd),
  };
}

export async function loadServiceMember(db: Db, orgId: string): Promise<AgentActor | null> {
  const { data: org } = await table(db, "organizations")
    .select("agent_run_as_member_id")
    .eq("id", orgId)
    .maybeSingle();
  const memberId = typeof org?.agent_run_as_member_id === "string" ? org.agent_run_as_member_id : null;
  if (!memberId) {
    const { data: flagged } = await table(db, "org_members")
      .select("id, user_id, role, display_name, active")
      .eq("org_id", orgId)
      .eq("is_agent_identity", true)
      .maybeSingle();
    if (!flagged || flagged.active === false) return null;
    return actorFromMember({
      userId: String(flagged.user_id),
      memberId: String(flagged.id),
      role: flagged.role as AgentActor["role"],
      displayName: String(flagged.display_name),
    });
  }
  const { data: member } = await table(db, "org_members")
    .select("id, user_id, role, display_name, active")
    .eq("org_id", orgId)
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.active === false) return null;
  return actorFromMember({
    userId: String(member.user_id),
    memberId: String(member.id),
    role: member.role as AgentActor["role"],
    displayName: String(member.display_name),
  });
}

export async function loadModelRoutes(db: Db): Promise<RouteTable> {
  const { data } = (await table(db, "agent_model_routes").select(
    "work_kind, tier, model_id, escalate_to_tier, use_batch_when_async",
  )) as unknown as { data: Array<Record<string, unknown>> | null };
  const rows = (data ?? [])
    .map((row): ModelRoute | null => {
      const workKind = row.work_kind;
      const tier = row.tier;
      const modelId = row.model_id;
      if (typeof workKind !== "string" || typeof tier !== "string" || typeof modelId !== "string") return null;
      return {
        workKind: workKind as WorkKind,
        tier: tier as ModelRoute["tier"],
        modelId,
        escalateToTier: (typeof row.escalate_to_tier === "string" ? row.escalate_to_tier : null) as ModelRoute["escalateToTier"],
        useBatchWhenAsync: row.use_batch_when_async !== false,
      };
    })
    .filter((row): row is ModelRoute => row !== null);
  return routesFromRows(rows);
}

export async function runsAndSpendToday(
  db: Db,
  orgId: string,
  agentId: AgentId,
): Promise<{ runsToday: number; spendTodayUsd: number }> {
  const since = todayStartIso();
  const result = (await table(db, "agent_runs")
    .select("id, spend_usd, created_at")
    .eq("org_id", orgId)
    .eq("agent_id", agentId)
    .gte("created_at", since)) as unknown as { data: Array<{ spend_usd?: number }> | null };
  const rows = result.data ?? [];
  return {
    runsToday: rows.length,
    spendTodayUsd: rows.reduce((sum, row) => sum + Number(row.spend_usd ?? 0), 0),
  };
}

export async function loadLastUserActivityAt(db: Db, orgId: string): Promise<Date | null> {
  const { data: org } = await table(db, "organizations")
    .select("last_interactive_at")
    .eq("id", orgId)
    .maybeSingle();
  const stamped = typeof org?.last_interactive_at === "string" ? new Date(org.last_interactive_at) : null;
  const { data: run } = await table(db, "operator_runs")
    .select("created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRun = typeof run?.created_at === "string" ? new Date(run.created_at) : null;
  const dates = [stamped, lastRun].filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((value) => value.getTime())));
}

export async function touchLastInteractive(db: Db, orgId: string, at = new Date()): Promise<void> {
  await table(db, "organizations").update({ last_interactive_at: at.toISOString() }).eq("id", orgId);
}

export async function findRunByTrigger(
  db: Db,
  orgId: string,
  agentId: AgentId,
  triggerKey: string,
): Promise<{ id: string } | null> {
  const { data } = await table(db, "agent_runs")
    .select("id")
    .eq("org_id", orgId)
    .eq("agent_id", agentId)
    .eq("trigger_key", triggerKey)
    .maybeSingle();
  return data && typeof data.id === "string" ? { id: data.id } : null;
}

export async function insertAgentRun(db: Db, input: {
  id?: string;
  orgId: string;
  agentId: AgentId;
  mode: AgentMode;
  triggerKind: TriggerKind;
  triggerKey: string;
  actor: AgentActor;
  requestText?: string;
  status?: AgentRunState;
}): Promise<{ id: string } | { error: string; duplicate?: boolean }> {
  const existing = await findRunByTrigger(db, input.orgId, input.agentId, input.triggerKey);
  if (existing) return { error: "This event already produced a run.", duplicate: true };
  const row = {
    ...(input.id ? { id: input.id } : {}),
    org_id: input.orgId,
    agent_id: input.agentId,
    agent_label: agentDisplayName(input.agentId),
    mode: input.mode,
    trigger_kind: input.triggerKind,
    trigger_key: input.triggerKey,
    actor_user_id: input.actor.userId,
    actor_member_id: input.actor.memberId,
    actor_role: input.actor.role,
    actor_display_name: input.actor.displayName,
    status: input.status ?? "running",
    request_text: input.requestText ?? null,
    started_at: new Date().toISOString(),
  };
  const { data, error } = await table(db, "agent_runs").insert(row).select("id").maybeSingle();
  if (error || !data || typeof data.id !== "string") {
    const duplicate = Boolean(error?.message.match(/duplicate|unique/i));
    return { error: duplicate ? "This event already produced a run." : "Could not start that run.", duplicate };
  }
  return { id: data.id };
}

export async function updateAgentRun(db: Db, input: {
  runId: string;
  orgId: string;
  status?: AgentRunState;
  outputText?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  workKind?: WorkKind | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  spendUsd?: number;
  stepCount?: number;
  stopReason?: string | null;
  retryCount?: number;
  nextRetryAt?: string | null;
  batchId?: string | null;
  messages?: Json;
  finished?: boolean;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.status) patch.status = input.status;
  if (input.outputText !== undefined) patch.output_text = input.outputText;
  if (input.model !== undefined) patch.model = input.model;
  if (input.modelVersion !== undefined) patch.model_version = input.modelVersion;
  if (input.workKind !== undefined) patch.work_kind = input.workKind;
  if (input.inputTokens !== undefined) patch.input_tokens = input.inputTokens;
  if (input.outputTokens !== undefined) patch.output_tokens = input.outputTokens;
  if (input.cacheReadTokens !== undefined) patch.cache_read_tokens = input.cacheReadTokens;
  if (input.spendUsd !== undefined) patch.spend_usd = input.spendUsd;
  if (input.stepCount !== undefined) patch.step_count = input.stepCount;
  if (input.stopReason !== undefined) patch.stop_reason = input.stopReason;
  if (input.retryCount !== undefined) patch.retry_count = input.retryCount;
  if (input.nextRetryAt !== undefined) patch.next_retry_at = input.nextRetryAt;
  if (input.batchId !== undefined) patch.batch_id = input.batchId;
  if (input.messages !== undefined) patch.messages = input.messages;
  if (input.finished) patch.finished_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) return;
  await table(db, "agent_runs").update(patch).eq("id", input.runId).eq("org_id", input.orgId);
}

export async function incrementAgentRunUsage(
  db: Db,
  input: {
    runId: string;
    orgId: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    spendUsd: number;
  },
): Promise<void> {
  const { data } = await table(db, "agent_runs")
    .select("input_tokens, output_tokens, cache_read_tokens, spend_usd")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  if (!data) return;
  await table(db, "agent_runs")
    .update({
      input_tokens: Number(data.input_tokens ?? 0) + input.inputTokens,
      output_tokens: Number(data.output_tokens ?? 0) + input.outputTokens,
      cache_read_tokens: Number(data.cache_read_tokens ?? 0) + input.cacheReadTokens,
      spend_usd: Number(data.spend_usd ?? 0) + input.spendUsd,
    })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);
}

export async function incrementAgentRunSteps(db: Db, runId: string, orgId: string): Promise<void> {
  const { data } = await table(db, "agent_runs")
    .select("step_count")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return;
  await table(db, "agent_runs")
    .update({ step_count: Number(data.step_count ?? 0) + 1 })
    .eq("id", runId)
    .eq("org_id", orgId);
}

export async function recordAgentRunFailure(
  db: Db,
  input: {
    runId: string;
    orgId: string;
    mode: AgentMode;
    stopReason?: string | null;
    outputText?: string | null;
  },
): Promise<void> {
  const { data } = await table(db, "agent_runs")
    .select("retry_count")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  const retryCount = Number(data?.retry_count ?? 0);
  const next = failureNextState({ mode: input.mode, retryCount });
  await updateAgentRun(db, {
    runId: input.runId,
    orgId: input.orgId,
    status: next.nextStatus,
    nextRetryAt: next.nextRetryAt?.toISOString() ?? null,
    stopReason: input.stopReason,
    outputText: input.outputText,
    finished: next.nextStatus !== "queued",
  });
}

export async function insertAgentStep(db: Db, input: {
  orgId: string;
  runId: string;
  seq: number;
  toolName: string;
  label: string;
  args: unknown;
  model?: string | null;
  modelVersion?: string | null;
}): Promise<string> {
  const { data, error } = await table(db, "agent_run_steps")
    .insert({
      org_id: input.orgId,
      run_id: input.runId,
      seq: input.seq,
      tool_name: input.toolName,
      label: input.label,
      arguments: (input.args ?? {}) as Json,
      state: "running",
      model: input.model ?? null,
      model_version: input.modelVersion ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data || typeof data.id !== "string") throw new Error("Could not record that step.");
  return data.id;
}

export async function finishAgentStep(db: Db, input: {
  stepId: string;
  runId: string;
  orgId: string;
  state: string;
  summary: string;
  result: unknown;
  errorKind?: string | null;
  errorText?: string | null;
  startedAt: number;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  await table(db, "agent_run_steps")
    .update({
      state: input.state,
      result_summary: input.summary,
      result: input.result as Json,
      error_kind: input.errorKind ?? null,
      error_text: input.errorText ?? null,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - input.startedAt,
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
    })
    .eq("id", input.stepId)
    .eq("run_id", input.runId)
    .eq("org_id", input.orgId);
}

export async function insertEscalation(db: Db, input: {
  orgId: string;
  agentId: AgentId;
  runId: string;
  stepIndex: number;
  workKind: WorkKind;
  fromTier: string;
  toTier: string;
}): Promise<void> {
  await table(db, "agent_escalations").insert({
    org_id: input.orgId,
    agent_id: input.agentId,
    run_id: input.runId,
    step_index: input.stepIndex,
    work_kind: input.workKind,
    from_tier: input.fromTier,
    to_tier: input.toTier,
    reason: "verification_failed",
  });
}

export async function insertApproval(db: Db, input: {
  orgId: string;
  runId: string;
  stepId: string | null;
  operation: string;
  system: string;
  recordLabel: string;
  before: string;
  after: string;
  reversible: boolean;
  irreversibleLabel: string | null;
  namedHumanId: string;
}): Promise<string> {
  const { data, error } = await table(db, "agent_run_approvals")
    .insert({
      org_id: input.orgId,
      run_id: input.runId,
      step_id: input.stepId,
      operation: input.operation,
      system: input.system,
      preview_before: input.before,
      preview_after: input.after,
      record_label: input.recordLabel,
      reversible: input.reversible,
      irreversible_label: input.irreversibleLabel,
      named_human_id: input.namedHumanId,
      decision: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error || !data || typeof data.id !== "string") throw new Error("Could not record that approval.");
  return data.id;
}

export async function insertResearchFact(db: Db, input: {
  orgId: string;
  runId: string;
  companyName: string;
  fact: string;
  source: string;
  foundAt: Date;
}): Promise<void> {
  await table(db, "agent_research_facts").insert({
    org_id: input.orgId,
    run_id: input.runId,
    company_name: input.companyName,
    fact: input.fact,
    source: input.source,
    found_at: input.foundAt.toISOString(),
  });
}

export async function insertAsset(db: Db, input: {
  orgId: string;
  agentId: AgentId;
  runId: string | null;
  title: string;
  body: string;
  dataBasis: string;
  sampleSize: number;
  version: number;
  verbatimFlagged: boolean;
  verbatimExcerpts: unknown;
}): Promise<string> {
  const { data, error } = await table(db, "agent_assets")
    .insert({
      org_id: input.orgId,
      agent_id: input.agentId,
      run_id: input.runId,
      title: input.title,
      body: input.body,
      data_basis: input.dataBasis,
      sample_size: input.sampleSize,
      version: input.version,
      verbatim_flagged: input.verbatimFlagged,
      verbatim_excerpts: input.verbatimExcerpts as Json,
    })
    .select("id")
    .maybeSingle();
  if (error || !data || typeof data.id !== "string") throw new Error("Could not keep that asset.");
  return data.id;
}

export async function loadFailedRunsDue(db: Db, now = new Date()): Promise<Array<Record<string, unknown>>> {
  const result = (await table(db, "agent_runs")
    .select("id, org_id, agent_id, mode, trigger_kind, trigger_key, retry_count, status, next_retry_at")
    .eq("status", "queued")
    .lte("next_retry_at", now.toISOString())) as unknown as { data: Array<Record<string, unknown>> | null };
  return result.data ?? [];
}

export async function loadAwaitingBatch(db: Db): Promise<Array<Record<string, unknown>>> {
  const result = (await table(db, "agent_runs")
    .select("id, org_id, agent_id, batch_id, status")
    .eq("status", "awaiting_batch")) as unknown as { data: Array<Record<string, unknown>> | null };
  return result.data ?? [];
}

export { resolveModel };
