import "server-only";

import { airtableApiBase, airtableApiKey } from "@/lib/forsight/env";
import { ForsightSourceError } from "@/lib/forsight/errors";

/**
 * The only place Forsight writes anything, anywhere.
 *
 * Meta ad spend has to land in Airtable because Airtable's cost formulas
 * divide by it: cost per audit held, CAC, cost per application and ROAS are
 * all spend over a count. If spend only ever existed as a live read inside
 * Forsight, either those formulas go blank or the dashboard starts dividing —
 * and the dashboard does not divide.
 *
 * Deliberately a separate module from the read client so that "does Forsight
 * write to this base" is answered by grepping for one import.
 */

const BATCH_SIZE = 10;

export type AirtableWriteArgs = {
  orgId: string;
  orgLabel?: string | null;
  baseId: string;
  table: string;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export type AirtableUpdate = { id: string; fields: Record<string, unknown> };

export type AirtableCreate = { fields: Record<string, unknown> };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function write(
  args: AirtableWriteArgs,
  method: "PATCH" | "POST",
  records: Array<AirtableUpdate | AirtableCreate>
): Promise<string[]> {
  if (records.length === 0) return [];

  const apiKey = airtableApiKey();
  if (!apiKey) {
    throw new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgLabel,
      sourceType: "airtable",
      reason: "credential_missing",
      detail: "AIRTABLE_API_KEY is not set on this deployment, so the spend sync cannot write.",
    });
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const url = `${airtableApiBase()}/${encodeURIComponent(args.baseId)}/${encodeURIComponent(args.table)}`;
  const ids: string[] = [];

  for (const batch of chunk(records, BATCH_SIZE)) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      // No typecast: a value Airtable would have to coerce is a bug in the
      // sync, and coercing it silently is how a wrong number gets believed.
      body: JSON.stringify({ records: batch }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ForsightSourceError({
        orgId: args.orgId,
        orgLabel: args.orgLabel,
        sourceType: "airtable",
        reason:
          response.status === 401 || response.status === 403
            ? "credential_rejected"
            : "unreachable",
        httpStatus: response.status,
        detail: `Writing ${args.table} in base ${args.baseId} failed. ${await detail(response)}`,
      });
    }

    const json = (await response.json().catch(() => null)) as {
      records?: Array<{ id?: string }>;
    } | null;
    for (const record of json?.records ?? []) {
      if (record.id) ids.push(record.id);
    }
  }

  return ids;
}

/** Sets fields to the given values. Never increments — see `meta-sync`. */
export function updateAirtableRecords(
  args: AirtableWriteArgs,
  records: AirtableUpdate[]
): Promise<string[]> {
  return write(args, "PATCH", records);
}

export function createAirtableRecords(
  args: AirtableWriteArgs,
  records: AirtableCreate[]
): Promise<string[]> {
  return write(args, "POST", records);
}

async function detail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { type?: string; message?: string } | string };
    if (typeof body?.error === "string") return body.error;
    return [body?.error?.type, body?.error?.message].filter(Boolean).join(": ") || "No detail returned.";
  } catch {
    return "No detail returned.";
  }
}
