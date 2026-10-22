import { describe, expect, it, vi } from "vitest";

import { mappingProblems } from "@/lib/spine/contract";
import { airtableConnector, readAirtableSetup } from "@/lib/spine/connectors/airtable";
import { fathomConnector } from "@/lib/spine/connectors/fathom";
import { firefliesConnector } from "@/lib/spine/connectors/fireflies";
import { hubspotConnector } from "@/lib/spine/connectors/hubspot";
import type { Fetch } from "@/lib/spine/connectors/shared";

type Route = (url: URL, init: RequestInit | undefined) => { status?: number; body?: unknown };

function fake(route: Route) {
  const seen: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({ url: url.toString(), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : null });
    const out = route(url, init);
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200 });
  });
  return { fetch: impl as unknown as Fetch, seen };
}

const NOW = () => new Date("2026-10-22T15:00:00Z");
const credential = async () => "fake-token";

describe("HubSpot", () => {
  const contact = (id: string, email: string) => ({
    id,
    properties: { firstname: "Pat", lastname: "Sample", email, phone: "(415) 555-0100", lifecyclestage: "lead", hs_lead_status: "NEW", lastmodifieddate: "2026-10-01T10:00:00Z" },
  });

  it("imports history in pages, marked historic, keyed by the CRM id", async () => {
    const { fetch, seen } = fake((url) =>
      url.searchParams.get("after") ? { body: { results: [contact("2", "two@example.com")] } } : { body: { results: [contact("1", "one@example.com")], paging: { next: { after: "abc" } } } },
    );
    const connector = hubspotConnector({ fetch, credential, now: NOW });
    const first = await connector.importHistory({ connectionId: "c1", cursor: null });
    expect(first).toMatchObject({ cursor: "abc", done: false });
    expect(first.events[0]).toMatchObject({ source: "hubspot", kind: "person", historic: true, person: { crm: { system: "hubspot", id: "1" }, email: "one@example.com" } });
    const second = await connector.importHistory({ connectionId: "c1", cursor: first.cursor });
    expect(second.done).toBe(true);
    expect(seen[0].headers.authorization).toBe("Bearer fake-token");
  });

  it("syncs live changes since the cursor, not marked historic", async () => {
    const { fetch, seen } = fake(() => ({ body: { results: [contact("3", "three@example.com")] } }));
    const page = await hubspotConnector({ fetch, credential, now: NOW }).sync({ connectionId: "c1", cursor: "2026-09-30T00:00:00.000Z|" });
    expect(page.events[0].historic).toBe(false);
    expect(page.cursor).toBe("2026-10-01T10:00:00Z|");
    expect((seen[0].body as { filterGroups: Array<{ filters: Array<{ value: string }> }> }).filterGroups[0].filters[0].value).toBe(String(Date.parse("2026-09-30T00:00:00.000Z")));
  });

  it("maps known fields and leaves the rest for a person", async () => {
    const { fetch } = fake(() => ({ body: { results: [{ name: "email" }, { name: "favorite_color" }] } }));
    const mappings = await hubspotConnector({ fetch, credential }).mapFields({ connectionId: "c1" });
    expect(mappingProblems(mappings)).toEqual({ unmapped: ["favorite_color"], conflicts: [] });
  });

  it("asks for a reconnect when the token is refused", async () => {
    const { fetch } = fake(() => ({ status: 401 }));
    expect(await hubspotConnector({ fetch, credential }).health({ connectionId: "c1" })).toMatchObject({ state: "needs_attention", reconnect: true });
  });

  it("asks only for read scopes when connecting", async () => {
    const { fetch } = fake(() => ({}));
    const { authorizeUrl } = await hubspotConnector({ fetch, credential, clientId: "client" }).connect({ orgId: "o", redirectUri: "https://app.example.com/cb", state: "s" });
    expect(new URL(authorizeUrl).searchParams.get("scope")).not.toContain("write");
  });
});

describe("Fathom", () => {
  it("records one call per external attendee and never copies titles, summaries or transcripts", async () => {
    const { fetch, seen } = fake(() => ({
      body: {
        items: [
          {
            recording_id: 77,
            title: "Discovery with Pat",
            default_summary: "Secret summary text",
            transcript: [{ text: "Private words" }],
            recording_start_time: "2026-10-20T15:00:00Z",
            recording_end_time: "2026-10-20T15:30:00Z",
            calendar_invitees: [
              { email: "rep@vendor.example", is_external: false },
              { email: "Pat@Example.com", is_external: true },
            ],
          },
        ],
        next_cursor: null,
      },
    }));
    const page = await fathomConnector({ fetch, credential, now: NOW }).importHistory({ connectionId: "c1", cursor: null });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ kind: "call", historic: true, person: { attendeeEmail: "pat@example.com" }, fields: { duration_seconds: 1800 } });
    const text = JSON.stringify(page.events);
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("Private");
    expect(text).not.toContain("Discovery");
    expect(seen[0].headers["x-api-key"]).toBe("fake-token");
  });
});

describe("Fireflies", () => {
  it("asks for metadata only and skips the organizer", async () => {
    const { fetch, seen } = fake(() => ({
      body: { data: { transcripts: [{ id: "t1", date: Date.parse("2026-10-21T14:00:00Z"), duration: 25, organizer_email: "rep@vendor.example", meeting_attendees: [{ email: "rep@vendor.example" }, { email: "lee@example.com" }] }] } },
    }));
    const page = await firefliesConnector({ fetch, credential, now: NOW }).importHistory({ connectionId: "c1", cursor: null });
    expect(page.done).toBe(true);
    expect(page.events.map((event) => event.person?.attendeeEmail)).toEqual(["lee@example.com"]);
    expect(page.events[0].fields.duration_seconds).toBe(1500);
    const query = (seen[0].body as { query: string }).query;
    expect(query).not.toMatch(/sentences|summary|title/);
  });
});

describe("Airtable", () => {
  const setup = async () => ({ baseId: "appFake1234", table: "People", emailField: "Email", nameField: "Name" });

  it("needs a base and table before it reads anything", async () => {
    const { fetch, seen } = fake(() => ({}));
    const health = await airtableConnector({ fetch, credential, setup: async () => ({}) }).health({ connectionId: "c1" });
    expect(health).toMatchObject({ state: "needs_attention", reconnect: false });
    expect(seen).toHaveLength(0);
    expect(readAirtableSetup({ baseId: "not-a-base", table: "People" })).toBeNull();
  });

  it("reads only the chosen columns", async () => {
    const { fetch } = fake(() => ({ body: { records: [{ id: "rec1", createdTime: "2026-01-01T00:00:00.000Z", fields: { Email: "kim@example.com", Name: "Kim", Notes: "Long private notes" } }] } }));
    const page = await airtableConnector({ fetch, credential, setup, now: NOW }).importHistory({ connectionId: "c1", cursor: null });
    expect(page.events[0]).toMatchObject({ historic: true, person: { email: "kim@example.com", crm: { system: "airtable", id: "rec1" } }, fields: { name: "Kim" } });
    expect(JSON.stringify(page.events)).not.toContain("private");
  });
});
