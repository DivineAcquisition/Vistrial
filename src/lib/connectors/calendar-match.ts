export type CalendarEventInput = {
  id: string;
  status: string | null;
  start: string | null;
  end: string | null;
  title: string | null;
  description: string | null;
  hangoutLink: string | null;
  location: string | null;
  attendees: Array<{ email: string | null; name?: string | null }>;
};

export type KeptCalendarEvent = {
  externalId: string;
  start: string;
  end: string;
  status: "confirmed" | "canceled";
  leadEmail: string | null;
  meetingKind: "phone" | "video" | "in_person";
};

const SALES_TITLE = /consultation|estimate|discovery|sales call|strategy call/i;

/**
 * Keeps a sales event. Drops descriptions, notes, and other attendees.
 * No-show is never guessed from a calendar.
 */
export function keepCalendarEvent(
  event: CalendarEventInput,
  knownEmails: ReadonlySet<string>
): KeptCalendarEvent | null {
  if (!event.id || !event.start || !event.end) return null;
  const matched = event.attendees
    .map((row) => row.email?.trim().toLowerCase() ?? "")
    .find((email) => email && knownEmails.has(email));
  const salesTitle = Boolean(event.title && SALES_TITLE.test(event.title));
  if (!matched && !salesTitle) return null;
  const status = (event.status ?? "").toLowerCase() === "cancelled" || (event.status ?? "").toLowerCase() === "canceled"
    ? "canceled"
    : "confirmed";
  return {
    externalId: event.id,
    start: event.start,
    end: event.end,
    status,
    leadEmail: matched ?? null,
    meetingKind: meetingKind(event),
  };
}

function meetingKind(event: CalendarEventInput): "phone" | "video" | "in_person" {
  if (event.hangoutLink || /zoom|meet\.google|teams\.microsoft/i.test(event.location ?? "")) return "video";
  if (/phone|call/i.test(event.location ?? "") || /phone|call/i.test(event.title ?? "")) return "phone";
  return "in_person";
}

export function keptEventHasForbiddenFields(value: KeptCalendarEvent): boolean {
  const blob = JSON.stringify(value);
  return /description|attendee|notes|title/i.test(blob);
}
