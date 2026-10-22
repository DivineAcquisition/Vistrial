import "server-only";

import { sideEffectsFor } from "@/lib/connectors/historic";
import type { InboundEvent } from "@/lib/connectors/payload";
import type { ConnectionRow } from "@/lib/connectors/store";
import { identitySourceFor } from "@/lib/spine/sources";
import { matchPerson, rememberKeys, type SpineDb } from "@/lib/spine/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Loose = {
  from: (table: string) => {
    select: (q?: string) => LooseQuery;
    insert: (row: object) => LooseQuery;
    update: (row: object) => LooseQuery;
  };
};

type LooseQuery = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & {
  select: (q?: string) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  ilike: (column: string, value: string) => LooseQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { code?: string } | null }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: { code?: string } | null }>;
};

/**
 * Turns one accepted webhook into a lead. Historic, duplicate, and pre-go-live
 * events are stored and marked historic so they cannot start a clock or a draft.
 */
export async function importPastRows(args: {
  orgId: string;
  rows: Array<{ preview: Record<string, string> }>;
}): Promise<number> {
  const admin = getSupabaseAdmin() as unknown as Loose;
  let created = 0;
  for (const row of args.rows) {
    const email = row.preview.email?.toLowerCase() || null;
    const { decision } = await matchPerson(admin as unknown as SpineDb, {
      orgId: args.orgId,
      person: { source: "upload", email, phone: row.preview.phone || null },
      sourceId: null,
    });
    // Already known, or a person has to decide which lead this is.
    if (decision.kind === "match" || decision.kind === "review") continue;
    const inserted = await admin
      .from("leads")
      .insert({
        org_id: args.orgId,
        first_name: row.preview.first_name || null,
        last_name: row.preview.last_name || null,
        email,
        phone: row.preview.phone || null,
        source: "file_upload",
        status: "new",
        opted_in_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const leadId = typeof inserted.data?.id === "string" ? inserted.data.id : null;
    if (!leadId) continue;
    await admin.from("lead_import_marks").insert({ lead_id: leadId, org_id: args.orgId, ai_state: "none" });
    created += 1;
  }
  return created;
}

export async function applyInboundEvent(args: {
  orgId: string;
  connection: ConnectionRow;
  event: InboundEvent;
}): Promise<void> {
  const effects = sideEffectsFor({
    historic: args.event.historic || args.connection.status === "importing",
    duplicate: false,
    replay: false,
    pausedCatchup: false,
    occurredBeforeGoLive: Boolean(
      args.connection.go_live_at &&
        args.event.occurredAt &&
        Date.parse(args.event.occurredAt) < Date.parse(args.connection.go_live_at)
    ),
  });
  const historic = effects.length === 0;
  const person = args.event.person;
  if (!person) return;
  const admin = getSupabaseAdmin() as unknown as Loose;
  const externalId = person.externalId ?? args.event.id;
  const linked = await admin
    .from("connector_people")
    .select("lead_id")
    .eq("connection_id", args.connection.id)
    .eq("external_id", externalId)
    .maybeSingle();
  let leadId = typeof linked.data?.lead_id === "string" ? linked.data.lead_id : null;
  const spine = getSupabaseAdmin() as unknown as SpineDb;
  const source = identitySourceFor(args.connection.connector_key);
  const { decision, keys } = await matchPerson(spine, {
    orgId: args.orgId,
    person: {
      source,
      email: person.email,
      phone: person.phone,
      crm: person.externalId ? { system: args.connection.connector_key, id: person.externalId } : null,
    },
    sourceId: externalId,
  });
  // Two leads claim this person, or only a phone matched: a person decides.
  if (!leadId && decision.kind === "review") return;
  if (!leadId && decision.kind === "match") leadId = decision.leadId;
  if (!leadId) {
    const created = await admin
      .from("leads")
      .insert({
        org_id: args.orgId,
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email,
        phone: person.phone,
        source: args.connection.connector_key,
        status: "new",
        opted_in_at: args.event.occurredAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();
    leadId = typeof created.data?.id === "string" ? created.data.id : null;
  }
  if (!leadId) return;
  await rememberKeys(spine, { orgId: args.orgId, leadId, keys, source, sourceId: externalId });
  await admin.from("connector_people").insert({
    org_id: args.orgId,
    connection_id: args.connection.id,
    external_id: externalId,
    lead_id: leadId,
  });
  if (args.event.optOut) {
    await admin.from("leads").update({ do_not_contact: true, do_not_contact_reason: "source_opt_out" }).eq("id", leadId);
    await admin.from("lead_opt_outs").insert({
      org_id: args.orgId,
      lead_id: leadId,
      word: "source",
      channel: "any",
    });
  }
  if (historic) {
    await admin.from("lead_import_marks").insert({ lead_id: leadId, org_id: args.orgId, ai_state: "none" });
  }
  await (getSupabaseAdmin() as unknown as Loose)
    .from("workspace_connections")
    .update({ last_update_at: new Date().toISOString() })
    .eq("id", args.connection.id);
}
