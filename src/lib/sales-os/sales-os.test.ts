import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { draftFoundation, type DraftInputs } from "@/lib/foundation/draft";
import { FIELDS, confirmationCounts, fieldProblem, type StoredField } from "@/lib/foundation/fields";
import { businessDayOver, dayWindow, eodActivity, localDay, type ActivityRows } from "@/lib/manager/eod";
import { MIN_SAMPLE, coachingMoments, scorecard, type ScoreInputs } from "@/lib/manager/scorecard";
import { nowSummary } from "@/lib/sales-os/now";
import { askHref, askPageRedirect, salesOsRedirect, withoutRetiredPages } from "@/lib/sales-os/routes";
import { SALES_OS_HOME, salesOsNavigation } from "@/lib/shell/nav";

const ROOT = path.join(__dirname, "..", "..", "..");

const emptyInputs = (): DraftInputs => ({
  profile: null,
  crm: { stages: [], won: 0, decided: 0, dealCents: [] },
  calendar: { bookings90: 0, medianDaysToBooking: null },
  responseMinutes: null,
});

describe("Foundation", () => {
  it("drafts from industry defaults when there is no history, and says so", () => {
    const draft = draftFoundation(emptyInputs());
    expect(draft.get("business.sales_cycle_days")).toEqual({ value: 14, source: "industry_default" });
    expect(draft.get("goal.close_rate_pct")?.source).toBe("industry_default");
    expect(draft.has("goal.revenue_cents")).toBe(false);
  });

  it("uses the CRM close rate only with at least 20 decided deals", () => {
    const few = draftFoundation({ ...emptyInputs(), crm: { stages: [], won: 9, decided: MIN_SAMPLE - 1, dealCents: [] } });
    expect(few.get("goal.close_rate_pct")?.source).toBe("industry_default");
    const enough = draftFoundation({ ...emptyInputs(), crm: { stages: [], won: 5, decided: MIN_SAMPLE, dealCents: [100_00, 200_00, 300_00] } });
    expect(enough.get("goal.close_rate_pct")).toEqual({ value: 25, source: "crm" });
    expect(enough.get("goal.avg_deal_cents")).toEqual({ value: 200_00, source: "crm" });
  });

  it("every drafted value passes its own field check", () => {
    for (const [key, entry] of draftFoundation(emptyInputs())) expect(fieldProblem(key, entry.value)).toBeNull();
  });

  it("refuses personal traits and bare zip codes in the ideal customer", () => {
    expect(fieldProblem("icp.regions", ["94110"])).not.toBeNull();
    expect(fieldProblem("icp.regions", ["California"])).toBeNull();
    expect(fieldProblem("icp.roles", ["Married women over 40"])).not.toBeNull();
    expect(fieldProblem("icp.roles", ["Operations manager"])).toBeNull();
  });

  it("counts what is confirmed, drafted, and waiting on the Owner", () => {
    const fields = new Map<string, StoredField>([
      ["business.type", { key: "business.type", value: "saas", source: "owner", status: "confirmed" }],
      ["goal.period", { key: "goal.period", value: "month", source: "industry_default", status: "drafted" }],
    ]);
    expect(confirmationCounts({ fields, version: null })).toEqual({ confirmed: 1, drafted: 1, needsOwner: FIELDS.length - 2, total: FIELDS.length });
  });
});

describe("Now summary", () => {
  const now = Date.parse("2026-10-22T15:00:00Z");
  const base = { stage: "contacted", lastTouch: null, nextStep: null, ownerName: null, overdueSteps: 0, openAlerts: 0, playbookStep: null, waitingApprovals: 0, seenAt: null, changes: [], now };

  it("states the plain facts and marks a first look", () => {
    const summary = nowSummary(base);
    expect(summary.firstLook).toBe(true);
    expect(summary.lines).toContain("No one has reached this lead yet.");
    expect(summary.lines).toContain("No next step is set.");
  });

  it("lists only what changed since the last look, newest first", () => {
    const summary = nowSummary({
      ...base,
      seenAt: "2026-10-22T12:00:00Z",
      changes: [
        { at: "2026-10-22T10:00:00Z", label: "old" },
        { at: "2026-10-22T13:00:00Z", label: "first" },
        { at: "2026-10-22T14:00:00Z", label: "second" },
      ],
    });
    expect(summary.changed.map((change) => change.label)).toEqual(["second", "first"]);
  });

  it("flags an overdue next step", () => {
    const summary = nowSummary({ ...base, nextStep: { text: "Call back", dueAt: "2026-10-21T15:00:00Z" } });
    expect(summary.lines.some((line) => line.includes("(overdue)"))).toBe(true);
  });
});

describe("Helm", () => {
  const window = dayWindow("2026-10-21", "America/New_York");
  const at = "2026-10-21T16:00:00Z";
  const rows: ActivityRows = {
    touches: [
      { actor_member_id: "rep-a", channel: "call", direction: "outbound", type: "human", outcome: "connected", occurred_at: at },
      { actor_member_id: "rep-a", channel: "sms", direction: "outbound", type: "human", outcome: null, occurred_at: at },
      { actor_member_id: "rep-b", channel: "call", direction: "outbound", type: "human", outcome: "booked", occurred_at: at },
      { actor_member_id: "rep-a", channel: "call", direction: "outbound", type: "automated", outcome: null, occurred_at: at },
      { actor_member_id: "rep-a", channel: "call", direction: "outbound", type: "human", outcome: null, occurred_at: "2026-10-20T16:00:00Z" },
    ],
    calls: [{ ran_by_member_id: "rep-b", outcome: "held", occurred_at: at }],
    statusChanges: [{ actor_member_id: "rep-b", to_status: "closed_won", created_at: at }],
    tasksDone: [],
  };

  it("counts each rep's own activity for their local day only", () => {
    const activity = eodActivity(rows, ["rep-a", "rep-b", "rep-c"], window);
    expect(activity.get("rep-a")).toMatchObject({ dials: 1, conversations: 1, followUps: 1, booked: 0 });
    expect(activity.get("rep-b")).toMatchObject({ dials: 1, booked: 1, callsHeld: 1, closes: 1 });
    expect(activity.get("rep-c")).toMatchObject({ dials: 0, closes: 0 });
  });

  it("keeps one rep's numbers out of another's report", () => {
    const activity = eodActivity(rows, ["rep-a"], window);
    expect([...activity.keys()]).toEqual(["rep-a"]);
  });

  it("uses the workspace time zone for the day and the business-day cutoff", () => {
    expect(window).toEqual({ start: "2026-10-21T04:00:00.000Z", end: "2026-10-22T04:00:00.000Z" });
    expect(localDay(Date.parse("2026-10-22T02:00:00Z"), "America/New_York")).toBe("2026-10-21");
    expect(businessDayOver(Date.parse("2026-10-21T21:59:00Z"), "America/New_York", "18:00")).toBe(false);
    expect(businessDayOver(Date.parse("2026-10-21T22:00:00Z"), "America/New_York", "18:00")).toBe(true);
  });

  const inputs = (overrides: Partial<ScoreInputs["activity"]>): ScoreInputs => ({
    activity: { dials: 0, conversations: 0, followUps: 0, booked: 0, callsHeld: 0, noShows: 0, closes: 0, tasksDone: 0, ...overrides },
    days: 5,
    firstTouchSeconds: [],
    followUpsDue: 0,
    followUpsOnTime: 0,
  });

  it("shows no percentage under a sample of 20", () => {
    const small = scorecard("closer", inputs({ callsHeld: 19, closes: 10 }), null, 25).find((metric) => metric.key === "close_rate")!;
    expect(small.value).toBeNull();
    expect(small.hidden).toBe("Not enough yet (19 of 20)");
    const enough = scorecard("closer", inputs({ callsHeld: 20, closes: 6 }), null, 25).find((metric) => metric.key === "close_rate")!;
    expect(enough).toMatchObject({ value: "30%", status: "on_track" });
  });

  it("scales setter targets per day and closer targets per week", () => {
    const targets = { calls: 60, conversations: 15, followUps: 30, booked: 4, shows: 10, closes: 2 };
    expect(scorecard("setter", inputs({ dials: 100 }), targets, null).find((metric) => metric.key === "dials")).toMatchObject({ target: "300", status: "behind" });
    expect(scorecard("closer", inputs({ closes: 2 }), targets, null).find((metric) => metric.key === "closes")).toMatchObject({ target: "2", status: "on_track" });
  });

  it("links every coaching moment to its call, with no transcript text", () => {
    const moments = coachingMoments([
      { call_id: "call-1", lead_id: null, occurred_at: at, talk_ratio_rep: 0.8, open_question_count: 2, question_count: 4 },
      { call_id: "call-2", lead_id: null, occurred_at: at, talk_ratio_rep: 0.4, open_question_count: 0, question_count: 3 },
      { call_id: "call-3", lead_id: null, occurred_at: at, talk_ratio_rep: 0.4, open_question_count: 2, question_count: 3 },
    ]);
    expect(moments.map((moment) => moment.callId)).toEqual(["call-1", "call-2"]);
  });
});

describe("Sales OS routes", () => {
  it("moves Case File, onboarding and Forsight screens", () => {
    expect(salesOsRedirect("/app/cases")).toBe("/app/leads");
    expect(salesOsRedirect("/app/cases/6f1c2a8e-1b2c-4d3e-8f90-123456789abc")).toBe("/app/leads/6f1c2a8e-1b2c-4d3e-8f90-123456789abc");
    expect(salesOsRedirect("/app/cases/6f1c2a8e-1b2c-4d3e-8f90-123456789abc/files")).toBe("/app/leads/6f1c2a8e-1b2c-4d3e-8f90-123456789abc");
    expect(salesOsRedirect("/app/onboarding/step/crm")).toBe(SALES_OS_HOME);
    expect(salesOsRedirect("/app/forsight/pipeline")).toBe(SALES_OS_HOME);
    expect(salesOsRedirect("/app/today")).toBe(SALES_OS_HOME);
  });

  it("renders Ask inside a Sales OS workspace and sends everyone else to Compass", () => {
    expect(askPageRedirect(true, "6f1c2a8e-1b2c-4d3e-8f90-123456789abc")).toBeNull();
    expect(askPageRedirect(false, undefined)).toBe("/app/compass");
    expect(askPageRedirect(false, "6f1c2a8e-1b2c-4d3e-8f90-123456789abc")).toBe(
      "/app/compass?c=6f1c2a8e-1b2c-4d3e-8f90-123456789abc&legacy=1"
    );
    expect(askHref()).toBe("/app/ask");
    expect(askHref("  What's going on?  ")).toBe("/app/ask?q=What's%20going%20on%3F");
  });

  it("leaves every other screen alone", () => {
    for (const keep of ["/app/command", "/app/leads", "/app/settings", "/app/casework", "/app/forsighted"]) expect(salesOsRedirect(keep)).toBeNull();
  });

  it("drops roster links to replaced screens and keeps the rest", () => {
    const summary = { areas: [{ workPage: { href: "/app/cases" } }, { workPage: { href: "/app/leads" } }, { workPage: null }] };
    expect(withoutRetiredPages(summary).areas.map((area) => area.workPage?.href ?? null)).toEqual([null, "/app/leads", null]);
  });
});

describe("Sales OS navigation", () => {
  const ids = (role: Parameters<typeof salesOsNavigation>[0]["role"], manager = false) => {
    const nav = salesOsNavigation({ role, templateAccess: false, manager });
    return { rail: nav.groups.flatMap((group) => group.items.map((item) => item.id)), phone: nav.phone.map((item) => item.id), groups: nav.groups.map((group) => group.id) };
  };

  it("gives the Owner the full rail and the four phone tabs", () => {
    const owner = ids("owner");
    expect(owner.rail).toEqual(expect.arrayContaining(["foundation", "command", "ask", "so-leads", "so-team", "so-workflows", "so-actions", "so-connections", "so-settings"]));
    expect(owner.phone).not.toContain("ask");
    expect(owner.phone).toEqual(["command", "so-leads", "approvals", "agents-sheet"].filter((id) => owner.phone.includes(id)));
    expect(owner.phone).toHaveLength(4);
  });

  it("shows a Member the Team page only when an Owner made them a Manager", () => {
    expect(ids("member").rail).not.toContain("so-team");
    expect(ids("member", true).rail).toContain("so-team");
    expect(ids("member").rail).not.toContain("so-leads");
  });

  it("gives operators their own leads and scorecard, never Actions or Connections", () => {
    const operator = ids("operator");
    expect(operator.rail).toEqual(expect.arrayContaining(["command", "ask", "so-leads", "so-team"]));
    expect(operator.rail).not.toContain("so-actions");
    expect(operator.rail).not.toContain("so-connections");
  });

  it("puts the agent roster in every role's rail", () => {
    for (const role of ["owner", "member", "operator"] as const) expect(ids(role).groups).toContain("agents");
  });
});

describe("Sales OS copy", () => {
  it("has no em dashes in the new screens", () => {
    const files = [
      "src/app/(workspace)/app/command/page.tsx",
      "src/app/(workspace)/app/approvals/page.tsx",
      "src/app/(workspace)/app/actions/page.tsx",
      "src/app/(workspace)/app/actions/policy-actions.ts",
      "src/app/(workspace)/app/foundation/page.tsx",
      "src/app/(workspace)/app/foundation/foundation-editor.tsx",
      "src/app/(workspace)/app/manager/page.tsx",
      "src/app/(workspace)/app/leads/[id]/page.tsx",
      "src/components/sales-os/action-controls.tsx",
      "src/components/sales-os/lead-summary.tsx",
      "src/lib/actions/registry.ts",
      "src/lib/foundation/fields.ts",
      "src/lib/manager/eod.ts",
      "src/lib/manager/scorecard.ts",
      "src/lib/sales-os/now.ts",
    ];
    for (const file of files) expect({ file, dash: readFileSync(path.join(ROOT, file), "utf8").includes("\u2014") }).toEqual({ file, dash: false });
  });
});
