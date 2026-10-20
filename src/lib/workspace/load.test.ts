import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import { fakeDb } from "@/lib/workspace/fake-db";
import type { HomeState } from "@/lib/workspace/home-state";
import { briefingFrom } from "@/lib/workspace/voice";

let db: ReturnType<typeof fakeDb>;
const compliance = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/onboarding/load", () => ({ loadCustomerView: async () => ({ wentLiveAt: "2026-09-01T00:00:00Z", textingEnabled: true, approach: {} }) }));
vi.mock("@/lib/compliance/dispatch", () => ({ complianceForDispatch: (...args: unknown[]) => compliance(...args) }));

const { loadBriefingFacts, loadCrewFacts, loadDecisions, loadWork } = await import("@/lib/workspace/load");

const NOW = Date.now();
const MIN = 60_000;
const ORG = "org-1";
const TZ = "America/New_York";
const iso = (ms: number) => new Date(ms).toISOString();

function ctx(role: AuthContext["workspaceRole"], overrides: Partial<{ canApprove: boolean; memberId: string }> = {}): AuthContext {
  const memberId = overrides.memberId ?? "m-me";
  return {
    user: { id: "u-1" } as AuthContext["user"],
    member: { id: memberId, canApprove: overrides.canApprove ?? false, displayName: "Jordan Reyes" } as AuthContext["member"],
    org: { id: ORG, name: "North Roofing", slug: "north", timezone: TZ, ghlLocationId: null, status: "active", isPlatformWorkspace: false },
    role: role === "operator" ? "setter" : role === "member" ? "member" : "owner",
    workspaceRole: role,
    isStaff: false,
    isPlatformAdmin: false,
    staffMayApprove: false,
    platformRole: null,
    templateAccess: false,
    lostWorkspace: false,
    memberships: [],
    cookieNeedsReset: false,
  } as AuthContext;
}

function home(overrides: Partial<HomeState["prefs"]> = {}, snoozed: string[] = []): HomeState {
  return {
    available: true,
    enabled: true,
    outcomeMetrics: ["bookings"],
    prefs: { collapsed: [], workOrder: "best", workScope: "auto", firstSeenAt: null, welcomeDismissedAt: null, ...overrides },
    visit: { sinceAt: NOW - 86_400_000, capped: false, firstViewToday: true, firstVisit: false, next: { lastVisitAt: NOW, visitDay: "x", sinceAt: null, briefingSeenDay: null } },
    snoozedLeadIds: snoozed,
    briefings: [],
    day: "2026-10-20",
    now: NOW,
  };
}

function lead(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    org_id: ORG,
    first_name: id.toUpperCase(),
    last_name: "Lead",
    email: null,
    phone: "+15550000000",
    status: "working",
    created_at: iso(NOW - 3 * 86_400_000),
    do_not_contact: false,
    is_test: false,
    merged_into: null,
    assigned_setter_id: "m-me",
    assigned_closer_id: null,
    first_human_touch_at: null,
    ...extra,
  };
}

function score(id: string, value: number, tier: string, extra: Record<string, unknown> = {}) {
  return { lead_id: id, org_id: ORG, score: value, tier, contactable: true, historic: false, ...extra };
}

function seedWork() {
  db = fakeDb({
    leads: [
      lead("l1"),
      lead("l2"),
      lead("l3", { assigned_setter_id: "m-other" }),
      lead("l4", { do_not_contact: true }),
      lead("l5"),
      lead("l6", { is_test: true }),
      lead("l7", { status: "closed_won" }),
      lead("l8"),
      lead("l9"),
      lead("l10", { assigned_setter_id: null }),
    ],
    lead_scores: [
      score("l1", 90, "hot"),
      score("l2", 60, "warm"),
      score("l3", 95, "hot"),
      score("l4", 99, "hot"),
      score("l5", 98, "hot"),
      score("l6", 97, "hot"),
      score("l7", 96, "hot"),
      score("l8", 94, "hot", { historic: true }),
      score("l9", 20, "cool"),
      score("l10", 70, "warm"),
    ],
    lead_opt_outs: [{ lead_id: "l5", opted_out_at: iso(NOW - MIN) }],
    sentry_clocks: [
      { id: "c9", org_id: ORG, lead_id: "l9", kind: "first_touch", state: "missed", deadline_at: iso(NOW - 8 * MIN), reason: "No reply yet", resolved_at: null },
      { id: "c3", org_id: ORG, lead_id: "l3", kind: "first_touch", state: "at_risk", deadline_at: iso(NOW + 5 * MIN), reason: null, resolved_at: null },
    ],
    next_actions: [
      { id: "t1", org_id: ORG, owner_member_id: "m-me", status: "open", due_at: iso(NOW - 30 * MIN), action_text: "Call back about the estimate", source_kind: "sentry", lead_id: "l2" },
      { id: "t2", org_id: ORG, owner_member_id: "m-other", status: "open", due_at: iso(NOW - 30 * MIN), action_text: "Not mine", source_kind: "person", lead_id: null },
    ],
    queue_rows: [{ id: "l1", score_reasoning: "Booked an estimate for Thursday" }],
  });
}

describe("Due now and Work next from a seeded workspace", () => {
  beforeEach(seedWork);

  it("keeps the person's own leads, drops do-not-contact, opted-out, test, closed, and history-only leads", async () => {
    const work = await loadWork(ctx("owner"), home());
    expect(work.scope).toBe("mine");
    expect(work.dueNow.map((row) => row.leadId)).toEqual(["l9"]);
    expect(work.workNext.map((row) => row.leadId)).toEqual(["l1", "l2"]);
    expect(work.workNext[0].reason).toBe("Booked an estimate for Thursday");
    expect(work.tasks.map((row) => row.id)).toEqual(["t1"]);
  });

  it("keeps Sentry's due-now lead above higher-scoring leads", async () => {
    const work = await loadWork(ctx("owner"), home({ workScope: "everyone" }));
    expect(work.dueNow.map((row) => row.leadId)).toEqual(["l9", "l3"]);
    expect(work.workNext.map((row) => row.leadId)).not.toContain("l3");
    expect(work.workNext.map((row) => row.leadId)).toEqual(["l1", "l10", "l2"]);
  });

  it("gives Operators only their own and unassigned leads, with no switch to everyone", async () => {
    const work = await loadWork(ctx("operator"), home({ workScope: "everyone" }));
    expect(work.canSeeEveryone).toBe(false);
    expect(work.scope).toBe("mine");
    expect(work.workNext.map((row) => row.leadId)).toEqual(["l1", "l10", "l2"]);
    expect(work.dueNow.map((row) => row.leadId)).toEqual(["l9"]);
  });

  it("hides a snoozed lead from this person's list only", async () => {
    const work = await loadWork(ctx("owner"), home({}, ["l1"]));
    expect(work.workNext.map((row) => row.leadId)).toEqual(["l2"]);
  });
});

describe("briefing from saved records", () => {
  it("matches the seeded counts exactly and keeps imported history silent", async () => {
    const since = NOW - 86_400_000;
    db = fakeDb({
      leads: [
        ...Array.from({ length: 4 }, (_, index) => lead(`n${index}`, { created_at: iso(since + MIN * (index + 1)) })),
        ...Array.from({ length: 30 }, (_, index) => lead(`h${index}`, { created_at: iso(since + MIN) })),
        lead("t", { created_at: iso(since + MIN), is_test: true }),
      ],
      lead_import_marks: Array.from({ length: 30 }, (_, index) => ({ lead_id: `h${index}`, reactivated_at: null })),
      agent_activity_runs: [
        ...Array.from({ length: 3 }, (_, index) => ({ id: `s${index}`, org_id: ORG, agent_id: "scribe", status: "completed", finished_at: iso(since + 10 * MIN) })),
        { id: "s-old", org_id: ORG, agent_id: "scribe", status: "completed", finished_at: iso(since - MIN) },
      ],
      case_files: [{ lead_id: "n0", org_id: ORG, status: "needs_review", updated_at: iso(since + 5 * MIN) }],
      sentry_alerts: [{ org_id: ORG, created_at: iso(since + 60 * MIN), resolved_at: iso(since + 75 * MIN) }],
      approval_items: [
        { org_id: ORG, agent_id: "relay", status: "pending", created_at: iso(since + MIN) },
        { org_id: ORG, agent_id: "relay", status: "succeeded", created_at: iso(since + MIN) },
        { org_id: ORG, agent_id: "sentry", status: "pending", created_at: iso(since + MIN) },
      ],
      lead_score_history: [
        { org_id: ORG, lead_id: "n1", score: 80, previous_score: 55, tier: "hot", previous_tier: "warm", historic: false, created_at: iso(since + MIN) },
        { org_id: ORG, lead_id: "h1", score: 90, previous_score: null, tier: "hot", previous_tier: null, historic: true, created_at: iso(since + MIN) },
      ],
    });
    const facts = await loadBriefingFacts(ctx("owner"), iso(since), false, 1);
    expect(facts).toMatchObject({
      newLeads: 4,
      caseFiles: 3,
      caseFilesForReview: 1,
      sentryCaught: 1,
      sentryReached: 1,
      sentrySlowestMinutes: 15,
      relayDrafted: 2,
      relayWaiting: 1,
      relayApproved: 1,
      relaySent: 1,
      assayMovedUp: 1,
      assayNewlyHotIds: ["n1"],
      needYouToday: 1,
    });
    const briefing = briefingFrom({ ...facts, assayNewlyHot: ["N1 Lead"] }, NOW, TZ);
    expect(briefing.headline).toContain("4 new leads came in, 3 calls were processed, and 1 lead needs you today.");
    expect(briefing.lines.find((line) => line.agentId === "assay")?.text).toBe("1 lead moved up. N1 Lead became Hot.");
  });
});

describe("crew band facts", () => {
  it("counts what Sentry is watching and what Assay scored today", async () => {
    db = fakeDb({
      sentry_clocks: [
        { org_id: ORG, lead_id: "a", state: "on_time", deadline_at: iso(NOW + 40 * MIN), resolved_at: null },
        { org_id: ORG, lead_id: "b", state: "at_risk", deadline_at: iso(NOW + 12 * MIN), resolved_at: null },
        { org_id: ORG, lead_id: "c", state: "missed", deadline_at: iso(NOW - MIN), resolved_at: null },
        { org_id: ORG, lead_id: "d", state: "resolved", deadline_at: iso(NOW - MIN), resolved_at: iso(NOW) },
      ],
      agent_activity_runs: [{ org_id: ORG, agent_id: "scribe", status: "completed", finished_at: iso(NOW - 40 * MIN) }],
      lead_score_history: [
        { org_id: ORG, lead_id: "a", historic: false, created_at: iso(NOW - MIN) },
        { org_id: ORG, lead_id: "a", historic: false, created_at: iso(NOW - 2 * MIN) },
        { org_id: ORG, lead_id: "b", historic: false, created_at: iso(NOW - MIN) },
        { org_id: ORG, lead_id: "h", historic: true, created_at: iso(NOW - MIN) },
      ],
      lead_scores: [score("a", 80, "hot"), score("b", 40, "cool"), score("z", 90, "hot")],
    });
    const frame = { state: {} as never, wentLiveAt: null, imported: 0, sentry: { mode: "live" as const, watchFrom: null }, textingEnabled: true, agentTasks: "suggested" as const };
    const facts = await loadCrewFacts(ctx("owner"), frame);
    expect(facts.sentry.watching).toBe(3);
    expect(facts.sentry.nextDeadlineAt).toBe(iso(NOW + 12 * MIN));
    expect(facts.scribe.lastFinishedAt).toBe(iso(NOW - 40 * MIN));
    expect(facts.assay.scoredToday).toBeLessThanOrEqual(2);
    expect(facts.assay.hotNow).toBe(2);
    expect(facts.trustAutoRun).toEqual([]);
  });
});

describe("decisions", () => {
  beforeEach(() => {
    compliance.mockReset();
    db = fakeDb({
      approval_items: [{ id: "ap1", org_id: ORG, agent_id: "relay", lead_ids: ["l1"], status: "pending", created_at: iso(NOW - 5 * MIN) }],
      relay_drafts: [{ approval_item_id: "ap1", org_id: ORG, channel: "sms", body: "Hi", final_body: null, footer: "Reply STOP to opt out." }],
      leads: [lead("l1")],
      sentry_clocks: [{ lead_id: "l1", deadline_at: iso(NOW + 12 * MIN), state: "at_risk", resolved_at: null }],
      lead_scores: [score("l1", 90, "hot")],
      next_actions: [],
    });
  });

  const frame = { state: {} as never, wentLiveAt: null, imported: 0, sentry: { mode: "live" as const, watchFrom: null }, textingEnabled: true, agentTasks: "suggested" as const };

  it("shows the real send-time checks before approval, for people who can approve", async () => {
    compliance.mockResolvedValue({ action: "defer", reason: "quiet_hours", until: new Date(NOW + 3_600_000) });
    const data = await loadDecisions(ctx("owner"), frame);
    expect(data.canDecide).toBe(true);
    expect(data.meta.ap1).toMatchObject({ leadName: "L1 Lead", windowEndsAt: iso(NOW + 12 * MIN), tier: "hot" });
    expect(data.meta.ap1.checks.kind).toBe("quiet");
    expect(compliance).toHaveBeenCalledTimes(1);
  });

  it("says a block before anyone taps, and never runs checks for people who cannot approve", async () => {
    compliance.mockResolvedValue({ action: "block", reason: "opted_out" });
    expect((await loadDecisions(ctx("owner"), frame)).meta.ap1.checks).toEqual({ kind: "blocked", reason: "opted_out" });
    compliance.mockClear();
    const member = await loadDecisions(ctx("member", { canApprove: false }), frame);
    expect(member.canDecide).toBe(false);
    expect(member.meta.ap1.checks.kind).toBe("unknown");
    expect(compliance).not.toHaveBeenCalled();
  });

  it("refuses texts while the sending number is not ready", async () => {
    const data = await loadDecisions(ctx("owner"), { ...frame, textingEnabled: false });
    expect(data.meta.ap1.checks).toEqual({ kind: "blocked", reason: "sender_not_ready" });
  });
});
