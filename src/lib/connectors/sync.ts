import "server-only";

import { keepCalendarEvent, type CalendarEventInput } from "@/lib/connectors/calendar-match";
import { readAccessToken, readApiKey, setConnectionStatus, type ConnectionRow } from "@/lib/connectors/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Loose = {
  from: (table: string) => {
    select: (q?: string) => LooseQuery;
    upsert: (row: object, options?: { onConflict?: string }) => LooseQuery;
    update: (row: object) => LooseQuery;
  };
};
type LooseQuery = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  eq: (column: string, value: unknown) => LooseQuery;
  not: (column: string, op: string, value: null) => LooseQuery;
  limit: (count: number) => LooseQuery;
};

async function touch(connection: ConnectionRow, status?: "needs_reconnecting"): Promise<void> {
  const now = new Date().toISOString();
  const admin = getSupabaseAdmin() as unknown as Loose;
  await admin
    .from("workspace_connections")
    .update({
      last_full_check_at: now,
      last_update_at: status ? undefined : now,
      updated_at: now,
    })
    .eq("id", connection.id);
  if (status) {
    await setConnectionStatus({
      orgId: connection.org_id,
      connectionId: connection.id,
      status,
      detail: connection.test_mode
        ? "This calendar connection is in testing and needs to be reconnected about once a week until Google finishes its review."
        : null,
      action: "connection.needs_reconnecting",
    });
  }
}

export async function syncConnection(connection: ConnectionRow): Promise<void> {
  if (connection.connector_key === "google_calendar") {
    await syncGoogle(connection);
    return;
  }
  if (connection.connector_key === "airtable" || connection.connector_key === "hubspot") {
    const token = await readAccessToken(connection.id);
    if (!token) return;
    const url = connection.connector_key === "airtable"
      ? "https://api.airtable.com/v0/meta/bases"
      : "https://api.hubapi.com/account-info/v3/details";
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) {
      await touch(connection, "needs_reconnecting");
      return;
    }
    if (response.ok) await touch(connection);
    return;
  }
  if (connection.connector_key === "fathom" || connection.connector_key === "fireflies") {
    const key = await readApiKey(connection.id);
    if (!key.secret) return;
    const { testApiKey } = await import("@/lib/connectors/vendors");
    const tested = await testApiKey(connection.connector_key, key.secret);
    if (!tested.ok) {
      await touch(connection, "needs_reconnecting");
      return;
    }
    await touch(connection);
  }
}

async function syncGoogle(connection: ConnectionRow): Promise<void> {
  const token = await readAccessToken(connection.id);
  if (!token) return;
  const now = new Date();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", new Date(now.getTime() - 14 * 86400000).toISOString());
  url.searchParams.set("timeMax", new Date(now.getTime() + 14 * 86400000).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("fields", "items(id,status,start,end,summary,hangoutLink,location,attendees(email))");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) {
    await touch(connection, "needs_reconnecting");
    return;
  }
  if (!response.ok) return;
  const body = (await response.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      summary?: string;
      hangoutLink?: string;
      location?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      attendees?: Array<{ email?: string }>;
    }>;
  };
  const admin = getSupabaseAdmin() as unknown as Loose;
  const leads = await admin.from("leads").select("id, email").eq("org_id", connection.org_id).not("email", "is", null).limit(500);
  const known = new Map<string, string>();
  for (const lead of (leads.data as Array<{ id: string; email: string | null }> | null) ?? []) {
    if (lead.email) known.set(lead.email.toLowerCase(), lead.id);
  }
  for (const item of body.items ?? []) {
    const event: CalendarEventInput = {
      id: item.id ?? "",
      status: item.status ?? null,
      start: item.start?.dateTime ?? null,
      end: item.end?.dateTime ?? null,
      title: item.summary ?? null,
      description: null,
      hangoutLink: item.hangoutLink ?? null,
      location: item.location ?? null,
      attendees: (item.attendees ?? []).map((row) => ({ email: row.email ?? null })),
    };
    const kept = keepCalendarEvent(event, new Set(known.keys()));
    if (!kept || !kept.leadEmail) continue;
    const leadId = known.get(kept.leadEmail);
    if (!leadId) continue;
    await admin.from("calendar_blocks").upsert(
      {
        org_id: connection.org_id,
        source: "google_calendar",
        kind: "booked",
        starts_at: kept.start,
        ends_at: kept.end,
        member_id: connection.connected_by_member_id,
        lead_id: leadId,
        external_id: kept.externalId,
        meeting_kind: kept.meetingKind,
        event_status: kept.status,
      },
      { onConflict: "org_id,source,external_id" }
    );
  }
  await touch(connection);
}
