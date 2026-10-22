import type { Connector, SpineEvent, SyncPage } from "@/lib/spine/contract";
import { getJson, healthFromError, mapKnown, requireCredential, scalar, type ConnectorDeps } from "@/lib/spine/connectors/shared";

const API = "https://api.airtable.com/v0";
const BASE_ID = /^app[A-Za-z0-9]{3,30}$/;

/** Chosen by a person on the Connections page: which table holds people, and which columns. */
export type AirtableSetup = { baseId: string; table: string; emailField?: string; phoneField?: string; nameField?: string; stageField?: string };

type AirtableRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

export function readAirtableSetup(raw: Record<string, unknown>): AirtableSetup | null {
  const baseId = typeof raw.baseId === "string" && BASE_ID.test(raw.baseId) ? raw.baseId : null;
  const table = typeof raw.table === "string" && raw.table.trim() ? raw.table.trim().slice(0, 100) : null;
  if (!baseId || !table) return null;
  const pick = (key: string) => (typeof raw[key] === "string" && (raw[key] as string).trim() ? (raw[key] as string).trim().slice(0, 100) : undefined);
  return { baseId, table, emailField: pick("emailField"), phoneField: pick("phoneField"), nameField: pick("nameField"), stageField: pick("stageField") };
}

function toEvent(record: AirtableRecord, setup: AirtableSetup, historic: boolean, occurredAt: string): SpineEvent {
  const field = (name?: string) => (name ? record.fields[name] : undefined);
  const email = field(setup.emailField);
  const phone = field(setup.phoneField);
  return {
    source: "airtable",
    sourceId: `record:${setup.baseId}:${record.id}:${occurredAt}`,
    kind: "person",
    occurredAt,
    historic,
    person: { source: "crm", email: typeof email === "string" ? email : null, phone: typeof phone === "string" ? phone : null, crm: { system: "airtable", id: record.id } },
    fields: { name: scalar(field(setup.nameField)), stage: scalar(field(setup.stageField)) },
  };
}

export function airtableConnector(deps: ConnectorDeps): Connector {
  async function context(connectionId: string) {
    const setup = readAirtableSetup((await deps.setup?.(connectionId)) ?? {});
    if (!setup) throw new Error("airtable_setup_missing");
    return { setup, headers: { authorization: `Bearer ${await requireCredential(deps, connectionId)}` } };
  }

  async function page(connectionId: string, offset: string | null, modifiedAfter: string | null, historic: boolean): Promise<SyncPage> {
    const { setup, headers } = await context(connectionId);
    const url = new URL(`${API}/${encodeURIComponent(setup.baseId)}/${encodeURIComponent(setup.table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    if (modifiedAfter) url.searchParams.set("filterByFormula", `IS_AFTER(LAST_MODIFIED_TIME(), '${new Date(modifiedAfter).toISOString()}')`);
    const data = await getJson<{ records: AirtableRecord[]; offset?: string }>(deps.fetch, url.toString(), headers);
    const stamp = (deps.now?.() ?? new Date()).toISOString();
    const events = data.records.map((record) => toEvent(record, setup, historic, historic ? record.createdTime : stamp));
    return { events, cursor: data.offset ?? null, done: !data.offset };
  }

  return {
    key: "airtable",
    label: "Airtable",
    readScopes: ["data.records:read", "schema.bases:read"],
    writeScopes: ["data.records:write"],
    actions: ["airtable.upsert_record", "airtable.search"],

    async connect({ redirectUri, state }) {
      const url = new URL("https://airtable.com/oauth2/v1/authorize");
      url.searchParams.set("client_id", deps.clientId ?? "");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      url.searchParams.set("scope", this.readScopes.join(" "));
      return { authorizeUrl: url.toString() };
    },

    importHistory: ({ connectionId, cursor }) => page(connectionId, cursor, null, true),

    /** Cursor is "<modified after ISO>|<offset>". */
    async sync({ connectionId, cursor }) {
      const [since, offset] = (cursor ?? "").split("|");
      const after = since || new Date((deps.now?.() ?? new Date()).getTime() - 86_400_000).toISOString();
      const result = await page(connectionId, offset || null, after, false);
      const stamp = (deps.now?.() ?? new Date()).toISOString();
      return { ...result, cursor: result.cursor ? `${after}|${result.cursor}` : `${stamp}|` };
    },

    async mapFields({ connectionId }) {
      const { setup, headers } = await context(connectionId);
      const data = await getJson<{ tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }> }>(deps.fetch, `${API}/meta/bases/${encodeURIComponent(setup.baseId)}/tables`, headers);
      const table = data.tables.find((candidate) => candidate.name === setup.table || candidate.id === setup.table);
      const known: Record<string, string> = {};
      if (setup.emailField) known[setup.emailField] = "email";
      if (setup.phoneField) known[setup.phoneField] = "phone";
      if (setup.nameField) known[setup.nameField] = "name";
      if (setup.stageField) known[setup.stageField] = "stage";
      return mapKnown((table?.fields ?? []).map((field) => field.name), known);
    },

    async health({ connectionId }) {
      try {
        const { setup, headers } = await context(connectionId);
        await getJson(deps.fetch, `${API}/${encodeURIComponent(setup.baseId)}/${encodeURIComponent(setup.table)}?pageSize=1`, headers);
        return { state: "healthy", lastSyncAt: (deps.now?.() ?? new Date()).toISOString() };
      } catch (error) {
        if (error instanceof Error && error.message === "airtable_setup_missing") return { state: "needs_attention", lastSyncAt: null, problem: "Pick the base and table that hold your people.", reconnect: false };
        return healthFromError(error, null);
      }
    },

    async disconnect() {},
  };
}
