/**
 * Turns calendar events into what Vistrial keeps: counts per week. No event title, description, guest
 * name or email address leaves these functions. Calendly's event type names (such as "Discovery call")
 * are kept, because they are the business's own labels, not a person's details.
 */

export const DAYS_BACK = 90;
export const DAYS_AHEAD = 30;

export type WeekCounts = {
  /** The Monday the week starts on, YYYY-MM-DD, in UTC. */
  week: string;
  booked: number;
  cancelled: number;
  /** Google Calendar: a guest declined. */
  declined?: number;
  /** Calendly: the host marked an invitee as a no-show. */
  noShow?: number;
};

export type BookingsSnapshot = {
  from: string;
  to: string;
  weeks: WeekCounts[];
  totals: { booked: number; cancelled: number; declined?: number; noShow?: number };
  /** Calendly only: counts by event type, largest first. */
  byType?: { name: string; booked: number; cancelled: number; noShow: number }[];
  /** Calendly only: how many past calls were checked for a no-show mark, of how many there were. */
  noShowChecked?: { checked: number; of: number };
  /** True when the provider had more events than one read takes. */
  truncated: boolean;
};

export function windowFor(now: number) {
  return { from: new Date(now - DAYS_BACK * 86_400_000), to: new Date(now + DAYS_AHEAD * 86_400_000) };
}

/** The Monday of the week a moment falls in, UTC. Null for something that is not a date. */
export function weekOf(iso: string | undefined | null) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const monday = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - ((at.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/** Mail providers anyone can sign up with. Two people at one of these are not colleagues. */
const SHARED_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com"]);

function domainOf(email: string | undefined | null) {
  const at = email?.lastIndexOf("@") ?? -1;
  return at > 0 ? email!.slice(at + 1).toLowerCase() : null;
}

export type GoogleEvent = {
  status?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean; resource?: boolean; responseStatus?: string }[];
};

/** Guests who are not the calendar's owner, a room, or a colleague on the owner's own domain. */
export function outsideGuests(event: GoogleEvent, ownerEmail: string) {
  const ownerDomain = domainOf(ownerEmail);
  return (event.attendees ?? []).filter((guest) => {
    if (guest.self || guest.resource) return false;
    const domain = domainOf(guest.email);
    if (!domain || guest.email?.toLowerCase() === ownerEmail.toLowerCase()) return false;
    if (domain.endsWith("calendar.google.com")) return false;
    return !ownerDomain || SHARED_DOMAINS.has(ownerDomain) || domain !== ownerDomain;
  });
}

function sorted(weeks: Map<string, WeekCounts>) {
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Google Calendar: meetings at a set time with at least one outside guest. Calendar records replies and
 * cancellations, not attendance, so there is no no-show count here.
 */
export function summarizeGoogle(events: GoogleEvent[], ownerEmail: string, now: number, truncated: boolean): BookingsSnapshot {
  const { from, to } = windowFor(now);
  const weeks = new Map<string, WeekCounts>();
  const totals = { booked: 0, cancelled: 0, declined: 0 };
  for (const event of events) {
    if (event.eventType && event.eventType !== "default") continue;
    // All-day entries are holidays and reminders, not calls.
    const week = weekOf(event.start?.dateTime);
    if (!week) continue;
    const guests = outsideGuests(event, ownerEmail);
    if (guests.length === 0) continue;
    const row = weeks.get(week) ?? { week, booked: 0, cancelled: 0, declined: 0 };
    row.booked++;
    totals.booked++;
    if (event.status === "cancelled") {
      row.cancelled++;
      totals.cancelled++;
    } else if (guests.every((guest) => guest.responseStatus === "declined")) {
      row.declined = (row.declined ?? 0) + 1;
      totals.declined++;
    }
    weeks.set(week, row);
  }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), weeks: sorted(weeks), totals, truncated };
}

export type CalendlyEvent = { uri?: string; name?: string; status?: string; start_time?: string };

/** The past, active calls whose invitees are worth checking for a no-show mark, newest first. */
export function noShowCandidates(events: CalendlyEvent[], now: number, limit: number) {
  const past = events
    .filter((event) => event.status === "active" && typeof event.uri === "string" && event.start_time && Date.parse(event.start_time) < now)
    .sort((a, b) => Date.parse(b.start_time!) - Date.parse(a.start_time!));
  return { check: past.slice(0, limit).map((event) => event.uri!), of: past.length };
}

/** Calendly: every scheduled event, with cancellations, and no-shows where the host marked one. */
export function summarizeCalendly(events: CalendlyEvent[], noShowUris: Set<string>, checked: { checked: number; of: number }, now: number, truncated: boolean): BookingsSnapshot {
  const { from, to } = windowFor(now);
  const weeks = new Map<string, WeekCounts>();
  const types = new Map<string, { name: string; booked: number; cancelled: number; noShow: number }>();
  const totals = { booked: 0, cancelled: 0, noShow: 0 };
  for (const event of events) {
    const week = weekOf(event.start_time);
    if (!week) continue;
    const name = (event.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Unnamed event type";
    const row = weeks.get(week) ?? { week, booked: 0, cancelled: 0, noShow: 0 };
    const type = types.get(name) ?? { name, booked: 0, cancelled: 0, noShow: 0 };
    row.booked++;
    type.booked++;
    totals.booked++;
    if (event.status === "canceled") {
      row.cancelled++;
      type.cancelled++;
      totals.cancelled++;
    } else if (event.uri && noShowUris.has(event.uri)) {
      row.noShow = (row.noShow ?? 0) + 1;
      type.noShow++;
      totals.noShow++;
    }
    weeks.set(week, row);
    types.set(name, type);
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    weeks: sorted(weeks),
    totals,
    byType: [...types.values()].sort((a, b) => b.booked - a.booked || a.name.localeCompare(b.name)).slice(0, 12),
    noShowChecked: checked,
    truncated,
  };
}

/** One line a reader can check against the page. */
export function describeBookings(providerName: string, snapshot: BookingsSnapshot) {
  const parts = [`${snapshot.totals.booked} booked`, `${snapshot.totals.cancelled} cancelled`];
  if (snapshot.totals.noShow !== undefined) parts.push(`${snapshot.totals.noShow} marked no-show`);
  if (snapshot.totals.declined !== undefined) parts.push(`${snapshot.totals.declined} declined by the guest`);
  return `${providerName}, ${snapshot.from} to ${snapshot.to}: ${parts.join(", ")}.`;
}
