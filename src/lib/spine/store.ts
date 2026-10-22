import "server-only";

import { decideIdentity, identityKeys, type IdentityDecision, type IdentityKey, type SourcePerson } from "@/lib/spine/identity";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

/** The few query builder calls the spine needs, so callers can pass the service-role client. */
export type SpineDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        in: (column: string, values: unknown[]) => Result<Array<Record<string, unknown>>>;
      };
    };
    upsert: (rows: object[], options: { onConflict: string; ignoreDuplicates: boolean }) => Result<unknown>;
    insert: (row: object) => Result<unknown>;
  };
};

async function leadsHolding(db: SpineDb, orgId: string, keys: IdentityKey[]): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  if (keys.length === 0) return index;
  const { data, error } = await db
    .from("lead_identities")
    .select("kind, value, lead_id, leads!inner(merged_into)")
    .eq("org_id", orgId)
    .in("value", keys.map((key) => key.value));
  if (error) throw new Error("Identity lookup failed.");
  for (const row of data ?? []) {
    const lead = row.leads as { merged_into: string | null } | null;
    if (lead?.merged_into) continue;
    const id = `${row.kind}|${row.value}`;
    index.set(id, [...(index.get(id) ?? []), String(row.lead_id)]);
  }
  return index;
}

/**
 * Resolves a person from any source to a lead. A review is recorded for a
 * person to decide when the keys disagree or only a phone matches.
 */
export async function matchPerson(
  db: SpineDb,
  args: { orgId: string; person: SourcePerson; sourceId: string | null }
): Promise<{ decision: IdentityDecision; keys: IdentityKey[] }> {
  const keys = identityKeys(args.person);
  const index = await leadsHolding(db, args.orgId, keys);
  const decision = decideIdentity(keys, (key) => index.get(`${key.kind}|${key.value}`) ?? []);
  if (decision.kind === "review") {
    const { error } = await db.from("identity_reviews").insert({
      org_id: args.orgId,
      reason: decision.reason,
      source: args.person.source,
      source_id: args.sourceId,
      keys,
      candidate_lead_ids: decision.leadIds,
    });
    if (error && error.code !== "23505") throw new Error("Identity review could not be saved.");
  }
  return { decision, keys };
}

/** Records the keys a source supplied for a lead, so the next source finds it. */
export async function rememberKeys(
  db: SpineDb,
  args: { orgId: string; leadId: string; keys: IdentityKey[]; source: SourcePerson["source"]; sourceId: string | null }
): Promise<void> {
  if (args.keys.length === 0) return;
  const { error } = await db.from("lead_identities").upsert(
    args.keys.map((key) => ({
      org_id: args.orgId,
      lead_id: args.leadId,
      kind: key.kind,
      value: key.value,
      source: args.source,
      source_id: key.kind === "crm" ? args.sourceId : null,
    })),
    { onConflict: "org_id,kind,value,lead_id", ignoreDuplicates: true }
  );
  if (error) throw new Error("Identity keys could not be saved.");
}
