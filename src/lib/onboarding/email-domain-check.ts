import "server-only";

import { resolveCname, resolveMx, resolveTxt } from "node:dns/promises";

import { lookupName, recordMatches, type DomainRecord, type RecordResult } from "@/lib/onboarding/email-domain";

async function lookup(record: DomainRecord, name: string): Promise<string[]> {
  try {
    if (record.type === "TXT") return (await resolveTxt(name)).map((chunks) => chunks.join(""));
    if (record.type === "CNAME") return await resolveCname(name);
    return (await resolveMx(name)).map((mx) => `${mx.priority} ${mx.exchange}`);
  } catch {
    return [];
  }
}

/** Looks each record up. A record that is not there yet reads as not found, never as an error. */
export async function checkDomainRecords(domain: string | null, records: DomainRecord[]): Promise<{ results: RecordResult[]; verified: boolean }> {
  const results = await Promise.all(
    records.map(async (record) => {
      const found = await lookup(record, lookupName(record.host, domain));
      return { host: record.host, type: record.type, found: recordMatches(record, found) };
    })
  );
  return { results, verified: results.length > 0 && results.every((result) => result.found) };
}
