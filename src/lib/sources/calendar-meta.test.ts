import { describe, expect, it } from "vitest";

import {
  calendarBlockFromGhlEvent,
  calendarPayloadHasContent,
  stripCalendarPayload,
} from "@/lib/sources/calendar-meta";

describe("calendar metadata strip", () => {
  it("drops titles, descriptions, and attendees before anything is stored", () => {
    const stripped = stripCalendarPayload({
      id: "evt_1",
      start: { dateTime: "2026-08-01T15:00:00Z" },
      end: { dateTime: "2026-08-01T15:30:00Z" },
      summary: "Discovery call with Jane",
      description: "Talk about pricing",
      attendees: [{ email: "jane@example.test", displayName: "Jane" }],
      status: "confirmed",
    }) as Record<string, unknown>;
    expect(stripped.id).toBe("evt_1");
    expect(stripped.summary).toBeUndefined();
    expect(stripped.description).toBeUndefined();
    expect(stripped.attendees).toBeUndefined();
    expect(calendarPayloadHasContent(stripped)).toBe(false);
  });

  it("flags a payload that still has content fields", () => {
    expect(calendarPayloadHasContent({ title: "Secret" })).toBe(true);
    expect(calendarPayloadHasContent({ start: "2026-08-01T15:00:00Z" })).toBe(false);
  });

  it("builds a GHL booking from times and id only, dropping titles", () => {
    const block = calendarBlockFromGhlEvent(
      {
        id: "appt_1",
        startTime: "2026-08-01T15:00:00Z",
        endTime: "2026-08-01T15:30:00Z",
        title: "Discovery with Jane",
        notes: "Do not store this",
        attendees: [{ email: "jane@example.test" }],
      },
      "lead-1"
    );
    expect(block).toEqual({
      externalId: "appt_1",
      kind: "booked",
      startsAt: "2026-08-01T15:00:00.000Z",
      endsAt: "2026-08-01T15:30:00.000Z",
      leadId: "lead-1",
    });
  });
});
