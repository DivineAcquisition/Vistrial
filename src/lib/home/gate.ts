import "server-only";

import { ACTION_TYPES, effectiveGate, type GateChoice, type GateRow } from "@/lib/home/catalog";
import type { GhlDb } from "@/lib/ghl/tokens";

export type GateLimits = {
  quietHoursStart: string;
  quietHoursEnd: string;
  dailySendLimitPerLead: number;
  queueWaitLimitMinutes: number;
  reviewedAt: string | null;
};

export const DEFAULT_GATE_LIMITS: GateLimits = {
  quietHoursStart: "20:00",
  quietHoursEnd: "08:00",
  dailySendLimitPerLead: 2,
  queueWaitLimitMinutes: 240,
  reviewedAt: null,
};

export type GateState = {
  rows: GateRow[];
  limits: GateLimits;
  choice: (actionType: string) => GateChoice;
};

/**
 * One read of a workspace's approval settings. The queue, the log, the
 * scanner, and the settings page all go through this, so a saved change is
 * the next thing every one of them sees.
 */
export async function loadGateState(db: GhlDb, orgId: string): Promise<GateState> {
  const [{ data: rows }, { data: settings }] = await Promise.all([
    db.from("approval_gate_actions").select("action_type, mode, approver").eq("org_id", orgId),
    db
      .from("approval_gate_settings")
      .select("quiet_hours_start, quiet_hours_end, daily_send_limit_per_lead, queue_wait_limit_minutes, reviewed_at")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  const gateRows: GateRow[] = (rows ?? []).map((row) => ({
    actionType: row.action_type,
    mode: row.mode,
    approver: row.approver,
  }));
  return {
    rows: gateRows,
    limits: settings
      ? {
          quietHoursStart: settings.quiet_hours_start.slice(0, 5),
          quietHoursEnd: settings.quiet_hours_end.slice(0, 5),
          dailySendLimitPerLead: settings.daily_send_limit_per_lead,
          queueWaitLimitMinutes: settings.queue_wait_limit_minutes,
          reviewedAt: settings.reviewed_at,
        }
      : DEFAULT_GATE_LIMITS,
    choice: (actionType: string) => effectiveGate(gateRows, actionType),
  };
}

export type GateChange = {
  id: string;
  at: string;
  actorLabel: string;
  actionType: string | null;
  field: string;
  fromValue: string | null;
  toValue: string | null;
};

export async function loadGateHistory(db: GhlDb, orgId: string, limit = 50): Promise<GateChange[]> {
  const { data } = await db
    .from("approval_gate_changes")
    .select("id, created_at, actor_label, action_type, field, from_value, to_value")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    at: row.created_at,
    actorLabel: row.actor_label,
    actionType: row.action_type,
    field: row.field,
    fromValue: row.from_value,
    toValue: row.to_value,
  }));
}

export function gateSummary(state: GateState) {
  return ACTION_TYPES.map((type) => ({ type, choice: state.choice(type.id) }));
}

/** Plain rows for the settings form and the onboarding step. */
export function gateFormRows(state: GateState) {
  return gateSummary(state).map(({ type, choice }) => ({
    id: type.id,
    group: type.group,
    label: type.label,
    description: type.description,
    reachesPeople: type.reachesPeople,
    mode: choice.mode,
    approver: choice.approver,
  }));
}
