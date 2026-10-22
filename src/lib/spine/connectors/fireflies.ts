import type { Connector, SpineEvent, SyncPage } from "@/lib/spine/contract";
import { normalizeEmail } from "@/lib/spine/identity";
import { getJson, healthFromError, requireCredential, scalar, type ConnectorDeps } from "@/lib/spine/connectors/shared";

const API = "https://api.fireflies.ai/graphql";
const PAGE = 50;

/** Metadata only. The query never asks for sentences, summaries or titles. */
const QUERY = `query Transcripts($limit: Int, $skip: Int, $fromDate: DateTime) {
  transcripts(limit: $limit, skip: $skip, fromDate: $fromDate) {
    id
    date
    duration
    organizer_email
    meeting_attendees { email }
  }
}`;

type Transcript = { id: string; date: number | string | null; duration: number | null; organizer_email: string | null; meeting_attendees: Array<{ email: string | null }> | null };

function toEvents(row: Transcript, historic: boolean): SpineEvent[] {
  const occurredAt = row.date === null ? new Date(0).toISOString() : new Date(typeof row.date === "number" ? row.date : Date.parse(row.date)).toISOString();
  const organizer = normalizeEmail(row.organizer_email);
  const attendees = [...new Set((row.meeting_attendees ?? []).map((attendee) => normalizeEmail(attendee.email)).filter((email): email is string => Boolean(email) && email !== organizer))];
  return attendees.map((email) => ({
    source: "fireflies",
    sourceId: `transcript:${row.id}:${email}`,
    kind: "call" as const,
    occurredAt,
    historic,
    person: { source: "transcript" as const, attendeeEmail: email },
    fields: { meeting_id: scalar(row.id), duration_seconds: row.duration === null ? null : Math.round(row.duration * 60), attendee_count: attendees.length },
  }));
}

export function firefliesConnector(deps: ConnectorDeps): Connector {
  async function page(connectionId: string, skip: number, fromDate: string | null, historic: boolean): Promise<SyncPage> {
    const token = await requireCredential(deps, connectionId);
    const data = await getJson<{ data?: { transcripts?: Transcript[] } }>(deps.fetch, API, { authorization: `Bearer ${token}` }, {
      method: "POST",
      body: { query: QUERY, variables: { limit: PAGE, skip, fromDate } },
    });
    const rows = data.data?.transcripts ?? [];
    const done = rows.length < PAGE;
    return { events: rows.flatMap((row) => toEvents(row, historic)), cursor: done ? null : String(skip + rows.length), done };
  }

  return {
    key: "fireflies",
    label: "Fireflies",
    readScopes: ["transcripts:read"],
    writeScopes: [],
    actions: ["calls.fetch_meeting"],

    async connect() {
      // Fireflies uses an API key the Owner pastes on the Connections page.
      return { authorizeUrl: "" };
    },

    async importHistory({ connectionId, cursor }) {
      return page(connectionId, cursor ? Number(cursor) : 0, null, true);
    },

    /** Cursor is "<from date ISO>|<skip>". */
    async sync({ connectionId, cursor }) {
      const [since, skip] = (cursor ?? "").split("|");
      const from = since || new Date((deps.now?.() ?? new Date()).getTime() - 86_400_000).toISOString();
      const result = await page(connectionId, skip ? Number(skip) : 0, from, false);
      const newest = result.events.reduce((max, event) => (event.occurredAt > max ? event.occurredAt : max), from);
      return { ...result, cursor: result.cursor ? `${from}|${result.cursor}` : `${newest}|` };
    },

    async mapFields() {
      return [
        { vendorField: "meeting_attendees.email", spineField: "attendee_email", conflict: false },
        { vendorField: "date", spineField: "occurred_at", conflict: false },
      ];
    },

    async health({ connectionId }) {
      try {
        const token = await requireCredential(deps, connectionId);
        await getJson(deps.fetch, API, { authorization: `Bearer ${token}` }, { method: "POST", body: { query: "query { user { user_id } }" } });
        return { state: "healthy", lastSyncAt: (deps.now?.() ?? new Date()).toISOString() };
      } catch (error) {
        return healthFromError(error, null);
      }
    },

    async disconnect() {},
  };
}
