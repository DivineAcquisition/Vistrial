import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SalesCalendarScreen } from "@/components/calendar/sales-calendar";
import { buildSalesCalendar, EMPTY_FILTERS, type CalendarPayload } from "@/lib/calendar/model";

describe("sales calendar screen", () => {
  it("renders calls, drafts, and the quiet-hours line from sample records", () => {
    const built = buildSalesCalendar({
      orgId: "preview",
      timeZone: "America/New_York",
      now: new Date("2026-10-22T16:00:00.000Z"),
      range: { start: new Date("2026-10-19T00:00:00.000Z"), end: new Date("2026-11-02T00:00:00.000Z") },
      filters: EMPTY_FILTERS,
      hours: null,
      dailyCallTarget: 2,
      quietStart: "20:00",
      quietEnd: "08:00",
      reps: [{ id: "rep-a", name: "Ada North" }],
      leads: [
        {
          id: "lead-1",
          orgId: "preview",
          firstName: "Riley",
          lastName: "Sample",
          timeZone: "America/New_York",
          stage: "working",
          setterId: "rep-a",
          closerId: null,
          tier: "hot",
        },
      ],
      calls: [
        {
          id: "call-1",
          orgId: "preview",
          leadId: "lead-1",
          scheduledAt: "2026-10-22T18:00:00.000Z",
          occurredAt: null,
          durationSeconds: 1800,
          outcome: null,
          ranByMemberId: "rep-a",
        },
      ],
      blocks: [],
      tasks: [],
      drafts: [
        {
          itemId: "item-1",
          orgId: "preview",
          status: "pending",
          assignedMemberId: "rep-a",
          leadId: "lead-1",
          channel: "sms",
          sendAt: "2026-10-22T02:00:00.000Z",
        },
      ],
      windows: [],
      workflows: [],
    });
    const initial: CalendarPayload = {
      ...built,
      timeZone: "America/New_York",
      canPickRep: true,
      canCreateTask: true,
      canCreateHold: true,
      quietStart: "20:00",
      quietEnd: "08:00",
      filters: EMPTY_FILTERS,
    };
    const html = renderToString(<SalesCalendarScreen initial={initial} memberId="rep-a" />);
    expect(html).toContain("Call: Riley Sample");
    expect(html).toContain("Draft ready: Riley Sample");
    expect(html).toContain("Will send at 8:00 AM");
    expect(html).toContain("Approval is still needed");
    expect(html).not.toContain("please buy");
  });
});
