import "server-only";

import { computeHealth, parseHealthRules } from "@/lib/staff/health";
import { staffDb } from "@/lib/staff/db";
import type {
  ConnectionRow,
  HealthRules,
  QueueCounts,
  RosterFacts,
  StaffScope,
} from "@/lib/staff/types";
import type { Health } from "@/lib/staff/types";

export type RosterRow = RosterFacts & { health: Health };

async function rules(): Promise<{ version: number; rules: HealthRules }> {
  const db = await staffDb();
  const { data } = await db
    .from("staff_health_rules")
    .select("version, rules")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { version: number; rules: unknown } | null;
  return { version: row?.version ?? 1, rules: parseHealthRules(row?.rules) };
}

export async function loadRoster(scope: StaffScope, orgId?: string | null): Promise<{ rows: RosterRow[]; rules: HealthRules; version: number }> {
  const db = await staffDb();
  const current = await rules();
  const { data } = await db.rpc("staff_roster_facts", {
    p_scope: scope,
    p_org_id: orgId ?? null,
    p_days: current.rules.response_period_days,
  });
  const rows = ((data ?? []) as RosterFacts[]).map((facts) => ({
    ...facts,
    health: computeHealth(facts, current.rules),
  }));
  return { rows, rules: current.rules, version: current.version };
}

export async function loadQueueCounts(scope: StaffScope): Promise<QueueCounts> {
  const db = await staffDb();
  const { data } = await db.rpc("staff_queue_counts", { p_scope: scope });
  const row = (data ?? {}) as Partial<QueueCounts>;
  return {
    escalations: Number(row.escalations ?? 0),
    requests: Number(row.requests ?? 0),
    requests_overdue: Number(row.requests_overdue ?? 0),
    data_requests: Number(row.data_requests ?? 0),
    failed_runs: Number(row.failed_runs ?? 0),
  };
}

export async function loadConnections(scope: StaffScope, orgId?: string | null): Promise<ConnectionRow[]> {
  const db = await staffDb();
  const { data } = await db.rpc("staff_connections", { p_scope: scope, p_org_id: orgId ?? null });
  return (data ?? []) as ConnectionRow[];
}

export async function loadHealthRuleHistory(): Promise<
  Array<{ version: number; rules: HealthRules; description: string; created_by_name: string | null; created_at: string }>
> {
  const db = await staffDb();
  const { data } = await db
    .from("staff_health_rules")
    .select("version, rules, description, created_by_name, created_at")
    .order("version", { ascending: false });
  return ((data ?? []) as Array<{ version: number; rules: unknown; description: string; created_by_name: string | null; created_at: string }>).map(
    (row) => ({ ...row, rules: parseHealthRules(row.rules) })
  );
}
