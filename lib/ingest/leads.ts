/**
 * Finding the lead an inbound event belongs to.
 *
 * Shared by every handler, because the answer has to be the same one whether a
 * touch, a contact update, or a booking is asking. An appointment matched to
 * the wrong lead is worse than an appointment with no lead at all.
 */

import { emailKey, phoneKey, type NormalisedEvent } from "@/lib/ingest/normalise";
import { isUniqueViolation, type LedgerDb } from "@/lib/ingest/types";
import type { Client, Lead } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findLeadByKey(
  db: LedgerDb,
  clientId: string,
  column: "phone_key" | "email_key",
  value: string,
  since: string | null,
  order: "first" | "latest"
): Promise<Lead | null> {
  let query = db.from("leads").select("*").eq("client_id", clientId).eq(column, value);

  if (since !== null) query = query.gte("arrived_at", since);

  const { data } = await query
    .order("arrived_at", { ascending: order === "first" })
    .limit(1)
    .returns<Lead[]>()
    .maybeSingle();

  return data ?? null;
}

/**
 * Duplicate resolution. A second submission from the same phone or email inside
 * the client's window is the same lead, not a new one — this is the single most
 * common source of billing disputes in this model, and it is far cheaper to
 * catch at the door than to argue about later.
 */
export async function findOriginalLead(
  db: LedgerDb,
  client: Client,
  event: NormalisedEvent,
  arrivedAt: string
): Promise<Lead | null> {
  const since = new Date(
    Date.parse(arrivedAt) - client.duplicate_window_days * 24 * 60 * 60 * 1000
  ).toISOString();

  const candidates: Lead[] = [];

  const phone = phoneKey(event.contact.phone);
  if (phone !== null) {
    const match = await findLeadByKey(db, client.id, "phone_key", phone, since, "first");
    if (match) candidates.push(match);
  }

  const email = emailKey(event.contact.email);
  if (email !== null) {
    const match = await findLeadByKey(db, client.id, "email_key", email, since, "first");
    if (match) candidates.push(match);
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((earliest, candidate) =>
    Date.parse(candidate.arrived_at) < Date.parse(earliest.arrived_at) ? candidate : earliest
  );
}

/** The lead a touch, a contact update, or a booking belongs to: the most recent match. */
export async function findLeadForContact(
  db: LedgerDb,
  clientId: string,
  event: NormalisedEvent
): Promise<Lead | null> {
  const externalId = event.contact.externalId;
  if (externalId !== null && UUID.test(externalId)) {
    const { data } = await db
      .from("leads")
      .select("*")
      .eq("id", externalId)
      .eq("client_id", clientId)
      .returns<Lead[]>()
      .maybeSingle();
    if (data) return data;
  }

  const phone = phoneKey(event.contact.phone);
  if (phone !== null) {
    const match = await findLeadByKey(db, clientId, "phone_key", phone, null, "latest");
    if (match) return match;
  }

  const email = emailKey(event.contact.email);
  if (email !== null) {
    const match = await findLeadByKey(db, clientId, "email_key", email, null, "latest");
    if (match) return match;
  }

  return null;
}

type CampaignRow = { id: string };

/**
 * A campaign identifier that does not exist yet is created rather than dropped.
 * Losing the attribution is a reporting gap; losing the lead is a lost sale.
 */
export async function resolveCampaign(
  db: LedgerDb,
  clientId: string,
  event: NormalisedEvent
): Promise<string | null> {
  const externalId = event.campaign.externalId;
  const utmCampaign = event.utm.campaign;

  if (externalId === null && utmCampaign === null) return null;

  const column = externalId !== null ? "external_campaign_id" : "utm_campaign";
  const value = externalId ?? utmCampaign;

  const find = async () => {
    const { data } = await db
      .from("campaigns")
      .select("id")
      .eq("client_id", clientId)
      .eq(column, value)
      .returns<CampaignRow[]>()
      .maybeSingle();
    return data?.id ?? null;
  };

  const existing = await find();
  if (existing !== null) return existing;

  const { data, error } = await db
    .from("campaigns")
    .insert({
      client_id: clientId,
      name: event.campaign.name ?? utmCampaign ?? `Campaign ${externalId}`,
      platform: event.campaign.platform ?? "facebook",
      external_campaign_id: externalId,
      utm_campaign: utmCampaign,
    })
    .select("id")
    .returns<CampaignRow[]>()
    .single();

  if (error) {
    // Another delivery of the same campaign won the race.
    if (isUniqueViolation(error)) return find();
    return null;
  }

  return data.id;
}
