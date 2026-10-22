import type { Connector, SpineEvent, SyncPage } from "@/lib/spine/contract";
import { normalizeEmail } from "@/lib/spine/identity";
import { getJson, healthFromError, requireCredential, scalar, type ConnectorDeps } from "@/lib/spine/connectors/shared";

const API = "https://api.fathom.ai/external/v1";

type Invitee = { email?: string | null; is_external?: boolean | null };
type Meeting = {
  recording_id: number | string;
  created_at?: string;
  recording_start_time?: string | null;
  recording_end_time?: string | null;
  scheduled_start_time?: string | null;
  calendar_invitees?: Invitee[];
};

/** One call event per external attendee. Titles, summaries and transcripts are never copied. */
function toEvents(meeting: Meeting, historic: boolean): SpineEvent[] {
  const occurredAt = meeting.recording_start_time ?? meeting.scheduled_start_time ?? meeting.created_at ?? new Date(0).toISOString();
  const start = meeting.recording_start_time ? Date.parse(meeting.recording_start_time) : NaN;
  const end = meeting.recording_end_time ? Date.parse(meeting.recording_end_time) : NaN;
  const durationSeconds = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 1000) : null;
  const external = (meeting.calendar_invitees ?? []).filter((invitee) => invitee.is_external !== false).map((invitee) => normalizeEmail(invitee.email)).filter((email): email is string => Boolean(email));
  const attendees = [...new Set(external)];
  return attendees.map((email) => ({
    source: "fathom",
    sourceId: `meeting:${meeting.recording_id}:${email}`,
    kind: "call" as const,
    occurredAt,
    historic,
    person: { source: "transcript" as const, attendeeEmail: email },
    fields: { meeting_id: scalar(String(meeting.recording_id)), duration_seconds: durationSeconds, attendee_count: attendees.length },
  }));
}

export function fathomConnector(deps: ConnectorDeps): Connector {
  const headers = async (connectionId: string) => ({ "x-api-key": await requireCredential(deps, connectionId) });

  async function page(connectionId: string, cursor: string | null, createdAfter: string | null, historic: boolean): Promise<SyncPage> {
    const url = new URL(`${API}/meetings`);
    if (cursor) url.searchParams.set("cursor", cursor);
    if (createdAfter) url.searchParams.set("created_after", createdAfter);
    const data = await getJson<{ items: Meeting[]; next_cursor?: string | null }>(deps.fetch, url.toString(), await headers(connectionId));
    const next = data.next_cursor ?? null;
    return { events: data.items.flatMap((meeting) => toEvents(meeting, historic)), cursor: next, done: !next };
  }

  return {
    key: "fathom",
    label: "Fathom",
    readScopes: ["meetings:read"],
    writeScopes: [],
    actions: ["calls.fetch_meeting"],

    async connect() {
      // Fathom uses an API key the Owner pastes on the Connections page, so there is no redirect.
      return { authorizeUrl: "" };
    },

    importHistory: ({ connectionId, cursor }) => page(connectionId, cursor, null, true),

    /** Cursor is "<created after ISO>|<page cursor>". */
    async sync({ connectionId, cursor }) {
      const [since, pageCursor] = (cursor ?? "").split("|");
      const after = since || new Date((deps.now?.() ?? new Date()).getTime() - 86_400_000).toISOString();
      const result = await page(connectionId, pageCursor || null, after, false);
      const newest = result.events.reduce((max, event) => (event.occurredAt > max ? event.occurredAt : max), after);
      return { ...result, cursor: result.cursor ? `${after}|${result.cursor}` : `${newest}|` };
    },

    async mapFields() {
      return [
        { vendorField: "calendar_invitees.email", spineField: "attendee_email", conflict: false },
        { vendorField: "recording_start_time", spineField: "occurred_at", conflict: false },
      ];
    },

    async health({ connectionId }) {
      try {
        await getJson(deps.fetch, `${API}/meetings`, await headers(connectionId));
        return { state: "healthy", lastSyncAt: (deps.now?.() ?? new Date()).toISOString() };
      } catch (error) {
        return healthFromError(error, null);
      }
    },

    async disconnect() {},
  };
}
