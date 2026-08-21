import type { FollowUpChannel, RoutingContext, RoutingPredicate, RoutingRule, SequenceStep } from "@/lib/follow-up/types";
import { FOLLOW_UP_BRANCHES, FOLLOW_UP_CHANNELS } from "@/lib/follow-up/constants";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function contextValue(ctx: RoutingContext, field: RoutingPredicate["field"]): string | number | null {
  switch (field) {
    case "call_outcome":
      return ctx.callOutcome;
    case "next_step_state":
      return ctx.nextStepState;
    case "next_step_text":
      return ctx.nextStepText;
    case "stated_objection_state":
      return ctx.statedObjectionState;
    case "lead_status":
      return ctx.leadStatus;
    case "no_show_count":
      return ctx.noShowCount;
  }
}

export function predicateMatches(ctx: RoutingContext, pred: RoutingPredicate): boolean {
  const left = contextValue(ctx, pred.field);
  if (pred.op === "gte") {
    const n = typeof left === "number" ? left : Number(left);
    const right = typeof pred.value === "number" ? pred.value : Number(pred.value);
    return Number.isFinite(n) && Number.isFinite(right) && n >= right;
  }
  if (pred.op === "in") {
    const list = Array.isArray(pred.value) ? pred.value.map(String) : [String(pred.value)];
    return left != null && list.includes(String(left));
  }
  if (pred.op === "matches") {
    const pattern = Array.isArray(pred.value) ? pred.value.join("|") : String(pred.value);
    if (!pattern || left == null) return false;
    try {
      return new RegExp(pattern, "i").test(String(left));
    } catch {
      return false;
    }
  }
  const right = Array.isArray(pred.value) ? pred.value[0] : pred.value;
  if (pred.op === "neq") return String(left ?? "") !== String(right ?? "");
  return String(left ?? "") === String(right ?? "");
}

export function ruleMatches(ctx: RoutingContext, rule: RoutingRule): boolean {
  if (!rule.enabled) return false;
  if (!rule.match.all.length) return false;
  return rule.match.all.every((pred) => predicateMatches(ctx, pred));
}

/**
 * First enabled matching rule in priority order. Routing is data, not a
 * hardcoded switch on outcome.
 */
export function routeFollowUp(ctx: RoutingContext, rules: RoutingRule[]): RoutingRule | null {
  const ordered = [...rules].filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (ruleMatches(ctx, rule)) return rule;
  }
  return null;
}

function parsePredicate(value: unknown): RoutingPredicate | null {
  const row = asRecord(value);
  if (!row) return null;
  const field = asString(row.field);
  const op = asString(row.op);
  if (
    field !== "call_outcome" &&
    field !== "next_step_state" &&
    field !== "next_step_text" &&
    field !== "stated_objection_state" &&
    field !== "lead_status" &&
    field !== "no_show_count"
  ) {
    return null;
  }
  if (op !== "eq" && op !== "neq" && op !== "in" && op !== "matches" && op !== "gte") return null;
  if (row.value === undefined || row.value === null) return null;
  if (Array.isArray(row.value)) {
    const list = row.value.map((item) => String(item)).filter(Boolean);
    if (!list.length) return null;
    return { field, op, value: list };
  }
  if (typeof row.value === "number") return { field, op, value: row.value };
  const text = asString(row.value);
  if (!text) return null;
  return { field, op, value: text };
}

export function parseSequenceSteps(value: unknown): SequenceStep[] {
  if (!Array.isArray(value)) return [];
  const steps: SequenceStep[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const delay =
      typeof row.delayHours === "number"
        ? row.delayHours
        : typeof row.delay_hours === "number"
          ? row.delay_hours
          : Number(row.delayHours ?? row.delay_hours);
    if (!Number.isFinite(delay) || delay < 0) continue;
    const channelRaw = asString(row.channel);
    const channel =
      channelRaw === "sms" || channelRaw === "email" ? (channelRaw as FollowUpChannel) : undefined;
    steps.push({ delayHours: delay, channel });
  }
  return steps;
}

export function parseRoutingRule(value: unknown): RoutingRule | null {
  const row = asRecord(value);
  if (!row) return null;
  const branch = asString(row.branch);
  if (!branch || !(FOLLOW_UP_BRANCHES as readonly string[]).includes(branch)) return null;
  const channelRaw = asString(row.channel) ?? "sms";
  if (!(FOLLOW_UP_CHANNELS as readonly string[]).includes(channelRaw)) return null;
  const matchRow = asRecord(row.match);
  const allRaw = matchRow && Array.isArray(matchRow.all) ? matchRow.all : [];
  const all = allRaw.map(parsePredicate).filter((item): item is RoutingPredicate => item !== null);
  const priority = typeof row.priority === "number" ? row.priority : Number(row.priority);
  if (!Number.isInteger(priority)) return null;
  return {
    id: asString(row.id) ?? undefined,
    priority,
    branch: branch as RoutingRule["branch"],
    enabled: row.enabled !== false,
    match: { all },
    channel: channelRaw as FollowUpChannel,
    sequenceSteps: parseSequenceSteps(row.sequence_steps ?? row.sequenceSteps),
  };
}

export function boundedSequenceSteps(steps: SequenceStep[], maxLength: number): SequenceStep[] {
  const cap = Math.min(Math.max(maxLength, 1), 8);
  const normalized = steps.length > 0 ? steps : [{ delayHours: 0 }];
  return normalized.slice(0, cap).map((step, index) => ({
    delayHours: index === 0 ? Math.max(0, step.delayHours) : Math.max(step.delayHours, 0),
    channel: step.channel,
  }));
}
