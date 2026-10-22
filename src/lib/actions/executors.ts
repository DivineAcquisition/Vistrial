/**
 * Vendor calls behind each named action. Every executor receives an injected
 * fetch, a server-side token and already validated params, so tests run
 * against fake accounts and nothing here can call an arbitrary URL.
 */

export type Fetch = typeof fetch;

export type ExecArgs = {
  token: string;
  params: Record<string, unknown>;
  /** The record's id in the connected app, for actions on a lead. */
  externalId: string | null;
  fetch: Fetch;
};

export type ExecResult =
  | { ok: true; before: unknown; after: unknown; externalRef: string | null; data?: unknown }
  | { ok: false; code: string };

export type UndoArgs = { token: string; params: Record<string, unknown>; externalId: string | null; before: unknown; externalRef: string | null; fetch: Fetch };

export type Executor = {
  run: (args: ExecArgs) => Promise<ExecResult>;
  undo?: (args: UndoArgs) => Promise<{ ok: boolean; code?: string }>;
};

const HUBSPOT = "https://api.hubapi.com";
const AIRTABLE = "https://api.airtable.com/v0";
const CONTACT_FIELDS = ["firstname", "lastname", "lifecyclestage", "hs_lead_status", "lastmodifieddate"];

async function call(fetcher: Fetch, url: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; json: unknown }> {
  const response = await fetcher(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = response.status === 204 ? null : await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, json };
}

function failure(status: number): ExecResult {
  if (status === 401 || status === 403) return { ok: false, code: "not_allowed" };
  if (status === 404) return { ok: false, code: "not_found" };
  if (status === 429) return { ok: false, code: "rate_limited" };
  return { ok: false, code: "vendor_error" };
}

function seg(value: unknown): string {
  return encodeURIComponent(String(value));
}

function needsRecord(externalId: string | null): ExecResult | null {
  return externalId ? null : { ok: false, code: "no_linked_record" };
}

const hubspot: Record<string, Executor> = {
  "crm.update_field": {
    async run({ token, params, externalId, fetch: f }) {
      const missing = needsRecord(externalId);
      if (missing) return missing;
      const field = String(params.field);
      const current = await call(f, `${HUBSPOT}/crm/v3/objects/contacts/${seg(externalId)}?properties=${seg(field)}`, token);
      if (!current.ok) return failure(current.status);
      const before = ((current.json as { properties?: Record<string, unknown> })?.properties ?? {})[field] ?? null;
      const write = await call(f, `${HUBSPOT}/crm/v3/objects/contacts/${seg(externalId)}`, token, { method: "PATCH", body: { properties: { [field]: params.value ?? "" } } });
      if (!write.ok) return failure(write.status);
      return { ok: true, before: { [field]: before }, after: { [field]: params.value ?? null }, externalRef: externalId };
    },
    async undo({ token, externalId, before, fetch: f }) {
      if (!externalId || !before || typeof before !== "object") return { ok: false, code: "nothing_to_restore" };
      const write = await call(f, `${HUBSPOT}/crm/v3/objects/contacts/${seg(externalId)}`, token, { method: "PATCH", body: { properties: before } });
      return write.ok ? { ok: true } : { ok: false, code: "vendor_error" };
    },
  },
  "crm.add_note": {
    async run({ token, params, externalId, fetch: f }) {
      const missing = needsRecord(externalId);
      if (missing) return missing;
      const write = await call(f, `${HUBSPOT}/crm/v3/objects/notes`, token, {
        method: "POST",
        body: {
          properties: { hs_note_body: params.body, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: externalId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
        },
      });
      if (!write.ok) return failure(write.status);
      const id = (write.json as { id?: string } | null)?.id ?? null;
      return { ok: true, before: null, after: { noteId: id }, externalRef: id };
    },
    async undo({ token, externalRef, fetch: f }) {
      if (!externalRef) return { ok: false, code: "nothing_to_restore" };
      const removed = await call(f, `${HUBSPOT}/crm/v3/objects/notes/${seg(externalRef)}`, token, { method: "DELETE" });
      return removed.ok ? { ok: true } : { ok: false, code: "vendor_error" };
    },
  },
  "crm.create_task": {
    async run({ token, params, externalId, fetch: f }) {
      const missing = needsRecord(externalId);
      if (missing) return missing;
      const write = await call(f, `${HUBSPOT}/crm/v3/objects/tasks`, token, {
        method: "POST",
        body: {
          properties: {
            hs_task_subject: params.title,
            hs_task_status: "NOT_STARTED",
            hs_timestamp: typeof params.dueAt === "string" ? params.dueAt : new Date().toISOString(),
          },
          associations: [{ to: { id: externalId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }] }],
        },
      });
      if (!write.ok) return failure(write.status);
      const id = (write.json as { id?: string } | null)?.id ?? null;
      return { ok: true, before: null, after: { taskId: id }, externalRef: id };
    },
    async undo({ token, externalRef, fetch: f }) {
      if (!externalRef) return { ok: false, code: "nothing_to_restore" };
      const removed = await call(f, `${HUBSPOT}/crm/v3/objects/tasks/${seg(externalRef)}`, token, { method: "DELETE" });
      return removed.ok ? { ok: true } : { ok: false, code: "vendor_error" };
    },
  },
  "crm.fetch_record": {
    async run({ token, externalId, fetch: f }) {
      const missing = needsRecord(externalId);
      if (missing) return missing;
      const read = await call(f, `${HUBSPOT}/crm/v3/objects/contacts/${seg(externalId)}?properties=${CONTACT_FIELDS.join(",")}`, token);
      if (!read.ok) return failure(read.status);
      const properties = (read.json as { properties?: Record<string, unknown> } | null)?.properties ?? {};
      return { ok: true, before: null, after: null, externalRef: externalId, data: Object.fromEntries(CONTACT_FIELDS.map((key) => [key, properties[key] ?? null])) };
    },
  },
  "crm.search": {
    async run({ token, params, fetch: f }) {
      const read = await call(f, `${HUBSPOT}/crm/v3/objects/contacts/search`, token, {
        method: "POST",
        body: { query: params.query, limit: 10, properties: CONTACT_FIELDS },
      });
      if (!read.ok) return failure(read.status);
      const results = ((read.json as { results?: Array<{ id: string; properties?: Record<string, unknown> }> } | null)?.results ?? []).map((row) => ({
        id: row.id,
        stage: row.properties?.lifecyclestage ?? null,
        status: row.properties?.hs_lead_status ?? null,
      }));
      return { ok: true, before: null, after: null, externalRef: null, data: results };
    },
  },
};

const airtable: Record<string, Executor> = {
  "airtable.upsert_record": {
    async run({ token, params, fetch: f }) {
      const base = `${AIRTABLE}/${seg(params.baseId)}/${seg(params.table)}`;
      const fields = params.fields as Record<string, unknown>;
      if (typeof params.recordId === "string") {
        const current = await call(f, `${base}/${seg(params.recordId)}`, token);
        if (!current.ok) return failure(current.status);
        const existing = (current.json as { fields?: Record<string, unknown> } | null)?.fields ?? {};
        const before = Object.fromEntries(Object.keys(fields).map((key) => [key, existing[key] ?? null]));
        const write = await call(f, `${base}/${seg(params.recordId)}`, token, { method: "PATCH", body: { fields } });
        if (!write.ok) return failure(write.status);
        return { ok: true, before, after: fields, externalRef: params.recordId };
      }
      const write = await call(f, base, token, { method: "POST", body: { fields } });
      if (!write.ok) return failure(write.status);
      const id = (write.json as { id?: string } | null)?.id ?? null;
      return { ok: true, before: null, after: fields, externalRef: id };
    },
    async undo({ token, params, before, externalRef, fetch: f }) {
      if (!externalRef) return { ok: false, code: "nothing_to_restore" };
      const url = `${AIRTABLE}/${seg(params.baseId)}/${seg(params.table)}/${seg(externalRef)}`;
      const result = before && typeof before === "object"
        ? await call(f, url, token, { method: "PATCH", body: { fields: before } })
        : await call(f, url, token, { method: "DELETE" });
      return result.ok ? { ok: true } : { ok: false, code: "vendor_error" };
    },
  },
};

/** Action, then connector. A missing pair means that connector cannot do it yet. */
export const EXECUTORS: Record<string, Record<string, Executor>> = {
  "crm.update_field": { hubspot: hubspot["crm.update_field"] },
  "crm.add_note": { hubspot: hubspot["crm.add_note"] },
  "crm.create_task": { hubspot: hubspot["crm.create_task"] },
  "crm.fetch_record": { hubspot: hubspot["crm.fetch_record"] },
  "crm.search": { hubspot: hubspot["crm.search"] },
  "airtable.upsert_record": { airtable: airtable["airtable.upsert_record"] },
};

export function executorFor(action: string, connector: string): Executor | null {
  return EXECUTORS[action]?.[connector] ?? null;
}

/** Text a person wrote never stays in the run record once the action has run. */
const TEXT_PARAMS = new Set(["body", "title", "query"]);

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, TEXT_PARAMS.has(key) && typeof value === "string" ? { redacted: true, length: value.length } : value]),
  );
}
