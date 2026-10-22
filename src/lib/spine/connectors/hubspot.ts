import type { Connector, SpineEvent, SyncPage } from "@/lib/spine/contract";
import { getJson, healthFromError, mapKnown, requireCredential, scalar, type ConnectorDeps } from "@/lib/spine/connectors/shared";

const API = "https://api.hubapi.com";
const PAGE = 100;
const PROPERTIES = ["firstname", "lastname", "email", "phone", "lifecyclestage", "hs_lead_status", "hubspot_owner_id", "createdate", "lastmodifieddate"];
const KNOWN: Record<string, string> = {
  firstname: "first_name",
  lastname: "last_name",
  email: "email",
  phone: "phone",
  lifecyclestage: "stage",
  hs_lead_status: "status",
  hubspot_owner_id: "owner_external_id",
};

type Contact = { id: string; properties: Record<string, string | null>; updatedAt?: string; createdAt?: string };

function toEvent(contact: Contact, historic: boolean): SpineEvent {
  const p = contact.properties ?? {};
  const occurredAt = p.lastmodifieddate ?? contact.updatedAt ?? p.createdate ?? contact.createdAt ?? new Date(0).toISOString();
  return {
    source: "hubspot",
    sourceId: `contact:${contact.id}:${occurredAt}`,
    kind: "person",
    occurredAt,
    historic,
    person: { source: "crm", email: p.email ?? null, phone: p.phone ?? null, crm: { system: "hubspot", id: contact.id } },
    fields: {
      first_name: scalar(p.firstname),
      last_name: scalar(p.lastname),
      stage: scalar(p.lifecyclestage),
      status: scalar(p.hs_lead_status),
      owner_external_id: scalar(p.hubspot_owner_id),
    },
  };
}

export function hubspotConnector(deps: ConnectorDeps): Connector {
  const auth = async (connectionId: string) => ({ authorization: `Bearer ${await requireCredential(deps, connectionId)}` });

  return {
    key: "hubspot",
    label: "HubSpot",
    readScopes: ["crm.objects.contacts.read", "crm.objects.deals.read", "crm.objects.companies.read", "oauth"],
    writeScopes: ["crm.objects.contacts.write", "crm.objects.deals.write"],
    actions: ["crm.update_field", "crm.add_note", "crm.create_task", "crm.search", "crm.fetch_record"],

    async connect({ redirectUri, state }) {
      const url = new URL("https://app.hubspot.com/oauth/authorize");
      url.searchParams.set("client_id", deps.clientId ?? "");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", this.readScopes.join(" "));
      return { authorizeUrl: url.toString() };
    },

    async importHistory({ connectionId, cursor }): Promise<SyncPage> {
      const url = new URL(`${API}/crm/v3/objects/contacts`);
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("properties", PROPERTIES.join(","));
      if (cursor) url.searchParams.set("after", cursor);
      const page = await getJson<{ results: Contact[]; paging?: { next?: { after?: string } } }>(deps.fetch, url.toString(), await auth(connectionId));
      const next = page.paging?.next?.after ?? null;
      return { events: page.results.map((contact) => toEvent(contact, true)), cursor: next, done: !next };
    },

    /** Cursor is "<modified since ISO>|<after>". Polls contacts changed since the last run. */
    async sync({ connectionId, cursor }): Promise<SyncPage> {
      const [since, after] = (cursor ?? "").split("|");
      const sinceMs = since ? Date.parse(since) : (deps.now?.() ?? new Date()).getTime() - 86_400_000;
      const page = await getJson<{ results: Contact[]; paging?: { next?: { after?: string } } }>(deps.fetch, `${API}/crm/v3/objects/contacts/search`, await auth(connectionId), {
        method: "POST",
        body: {
          filterGroups: [{ filters: [{ propertyName: "lastmodifieddate", operator: "GTE", value: String(sinceMs) }] }],
          sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
          properties: PROPERTIES,
          limit: PAGE,
          ...(after ? { after } : {}),
        },
      });
      const events = page.results.map((contact) => toEvent(contact, false));
      const next = page.paging?.next?.after ?? null;
      const newest = events.reduce((max, event) => (event.occurredAt > max ? event.occurredAt : max), since || new Date(sinceMs).toISOString());
      return { events, cursor: next ? `${since ?? new Date(sinceMs).toISOString()}|${next}` : `${newest}|`, done: !next };
    },

    async mapFields({ connectionId }) {
      const data = await getJson<{ results: Array<{ name: string }> }>(deps.fetch, `${API}/crm/v3/properties/contacts`, await auth(connectionId));
      return mapKnown(data.results.map((row) => row.name), KNOWN);
    },

    async health({ connectionId }) {
      try {
        await getJson(deps.fetch, `${API}/crm/v3/objects/contacts?limit=1`, await auth(connectionId));
        return { state: "healthy", lastSyncAt: (deps.now?.() ?? new Date()).toISOString() };
      } catch (error) {
        return healthFromError(error, null);
      }
    },

    async disconnect() {
      // Revoking the refresh token happens in the connections store, which owns the encrypted secret.
    },
  };
}
