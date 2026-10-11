import { describe, expect, it } from "vitest";

import { computeHealth, parseHealthRules } from "@/lib/staff/health";
import { DEFAULT_HEALTH_RULES, type RosterFacts } from "@/lib/staff/types";

const NOW = Date.parse("2026-10-11T15:00:00Z");

function facts(patch: Partial<RosterFacts> = {}): RosterFacts {
  return {
    org_id: "org",
    name: "Northside",
    slug: "northside",
    status: "active",
    status_reason: null,
    is_platform_workspace: false,
    is_test_workspace: false,
    timezone: "America/New_York",
    created_at: "2026-01-01T00:00:00Z",
    template_id: null,
    template_name: null,
    went_live_at: "2026-02-01T00:00:00Z",
    onboarding_steps: null,
    onboarding_updated_at: null,
    primary_contact: null,
    assigned: [],
    response_decided: 0,
    response_within: 0,
    open_alerts: 0,
    open_escalations: 0,
    pending_approvals: 0,
    oldest_pending_at: null,
    crm_status: "active",
    crm_verified_at: null,
    crm_error: null,
    crm_expired: false,
    sources_failing: 0,
    sender_confirmed: true,
    domain_confirmed: true,
    carrier_status: "approved",
    billing_visible: false,
    billing_status: null,
    payment_failed_at: null,
    cancel_at_period_end: null,
    runs_24h: 0,
    failed_runs_24h: 0,
    paused_agents: [],
    requests_waiting: 0,
    requests_overdue: 0,
    requests_escalated: 0,
    oldest_request_at: null,
    data_requests_open: 0,
    last_activity_at: null,
    ...patch,
  };
}

const rules = DEFAULT_HEALTH_RULES;

describe("computeHealth", () => {
  it("is healthy with nothing wrong", () => {
    expect(computeHealth(facts(), rules, NOW)).toEqual({ level: "healthy", factors: [] });
  });

  it("needs attention for a failing connection, an escalation, or an overdue request", () => {
    expect(computeHealth(facts({ crm_status: "broken" }), rules, NOW).level).toBe("needs_attention");
    expect(computeHealth(facts({ crm_expired: true }), rules, NOW).level).toBe("needs_attention");
    expect(computeHealth(facts({ sources_failing: 2 }), rules, NOW).level).toBe("needs_attention");
    expect(computeHealth(facts({ open_escalations: 1 }), rules, NOW).level).toBe("needs_attention");
    expect(computeHealth(facts({ requests_overdue: 1 }), rules, NOW).level).toBe("needs_attention");
  });

  it("counts a failed payment only for someone who may see billing", () => {
    const failed = { payment_failed_at: "2026-10-10T00:00:00Z" };
    expect(computeHealth(facts({ ...failed, billing_visible: false }), rules, NOW).level).toBe("healthy");
    expect(computeHealth(facts({ ...failed, billing_visible: true }), rules, NOW).level).toBe("needs_attention");
  });

  it("uses the response target only once the period has at least 10 leads", () => {
    expect(computeHealth(facts({ response_decided: 9, response_within: 1 }), rules, NOW).level).toBe("healthy");
    const health = computeHealth(facts({ response_decided: 10, response_within: 7 }), rules, NOW);
    expect(health.level).toBe("watch");
    expect(health.factors[0]?.key).toBe("response_target");
    expect(computeHealth(facts({ response_decided: 10, response_within: 8 }), rules, NOW).level).toBe("healthy");
  });

  it("watches failed runs at the threshold and an old draft", () => {
    expect(computeHealth(facts({ failed_runs_24h: 2 }), rules, NOW).level).toBe("healthy");
    expect(computeHealth(facts({ failed_runs_24h: 3 }), rules, NOW).level).toBe("watch");
    expect(computeHealth(facts({ oldest_pending_at: "2026-10-10T14:00:00Z" }), rules, NOW).level).toBe("watch");
    expect(computeHealth(facts({ oldest_pending_at: "2026-10-11T00:00:00Z" }), rules, NOW).level).toBe("healthy");
  });

  it("does not watch an agent the Owner paused, or any pause while the workspace is paused", () => {
    const byOwner = { agent: "relay" as const, reason: null, by_owner: true, by_name: "Sam", at: null };
    const byStaff = { agent: "relay" as const, reason: "Bad drafts", by_owner: false, by_name: "Jordan M.", at: null };
    expect(computeHealth(facts({ paused_agents: [byOwner] }), rules, NOW).level).toBe("healthy");
    expect(computeHealth(facts({ paused_agents: [byStaff] }), rules, NOW).level).toBe("watch");
    expect(computeHealth(facts({ status: "paused", paused_agents: [byStaff] }), rules, NOW).level).toBe("healthy");
    expect(computeHealth(facts({ status: "closed", paused_agents: [byStaff] }), rules, NOW).level).toBe("healthy");
  });

  it("does not flag every workspace for a platform-wide halt", () => {
    const halt = { agent: "sentry" as const, reason: "Provider outage", by_owner: false, platform: true, by_name: "Malik", at: null };
    expect(computeHealth(facts({ paused_agents: [halt] }), rules, NOW).level).toBe("healthy");
  });

  it("shows onboarding, except a failing connection still needs attention", () => {
    const onboarding = facts({ status: "onboarding", open_escalations: 2, failed_runs_24h: 9 });
    expect(computeHealth(onboarding, rules, NOW).level).toBe("onboarding");
    expect(computeHealth({ ...onboarding, crm_status: "broken" }, rules, NOW).level).toBe("needs_attention");
  });

  it("notes a stalled onboarding without changing the indicator", () => {
    const stalled = computeHealth(
      facts({ status: "onboarding", onboarding_updated_at: "2026-10-01T00:00:00Z" }),
      rules,
      NOW
    );
    expect(stalled.level).toBe("onboarding");
    expect(stalled.factors.map((factor) => factor.key)).toEqual(["onboarding_stall"]);
  });

  it("follows edited thresholds", () => {
    const edited = parseHealthRules({ ...rules, failed_runs_24h: 1, response_min_leads: 2 });
    expect(computeHealth(facts({ failed_runs_24h: 1 }), edited, NOW).level).toBe("watch");
    expect(computeHealth(facts({ response_decided: 2, response_within: 0 }), edited, NOW).level).toBe("watch");
  });

  it("ignores unknown or mistyped rule values", () => {
    const parsed = parseHealthRules({ failed_runs_24h: "lots", extra: 1 });
    expect(parsed).toEqual(rules);
  });
});
