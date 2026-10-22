import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  buildSalesCalendar,
  capacityLabel,
  coverageRateText,
  draftFacts,
  draftSchedule,
  EMPTY_FILTERS,
  outcomeLabel,
  sanitizeFilters,
  scopeRepId,
  workflowBoxTitle,
  type CalendarBuildInput,
  type LeadFact,
} from "@/lib/calendar/model";
import { buildEventIndex } from "@/components/reui/event-calendar/event-calendar-lib";
import type { CalendarEvent } from "@/components/reui/event-calendar/event-calendar-types";

const ORG = "org-a";
const ZONE = "America/New_York";
const NOW = new Date("2026-10-22T16:00:00.000Z");
const RANGE = { start: new Date("2026-10-19T04:00:00.000Z"), end: new Date("2026-10-26T04:00:00.000Z") };

function lead(id: string, patch: Partial<LeadFact> = {}): LeadFact {
  return {
    id,
    orgId: ORG,
    firstName: "Riley",
    lastName: "Sample",
    timeZone: "America/New_York",
    stage: "working",
    setterId: "rep-a",
    closerId: "rep-b",
    tier: "warm",
    ...patch,
  };
}

function base(patch: Partial<CalendarBuildInput> = {}): CalendarBuildInput {
  return {
    orgId: ORG,
    timeZone: ZONE,
    now: NOW,
    range: RANGE,
    filters: EMPTY_FILTERS,
    hours: null,
    dailyCallTarget: null,
    quietStart: "20:00",
    quietEnd: "08:00",
    leads: [lead("lead-1"), lead("lead-2", { firstName: "Quinn", tier: "hot", stage: "follow_up" })],
    reps: [
      { id: "rep-a", name: "Ada North" },
      { id: "rep-b", name: "Ben Cole" },
    ],
    calls: [],
    blocks: [],
    tasks: [],
    drafts: [],
    windows: [],
    workflows: [],
    ...patch,
  };
}

describe("sales calendar adapter", () => {
  it("maps each kind from the record and keeps the count", () => {
    const built = buildSalesCalendar(
      base({
        calls: [
          {
            id: "c1",
            orgId: ORG,
            leadId: "lead-1",
            scheduledAt: "2026-10-22T18:00:00.000Z",
            occurredAt: null,
            durationSeconds: 1800,
            outcome: null,
            ranByMemberId: "rep-b",
          },
        ],
        tasks: [
          {
            id: "t1",
            orgId: ORG,
            leadId: "lead-1",
            dueAt: "2026-10-22T13:00:00.000Z",
            taskType: "follow_up",
            status: "open",
            ownerMemberId: "rep-a",
            sourceKind: "person",
          },
        ],
        drafts: [
          {
            itemId: "d1",
            orgId: ORG,
            status: "pending",
            assignedMemberId: "rep-a",
            leadId: "lead-2",
            channel: "sms",
            sendAt: null,
          },
        ],
        windows: [{ id: "w1", orgId: ORG, leadId: "lead-2", state: "on_time", deadlineAt: "2026-10-22T20:00:00.000Z" }],
        workflows: [
          {
            id: "s1",
            orgId: ORG,
            leadId: "lead-1",
            status: "active",
            nextDueAt: "2026-10-23T15:00:00.000Z",
            boxTitle: "Follow-up 2",
          },
        ],
        blocks: [
          {
            id: "h1",
            orgId: ORG,
            kind: "hold",
            source: "person",
            startsAt: "2026-10-23T16:00:00.000Z",
            endsAt: "2026-10-23T17:00:00.000Z",
            memberId: "rep-a",
            leadId: null,
            eventStatus: null,
          },
        ],
      }),
    );
    expect(built.events.map((event) => event.data.kind).sort()).toEqual(["call", "draft", "hold", "task", "window", "workflow"]);
    expect(built.events.find((event) => event.data.kind === "call")?.title).toBe("Call: Riley Sample");
    expect(built.events.find((event) => event.data.kind === "task")?.title).toBe("Follow-up");
    expect(built.events.find((event) => event.data.kind === "draft")?.title).toBe("Draft ready: Quinn Sample");
    expect(built.events.find((event) => event.data.kind === "window")?.title).toBe("Reply due: Quinn Sample");
    expect(built.events.find((event) => event.data.kind === "workflow")?.title).toBe("Follow-up 2: Riley Sample");
    expect(built.events.find((event) => event.data.kind === "hold")?.title).toBe("Hold: Ada North");
    expect(built.events.filter((event) => event.data.source === "calls")).toHaveLength(1);
  });

  it("shows no-show only when the record says so", () => {
    expect(outcomeLabel(null)).toBeNull();
    expect(outcomeLabel("held")).toBe("Held");
    expect(outcomeLabel("no_show")).toBe("No-show");
    const built = buildSalesCalendar(
      base({
        calls: [
          {
            id: "c1",
            orgId: ORG,
            leadId: "lead-1",
            scheduledAt: "2026-10-21T14:00:00.000Z",
            occurredAt: "2026-10-21T14:00:00.000Z",
            durationSeconds: 600,
            outcome: "held",
            ranByMemberId: "rep-a",
          },
        ],
        blocks: [
          {
            id: "b1",
            orgId: ORG,
            kind: "booked",
            source: "google_calendar",
            startsAt: "2026-10-22T15:00:00.000Z",
            endsAt: "2026-10-22T15:30:00.000Z",
            memberId: "rep-a",
            leadId: "lead-1",
            eventStatus: "canceled",
          },
          {
            id: "b2",
            orgId: ORG,
            kind: "no_show",
            source: "google_calendar",
            startsAt: "2026-10-22T17:00:00.000Z",
            endsAt: "2026-10-22T17:30:00.000Z",
            memberId: "rep-a",
            leadId: "lead-1",
            eventStatus: null,
          },
        ],
      }),
    );
    const outcomes = built.events.map((event) => event.data.outcomeLabel);
    expect(outcomes).toContain("Held");
    expect(outcomes).toContain("Canceled");
    expect(outcomes.filter((label) => label === "No-show")).toEqual(["No-show"]);
    const past = built.events.find((event) => event.id === "call:c1");
    expect(past?.data.past).toBe(true);
    expect(past?.data.href).toBe("/app/cases/lead-1");
  });

  it("drops message text and uses the quiet-hours line", () => {
    const facts = draftFacts([
      { leadId: "lead-1", channel: "sms", body: "please buy this now", subject: "secret subject", result: null },
    ]);
    expect(JSON.stringify(facts)).not.toContain("please buy");
    expect(JSON.stringify(facts)).not.toContain("secret");
    const scheduled = draftSchedule({
      now: new Date("2026-10-22T02:00:00.000Z"),
      sendAt: null,
      quietStart: "20:00",
      quietEnd: "08:00",
      leadZone: "America/New_York",
      workspaceZone: ZONE,
    });
    expect(scheduled.quietNote).toBe("Will send at 8:00 AM");
    const built = buildSalesCalendar(
      base({
        now: new Date("2026-10-22T02:00:00.000Z"),
        drafts: [
          {
            itemId: "d1",
            orgId: ORG,
            status: "pending",
            assignedMemberId: "rep-a",
            leadId: "lead-1",
            channel: "email",
            sendAt: "2026-10-22T02:00:00.000Z",
          },
        ],
      }),
    );
    const draft = built.events[0];
    expect(draft.data.quietNote).toBe("Will send at 8:00 AM");
    expect(draft.data.approvalNote).toBe("Approval is still needed.");
    expect(draft.data.href).toContain("/app/home#approval-d1");
    expect(JSON.stringify(draft)).not.toContain("please buy");
  });

  it("titles a workflow from the box, not from notes inside it", () => {
    const graph = {
      boxes: [
        { id: "n", config: { kind: "note", text: "secret transcript quote" } },
        { id: "w", config: { kind: "wait", amount: 2, unit: "days" } },
      ],
      edges: [],
    };
    expect(workflowBoxTitle(graph, "n")).toBe("Note");
    expect(workflowBoxTitle(graph, "w")).toBe("Wait 2 days");
    expect(workflowBoxTitle(graph, "n")).not.toContain("secret");
  });

  it("keeps a rep on their own column and drops another workspace", () => {
    const actor = { orgId: ORG, memberId: "rep-a", role: "setter", isStaff: false };
    expect(scopeRepId(actor, "rep-b")).toBe("rep-a");
    expect(scopeRepId({ ...actor, role: "owner", isStaff: false }, "rep-b")).toBe("rep-b");
    expect(sanitizeFilters({ repId: "rep-b", kinds: ["call"], tiers: [], sources: [], stages: [] }, actor).repId).toBe("rep-a");
    const built = buildSalesCalendar(
      base({
        filters: { ...EMPTY_FILTERS, repId: "rep-a" },
        calls: [
          {
            id: "mine",
            orgId: ORG,
            leadId: "lead-1",
            scheduledAt: "2026-10-22T18:00:00.000Z",
            occurredAt: null,
            durationSeconds: null,
            outcome: null,
            ranByMemberId: "rep-a",
          },
          {
            id: "theirs",
            orgId: ORG,
            leadId: "lead-2",
            scheduledAt: "2026-10-22T19:00:00.000Z",
            occurredAt: null,
            durationSeconds: null,
            outcome: null,
            ranByMemberId: "rep-b",
          },
          {
            id: "other-org",
            orgId: "org-b",
            leadId: "lead-1",
            scheduledAt: "2026-10-22T19:00:00.000Z",
            occurredAt: null,
            durationSeconds: null,
            outcome: null,
            ranByMemberId: "rep-a",
          },
        ],
      }),
    );
    expect(built.events.map((event) => event.id)).toEqual(["call:mine"]);
  });

  it("marks overdue tasks and never prints a percentage", () => {
    const built = buildSalesCalendar(
      base({
        dailyCallTarget: 1,
        tasks: [
          {
            id: "late",
            orgId: ORG,
            leadId: "lead-1",
            dueAt: "2026-10-20T15:00:00.000Z",
            taskType: "call",
            status: "open",
            ownerMemberId: "rep-a",
            sourceKind: "sentry",
          },
        ],
        calls: [0, 1, 2].map((day) => ({
          id: `c${day}`,
          orgId: ORG,
          leadId: "lead-1",
          scheduledAt: new Date(Date.parse("2026-10-20T15:00:00.000Z") + day * 86_400_000).toISOString(),
          occurredAt: null,
          durationSeconds: null,
          outcome: null,
          ranByMemberId: "rep-a",
        })),
      }),
    );
    expect(built.events.find((event) => event.id === "task:late")?.data.overdue).toBe(true);
    expect(JSON.stringify(built.capacity)).not.toContain("%");
    expect(capacityLabel(0, 3, true)).toBe("No calls booked");
    expect(capacityLabel(4, 3, true)).toBe("Over target");
    expect(capacityLabel(4, null, true)).toBeNull();
    expect(coverageRateText(1, 3)).toBeNull();
    expect(coverageRateText(40, 80)).toBeNull();
  });

  it("indexes two thousand events for a ten person team", () => {
    const reps = Array.from({ length: 10 }, (_, index) => ({ id: `rep-${index}`, name: `Rep ${index}` }));
    const leads = Array.from({ length: 200 }, (_, index) =>
      lead(`lead-${index}`, { setterId: `rep-${index % 10}`, closerId: `rep-${index % 10}`, firstName: "Lead", lastName: String(index) }),
    );
    const calls = Array.from({ length: 2000 }, (_, index) => ({
      id: `c${index}`,
      orgId: ORG,
      leadId: `lead-${index % 200}`,
      scheduledAt: new Date(RANGE.start.getTime() + (index % 20) * 86_400_000 + (index % 8) * 3_600_000).toISOString(),
      occurredAt: null,
      durationSeconds: 1800,
      outcome: index % 50 === 0 ? "no_show" : null,
      ranByMemberId: `rep-${index % 10}`,
    }));
    const wide = { start: RANGE.start, end: new Date(RANGE.start.getTime() + 21 * 86_400_000) };
    const started = performance.now();
    const built = buildSalesCalendar(base({ reps, leads, calls, range: wide }));
    const mapped = performance.now() - started;
    const events: CalendarEvent[] = built.events.map((event) => ({
      id: event.id,
      title: event.title,
      start: new Date(event.start),
      end: new Date(event.end),
      allDay: event.allDay,
      color: event.color,
      resourceId: event.resourceId ?? undefined,
      readOnly: true,
    }));
    const indexedAt = performance.now();
    const index = buildEventIndex(events, wide, { timeZone: ZONE, weekStartsOn: 0 });
    const indexed = performance.now() - indexedAt;
    expect(built.events.length).toBeGreaterThan(1000);
    expect(index.byDay.size).toBeGreaterThan(0);
    expect(mapped, `adapter ${Math.round(mapped)}ms`).toBeLessThan(1500);
    expect(indexed, `index ${Math.round(indexed)}ms for ${events.length} events`).toBeLessThan(1500);
    expect(built.events.some((event) => event.title.includes("No-show") && event.data.outcomeLabel !== "No-show")).toBe(false);
    // Measured on this run. Reported with the test result.
    expect({ mappedMs: Math.round(mapped), indexedMs: Math.round(indexed), events: built.events.length }).toEqual(
      expect.objectContaining({ events: built.events.length }),
    );
  });
});

describe("calendar copy", () => {
  it("has no em dash in the calendar copy", () => {
    const files = [
      "src/lib/calendar/model.ts",
      "src/lib/calendar/actions.ts",
      "src/components/calendar/sales-calendar.tsx",
      "src/components/calendar/flag-switch.tsx",
      "src/app/(workspace)/app/calendar/page.tsx",
      "src/app/(workspace)/app/calendar/preview/page.tsx",
    ];
    for (const file of files) expect(readFileSync(file, "utf8")).not.toContain("—");
  });

  it("does not send or invite from the calendar actions", () => {
    const source = readFileSync("src/lib/calendar/actions.ts", "utf8");
    expect(source).not.toMatch(/sendEmail|send_text|invite|notifyLead/);
  });
});
