import "server-only";

import { sideEffectsFor } from "@/lib/connectors/historic";
import type { InboundEvent } from "@/lib/connectors/payload";
import type { ConnectionRow } from "@/lib/connectors/store";
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
  if (!leadId && person.email) {
    const byEmail = await admin.from("leads").select("id").eq("org_id", args.orgId).ilike("email", person.email).maybeSingle();
    leadId = typeof byEmail.data?.id === "string" ? byEmail.data.id : null;
  }
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
