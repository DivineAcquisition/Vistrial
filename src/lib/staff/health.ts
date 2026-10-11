import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import {
  DEFAULT_HEALTH_RULES,
  type Health,
  type HealthFactor,
  type HealthLevel,
  type HealthRules,
  type RosterFacts,
} from "@/lib/staff/types";

/**
 * The health indicator, from recorded facts only. Each factor names the rule
 * that raised it, so staff can see why a workspace is flagged.
 *
 * Needs attention: a failing connection, an open escalation, an overdue
 * request, or (only for people who may see billing) a failed payment.
 * Watch: failed runs, the response target (only once the period has enough
 * leads to mean something), a draft waiting too long, or an agent paused by
 * someone other than the customer's Owner while the workspace is running.
 * Onboarding workspaces show the onboarding indicator instead, except that a
 * failing connection still needs attention.
 */

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  healthy: "Healthy",
  watch: "Watch",
  needs_attention: "Needs attention",
  onboarding: "Onboarding",
};

export const HEALTH_TONE: Record<HealthLevel, "good" | "warning" | "critical" | "brand"> = {
  healthy: "good",
  watch: "warning",
  needs_attention: "critical",
  onboarding: "brand",
};

export const HEALTH_ORDER: Record<HealthLevel, number> = {
  needs_attention: 0,
  watch: 1,
  onboarding: 2,
  healthy: 3,
};

export function parseHealthRules(value: unknown): HealthRules {
  const rules = { ...DEFAULT_HEALTH_RULES };
  if (!value || typeof value !== "object") return rules;
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(rules) as Array<keyof HealthRules>) {
    const incoming = source[key];
    if (typeof incoming === typeof rules[key]) {
      (rules as Record<string, unknown>)[key] = incoming;
    }
  }
  return rules;
}

function hoursSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? (now - at) / 3_600_000 : null;
}

function agentName(id: string): string {
  return AGENTS[id as LiveAgentId]?.name ?? id;
}

export function connectionFailing(facts: Pick<RosterFacts, "crm_status" | "crm_expired" | "sources_failing">): boolean {
  return facts.crm_status === "broken" || facts.crm_expired || facts.sources_failing > 0;
}

export function computeHealth(facts: RosterFacts, rules: HealthRules, now: number = Date.now()): Health {
  const attention: HealthFactor[] = [];
  const watch: HealthFactor[] = [];
  const info: HealthFactor[] = [];

  if (rules.connection_failing && connectionFailing(facts)) {
    const parts: string[] = [];
    if (facts.crm_expired) parts.push("the CRM sign-in expired");
    else if (facts.crm_status === "broken") parts.push("the CRM connection is failing");
    if (facts.sources_failing > 0) {
      parts.push(facts.sources_failing === 1 ? "1 lead source is failing" : `${facts.sources_failing} lead sources are failing`);
    }
    attention.push({
      key: "connection_failing",
      level: "needs_attention",
      label: "A connection is failing",
      detail: `${parts.join(", and ")}.`.replace(/^./, (c) => c.toUpperCase()),
    });
  }

  if (facts.status === "onboarding") {
    const updated = hoursSince(facts.onboarding_updated_at ?? facts.created_at, now);
    if (updated !== null && updated / 24 >= rules.onboarding_stall_days) {
      info.push({
        key: "onboarding_stall",
        level: "info",
        label: "Setup has not moved",
        detail: `No setup step changed in ${Math.floor(updated / 24)} days (rule: ${rules.onboarding_stall_days}).`,
      });
    }
    if (attention.length) return { level: "needs_attention", factors: [...attention, ...info] };
    return { level: "onboarding", factors: info };
  }

  if (facts.status === "closed") {
    return { level: "healthy", factors: [] };
  }

  if (rules.open_escalation && facts.open_escalations > 0) {
    attention.push({
      key: "open_escalation",
      level: "needs_attention",
      label: facts.open_escalations === 1 ? "An escalation is open" : `${facts.open_escalations} escalations are open`,
      detail: "Alerts reached the Vistrial team and nobody resolved them yet.",
    });
  }

  if (rules.request_overdue && (facts.requests_overdue > 0 || facts.requests_escalated > 0)) {
    const n = Math.max(facts.requests_overdue, facts.requests_escalated);
    attention.push({
      key: "request_overdue",
      level: "needs_attention",
      label: n === 1 ? "A request is overdue" : `${n} requests are overdue`,
      detail: "A customer question passed the business-hours target without a reply.",
    });
  }

  if (rules.payment_failed && facts.billing_visible && facts.payment_failed_at) {
    attention.push({
      key: "payment_failed",
      level: "needs_attention",
      label: "A payment failed",
      detail: "The last payment to Vistrial did not go through.",
    });
  }

  if (facts.failed_runs_24h >= rules.failed_runs_24h) {
    watch.push({
      key: "failed_runs",
      level: "watch",
      label: `${facts.failed_runs_24h} agent runs could not finish`,
      detail: `In the last 24 hours, not yet reviewed (rule: ${rules.failed_runs_24h} or more).`,
    });
  }

  if (facts.response_decided >= rules.response_min_leads) {
    const percent = (facts.response_within / facts.response_decided) * 100;
    if (percent < rules.response_met_percent) {
      watch.push({
        key: "response_target",
        level: "watch",
        label: `${Math.round(percent)}% of leads reached in time`,
        detail: `${facts.response_within} of ${facts.response_decided} leads in the last ${rules.response_period_days} days (target: ${rules.response_met_percent}%).`,
      });
    }
  }

  const oldest = hoursSince(facts.oldest_pending_at, now);
  if (oldest !== null && oldest >= rules.draft_oldest_hours) {
    watch.push({
      key: "draft_waiting",
      level: "watch",
      label: "A draft is waiting for approval",
      detail: `The oldest has waited ${Math.floor(oldest)} hours (rule: ${rules.draft_oldest_hours}).`,
    });
  }

  if (rules.agent_paused_watch && facts.status === "active") {
    const paused = facts.paused_agents.filter((agent) => !agent.by_owner && !agent.platform);
    if (paused.length) {
      watch.push({
        key: "agent_paused",
        level: "watch",
        label: paused.length === 1 ? `${agentName(paused[0]!.agent)} is paused` : `${paused.length} agents are paused`,
        detail: paused
          .map((agent) => `${agentName(agent.agent)}${agent.by_name ? ` by ${agent.by_name}` : ""}${agent.reason ? `: ${agent.reason}` : ""}`)
          .join("; "),
      });
    }
  }

  if (attention.length) return { level: "needs_attention", factors: [...attention, ...watch] };
  if (watch.length) return { level: "watch", factors: watch };
  return { level: "healthy", factors: [] };
}
