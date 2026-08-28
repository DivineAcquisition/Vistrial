/**
 * Calendar ingest stores availability and booking metadata only.
 * Event titles, descriptions, attendee lists, emails, and notes are dropped
 * before anything is written.
 */
const FORBIDDEN =
  /title|summary|description|attendee|email|phone|notes|address|htmlLink|hangout|conference|comment|subject|name/i;

export type CalendarBlockDraft = {
  externalId: string;
  kind: "availability" | "booked" | "no_show";
  startsAt: string;
  endsAt: string;
  leadId?: string | null;
  memberId?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function stripCalendarPayload(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => stripCalendarPayload(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key)) continue;
    out[key] = stripCalendarPayload(nested, depth + 1);
  }
  return out;
}

export function calendarPayloadHasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key)) return true;
    if (calendarPayloadHasContent((value as Record<string, unknown>)[key])) return true;
  }
  return false;
}

function isoFromGhl(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const rec = asRecord(value);
  if (rec) {
    return isoFromGhl(rec.dateTime ?? rec.startTime ?? rec.start) ?? isoFromGhl(rec.date);
  }
  return null;
}

export function calendarBlockFromGhlEvent(
  raw: unknown,
  leadId: string | null
): CalendarBlockDraft | null {
  const source = asRecord(raw);
  if (!source) return null;
  const slim = {
    id: source.id,
    eventId: source.eventId,
    appointmentId: source.appointmentId,
    startTime: source.startTime,
    start: source.start,
    dateAdded: source.dateAdded,
    endTime: source.endTime,
    end: source.end,
    appointmentStatus: source.appointmentStatus,
    status: source.status,
  };
  const row = asRecord(stripCalendarPayload(slim));
  if (!row) return null;
  const id = asString(row.id) ?? asString(row.eventId) ?? asString(row.appointmentId);
  const start = isoFromGhl(row.startTime ?? row.start ?? row.dateAdded);
  const end = isoFromGhl(row.endTime ?? row.end) ?? (start ? new Date(Date.parse(start) + 30 * 60 * 1000).toISOString() : null);
  if (!id || !start || !end || end <= start) return null;
  const status = (asString(row.appointmentStatus) ?? asString(row.status) ?? "").toLowerCase();
  const kind: CalendarBlockDraft["kind"] =
    status.includes("noshow") || status.includes("no_show") || status === "no-show"
      ? "no_show"
      : "booked";
  return { externalId: id, kind, startsAt: start, endsAt: end, leadId };
}

export function calendarBlockFromFreeSlot(raw: unknown, calendarId: string, index: number): CalendarBlockDraft | null {
  const source = asRecord(raw);
  if (!source) return null;
  const slim = {
    startTime: source.startTime,
    start: source.start,
    from: source.from,
    endTime: source.endTime,
    end: source.end,
    to: source.to,
  };
  const row = asRecord(stripCalendarPayload(slim));
  if (!row) return null;
  const start = isoFromGhl(row.startTime ?? row.start ?? row.from);
  const end = isoFromGhl(row.endTime ?? row.end ?? row.to);
  if (!start || !end || end <= start) return null;
  return {
    externalId: `avail:${calendarId}:${start}:${index}`,
    kind: "availability",
    startsAt: start,
    endsAt: end,
  };
}

export function calendarBlockFromGoogleBusy(
  raw: unknown,
  calendarId: string,
  index: number
): CalendarBlockDraft | null {
  const row = asRecord(stripCalendarPayload(raw));
  if (!row) return null;
  const start = isoFromGhl(row.start);
  const end = isoFromGhl(row.end);
  if (!start || !end || end <= start) return null;
  return {
    externalId: `busy:${calendarId}:${start}:${index}`,
    kind: "booked",
    startsAt: start,
    endsAt: end,
  };
}
