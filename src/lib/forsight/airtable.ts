import "server-only";

import { airtableApiBase, airtableApiKey } from "@/lib/forsight/env";
import { ForsightSourceError } from "@/lib/forsight/errors";
import type { ForsightRecord } from "@/lib/forsight/types";

/**
 * The only place in Vistrial that talks to Airtable. Reads only — Forsight
 * never writes to a client's base.
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const RATE_LIMIT_RETRIES = 3;

type AirtablePage = {
  records?: Array<{ id?: string; fields?: Record<string, unknown> }>;
  offset?: string;
};

export type AirtableListArgs = {
  orgId: string;
  orgLabel?: string | null;
  baseId: string;
  table: string;
  filterByFormula?: string;
  maxRecords?: number;
  signal?: AbortSignal;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so a rate-limit retry does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(
  args: Pick<AirtableListArgs, "orgId" | "orgLabel">,
  reason: ConstructorParameters<typeof ForsightSourceError>[0]["reason"],
  extra: { httpStatus?: number | null; detail?: string | null } = {}
): ForsightSourceError {
  return new ForsightSourceError({
    orgId: args.orgId,
    orgLabel: args.orgLabel,
    sourceType: "airtable",
    reason,
    ...extra,
  });
}

export function airtableFailureReason(status: number) {
  if (status === 401 || status === 403) return "credential_rejected" as const;
  if (status === 429) return "rate_limited" as const;
  return "unreachable" as const;
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  return 500 * 2 ** attempt;
}

/**
 * Reads every page of a table. Airtable returns at most 100 records per
 * request and hands back an `offset` when more remain; callers never see that.
 */
export async function listAirtableRecords(args: AirtableListArgs): Promise<ForsightRecord[]> {
  const apiKey = airtableApiKey();
  if (!apiKey) {
    throw failure(args, "credential_missing", {
      detail: "AIRTABLE_API_KEY is not set on this deployment.",
    });
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleep ?? defaultSleep;
  const records: ForsightRecord[] = [];
  let offset: string | undefined;
  let pages = 0;

  do {
    if (pages >= MAX_PAGES) {
      throw failure(args, "unreachable", {
        detail: `Stopped after ${MAX_PAGES} pages of ${args.table}; the base did not stop paginating.`,
      });
    }

    const url = new URL(
      `${airtableApiBase()}/${encodeURIComponent(args.baseId)}/${encodeURIComponent(args.table)}`
    );
    const remaining =
      args.maxRecords === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, args.maxRecords - records.length);
    url.searchParams.set("pageSize", String(Math.max(1, remaining)));
    if (args.filterByFormula) url.searchParams.set("filterByFormula", args.filterByFormula);
    if (offset) url.searchParams.set("offset", offset);

    const page = await readPage(url, apiKey, args, fetchImpl, sleep);
    for (const record of page.records ?? []) {
      if (!record.id) continue;
      records.push({ id: record.id, fields: record.fields ?? {} });
      if (args.maxRecords !== undefined && records.length >= args.maxRecords) {
        return records;
      }
    }

    offset = page.offset;
    pages += 1;
  } while (offset);

  return records;
}

async function readPage(
  url: URL,
  apiKey: string,
  args: AirtableListArgs,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>
): Promise<AirtablePage> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: args.signal,
      cache: "no-store",
    });

    if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw failure(args, airtableFailureReason(response.status), {
        httpStatus: response.status,
        detail: `Base ${args.baseId}, table ${args.table}. ${await errorDetail(response)}`,
      });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw failure(args, "malformed_response", {
        httpStatus: response.status,
        detail: `Base ${args.baseId}, table ${args.table} did not return JSON.`,
      });
    }

    if (!json || typeof json !== "object" || !Array.isArray((json as AirtablePage).records)) {
      throw failure(args, "malformed_response", {
        httpStatus: response.status,
        detail: `Base ${args.baseId}, table ${args.table} returned no records array.`,
      });
    }

    return json as AirtablePage;
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { type?: string; message?: string } | string };
    if (typeof body?.error === "string") return body.error;
    const type = body?.error?.type;
    const message = body?.error?.message;
    return [type, message].filter(Boolean).join(": ") || "No detail returned.";
  } catch {
    return "No detail returned.";
  }
}
