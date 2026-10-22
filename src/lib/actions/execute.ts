import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { agentWritesHalted } from "@/lib/agents/halt";
import { loadHaltState } from "@/lib/agents/persist";
import { executorFor, redactParams, type Fetch } from "@/lib/actions/executors";
import { actionDef, connectorFor, decideAction, type ActionContext, type ActionDecision, type ActionRequest, type InternalPolicy } from "@/lib/actions/registry";
import { readAccessToken } from "@/lib/connectors/store";

const HEALTHY = ["live", "importing", "delayed"];

export type ActionOutcome =
  | ActionDecision
  | { route: "suggested"; runId: string }
  | { route: "done"; runId: string; data?: unknown }
  | { route: "failed"; runId: string; code: string };

type RunRow = {
  id: string;
  org_id: string;
  action: string;
  connector: string;
  requested_by_kind: "agent" | "person";
  requested_by: string;
  lead_id: string | null;
  status: string;
  params: Record<string, unknown>;
  before: unknown;
  external_ref: string | null;
};

function haltApp(action: string): "crm" | "calendar" {
  return action.startsWith("calendar.") ? "calendar" : "crm";
}

/** Everything decideAction needs, read with the service client and scoped to one workspace. */
export async function loadActionContext(db: SupabaseClient, orgId: string, action: string): Promise<ActionContext & { connections: Map<string, string> }> {
  const [policies, connections, halt, org] = await Promise.all([
    db.from("action_policies").select("action, mode").eq("org_id", orgId),
    db.from("workspace_connections").select("id, connector_key, status, granted_scopes").eq("org_id", orgId).in("status", HEALTHY),
    loadHaltState(db as never, orgId),
    db.from("organizations").select("status").eq("id", orgId).maybeSingle(),
  ]);
  const connectionRows = (connections.data ?? []) as Array<{ id: string; connector_key: string; granted_scopes: string[] | null }>;
  return {
    policies: new Map(((policies.data ?? []) as Array<{ action: string; mode: InternalPolicy }>).map((row) => [row.action, row.mode])),
    healthyConnectors: new Set(connectionRows.map((row) => row.connector_key)),
    grantedScopes: new Map(connectionRows.map((row) => [row.connector_key, new Set(row.granted_scopes ?? [])])),
    agentWritesHalted: agentWritesHalted(halt, haltApp(action)),
    workspaceStatus: ((org.data as { status?: string } | null)?.status ?? "active"),
    connections: new Map(connectionRows.map((row) => [row.connector_key, row.id])),
  };
}

async function externalIdFor(db: SupabaseClient, orgId: string, leadId: string | null, connector: string): Promise<string | null> {
  if (!leadId) return null;
  const { data } = await db
    .from("lead_identities")
    .select("value")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .eq("kind", "crm")
    .like("value", `${connector}:%`)
    .limit(1)
    .maybeSingle();
  const value = (data as { value?: string } | null)?.value;
  return value ? value.slice(connector.length + 1) : null;
}

async function runNow(db: SupabaseClient, run: RunRow, connectionId: string | undefined, fetcher: Fetch): Promise<ActionOutcome> {
  const executor = executorFor(run.action, run.connector);
  const finish = async (status: "done" | "failed", patch: Record<string, unknown>) => {
    await db
      .from("action_runs")
      .update({ status, params: redactParams(run.params), updated_at: new Date().toISOString(), ...patch })
      .eq("id", run.id)
      .eq("org_id", run.org_id);
  };
  if (!executor) {
    await finish("failed", { result_code: "not_supported" });
    return { route: "failed", runId: run.id, code: "not_supported" };
  }
  const token = connectionId ? await readAccessToken(connectionId) : null;
  if (!token) {
    await finish("failed", { result_code: "not_connected" });
    return { route: "failed", runId: run.id, code: "not_connected" };
  }
  const externalId = await externalIdFor(db, run.org_id, run.lead_id, run.connector);
  try {
    const result = await executor.run({ token, params: run.params, externalId, fetch: fetcher });
    if (!result.ok) {
      await finish("failed", { result_code: result.code });
      return { route: "failed", runId: run.id, code: result.code };
    }
    await finish("done", { result_code: "ok", before: result.before ?? null, after: result.after ?? null, external_ref: result.externalRef });
    return { route: "done", runId: run.id, data: result.data };
  } catch {
    await finish("failed", { result_code: "vendor_error" });
    return { route: "failed", runId: run.id, code: "vendor_error" };
  }
}

/**
 * The only way an agent or a person asks for an action. Reaching a person
 * comes back as "approval_gate" and nothing is sent here: the caller drafts
 * into the approval gate, which owns consent, quiet hours and send rechecks.
 */
export async function requestAction(db: SupabaseClient, orgId: string, request: ActionRequest, fetcher: Fetch = fetch): Promise<ActionOutcome> {
  const context = await loadActionContext(db, orgId, request.action);
  const decision = decideAction(request, context);
  if (decision.route === "blocked" || decision.route === "approval_gate") return decision;

  const action = actionDef(request.action)!;
  const params = action.params.parse(request.params) as Record<string, unknown>;
  const connector = connectorFor(action, params)!;
  const leadId = typeof params.leadId === "string" ? params.leadId : null;
  const status = decision.route === "suggest" ? "suggested" : "running";
  const { data, error } = await db
    .from("action_runs")
    .insert({
      org_id: orgId,
      action: action.name,
      tier: action.tier,
      connector,
      requested_by_kind: request.requestedBy.kind,
      requested_by: request.requestedBy.kind === "agent" ? request.requestedBy.agentId : request.requestedBy.memberId,
      lead_id: leadId,
      status,
      params,
    })
    .select("id, org_id, action, connector, requested_by_kind, requested_by, lead_id, status, params, before, external_ref")
    .single();
  if (error || !data) return { route: "blocked", reason: "bad_params" };
  const run = data as RunRow;
  if (status === "suggested") return { route: "suggested", runId: run.id };
  return runNow(db, run, context.connections.get(connector), fetcher);
}

/**
 * A person confirmed a suggestion through action_run_decide (which checks
 * who they are). Everything is checked again before it runs, as a person's
 * request, so a pause, halt or lost connection since the suggestion still stops it.
 */
export async function runConfirmed(db: SupabaseClient, orgId: string, runId: string, memberId: string, fetcher: Fetch = fetch): Promise<ActionOutcome> {
  const { data } = await db
    .from("action_runs")
    .select("id, org_id, action, connector, requested_by_kind, requested_by, lead_id, status, params, before, external_ref")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  const run = data as RunRow | null;
  if (!run || run.status !== "running") return { route: "blocked", reason: "unknown_action" };
  const context = await loadActionContext(db, orgId, run.action);
  const decision = decideAction({ action: run.action, params: run.params, requestedBy: { kind: "person", memberId } }, context);
  if (decision.route !== "execute") {
    await db
      .from("action_runs")
      .update({ status: "failed", result_code: decision.route === "blocked" ? decision.reason : "not_allowed", params: redactParams(run.params), updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("org_id", orgId);
    return decision;
  }
  return runNow(db, run, context.connections.get(run.connector), fetcher);
}

/** Puts the old value back where the vendor allows it. The run record keeps both sides. */
export async function undoRun(db: SupabaseClient, orgId: string, runId: string, fetcher: Fetch = fetch): Promise<{ ok: boolean; code?: string }> {
  const { data } = await db
    .from("action_runs")
    .select("id, org_id, action, connector, requested_by_kind, requested_by, lead_id, status, params, before, external_ref")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  const run = data as RunRow | null;
  if (!run || run.status !== "done") return { ok: false, code: "not_done" };
  const action = actionDef(run.action);
  const executor = executorFor(run.action, run.connector);
  if (!action?.reversible || !executor?.undo) return { ok: false, code: "not_reversible" };
  const context = await loadActionContext(db, orgId, run.action);
  const token = context.connections.has(run.connector) ? await readAccessToken(context.connections.get(run.connector)!) : null;
  if (!token) return { ok: false, code: "not_connected" };
  const externalId = await externalIdFor(db, orgId, run.lead_id, run.connector);
  const result = await executor.undo({ token, params: run.params, externalId, before: run.before, externalRef: run.external_ref, fetch: fetcher }).catch(() => ({ ok: false, code: "vendor_error" }));
  if (result.ok) {
    await db.from("action_runs").update({ status: "undone", updated_at: new Date().toISOString() }).eq("id", run.id).eq("org_id", orgId);
  }
  return result;
}
