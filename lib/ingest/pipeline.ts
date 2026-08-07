/**
 * The inbound ingestion pipeline.
 *
 * Order matters here and the order is deliberate:
 *
 *   1. Authenticate. A missing or unmatched secret is rejected before the body
 *      is parsed and nothing is written.
 *   2. Write the raw payload to `inbound_events`. A payload that cannot be
 *      parsed is still evidence, still replayable, and still the record that
 *      proves what arrived and when.
 *   3. Acknowledge. Providers that wait for processing retry, and retries are
 *      how duplicates get made.
 *   4. Process, and record the outcome on the stored event.
 *
 * The database client is passed in rather than imported so the whole path can be
 * exercised in tests without a live Supabase project.
 */

import {
  handleAppointmentBooked,
  handleAppointmentOutcome,
} from "@/lib/ingest/booking";
import {
  findLeadForContact,
  findOriginalLead,
  resolveCampaign,
} from "@/lib/ingest/leads";
import {
  idempotencyKey,
  leadSource,
  normaliseEvent,
  type NormalisedEvent,
} from "@/lib/ingest/normalise";
import {
  isUniqueViolation,
  message,
  type LedgerDb,
  type ProcessOutcome,
} from "@/lib/ingest/types";
import type {
  CanonicalEventType,
  Client,
  InboundEvent,
  InboundEventStatus,
  Json,
  TouchType,
} from "@/types/database";

export type { LedgerDb } from "@/lib/ingest/types";

export type InboundReceipt = {
  status: number;
  body: Record<string, Json>;
  /** Work deliberately deferred until after the acknowledgement is sent. */
  process: (() => Promise<void>) | null;
};

/* -------------------------------------------------------------------------- */
/* Receiving                                                                   */
/* -------------------------------------------------------------------------- */

export type InboundRequest = {
  /** The shared secret as presented by the caller, if it presented one. */
  secret: string | null;
  rawBody: string;
  receivedAt?: string;
};

function rejected(error: string): InboundReceipt {
  return { status: 401, body: { ok: false, error }, process: null };
}

export async function receiveInboundEvent(
  request: InboundRequest,
  db: LedgerDb
): Promise<InboundReceipt> {
  const receivedAt = request.receivedAt ?? new Date().toISOString();

  const secret = request.secret?.trim();
  if (!secret) {
    return rejected("Missing webhook secret.");
  }

  const { data: client, error: clientError } = await db
    .from("clients")
    .select("*")
    .eq("webhook_secret", secret)
    .returns<Client[]>()
    .maybeSingle();

  if (clientError) {
    return { status: 503, body: { ok: false, error: "Client lookup failed." }, process: null };
  }
  if (!client) {
    return rejected("Unrecognised webhook secret.");
  }

  // Everything below this line is interpretation of a payload we do not control.
  // None of it writes anything until the raw payload has been stored.
  let payload: Json;
  let parseError: string | null = null;
  try {
    payload = JSON.parse(request.rawBody) as Json;
  } catch {
    payload = { unparsed: request.rawBody };
    parseError = "Payload is not valid JSON.";
  }

  const event = normaliseEvent(payload);

  const locationMismatch =
    client.ghl_location_id !== null &&
    event.locationId !== null &&
    event.locationId !== client.ghl_location_id;

  const stored = await storeEvent(db, {
    client,
    event,
    payload,
    parseError,
    locationMismatch,
    receivedAt,
  });

  if (stored.kind === "duplicate") {
    return {
      status: 200,
      body: { ok: true, duplicate: true, message: "Event already received." },
      process: null,
    };
  }

  if (stored.kind === "unstorable") {
    // Nothing was recorded, so a retry is exactly what we want here.
    return { status: 503, body: { ok: false, error: stored.error }, process: null };
  }

  const row = stored.event;
  const canonical = row.canonical_type;

  if (row.status !== "pending" || canonical === null) {
    return {
      status: 200,
      body: { ok: true, event_id: row.id, status: row.status },
      process: null,
    };
  }

  return {
    status: 200,
    body: { ok: true, event_id: row.id, status: "accepted" },
    process: () => runAndRecord(db, row, client, event, canonical),
  };
}

type StoreResult =
  | { kind: "stored"; event: InboundEvent }
  | { kind: "duplicate" }
  | { kind: "unstorable"; error: string };

/**
 * The insert is both the audit record and the idempotency gate: a retried
 * delivery loses the unique index on `idempotency_key` and is acknowledged
 * without being processed a second time.
 */
async function storeEvent(
  db: LedgerDb,
  input: {
    client: Client;
    event: NormalisedEvent;
    payload: Json;
    parseError: string | null;
    locationMismatch: boolean;
    receivedAt: string;
  }
): Promise<StoreResult> {
  const { client, event, payload, parseError, locationMismatch, receivedAt } = input;

  let status: InboundEventStatus = "pending";
  let error: string | null = parseError;
  let canonicalType: CanonicalEventType | null = null;
  let clientId: string | null = client.id;

  if (parseError !== null) {
    status = "unknown";
  } else if (locationMismatch) {
    // The secret says one client and the payload says another. Neither is
    // trusted; an admin attributes it by hand.
    status = "unattributed";
    clientId = null;
    error = `Webhook secret belongs to ${client.name}, but the payload declares location ${event.locationId}.`;
  } else if (event.classification.kind === "recognised") {
    canonicalType = event.classification.canonical;
  } else if (event.classification.kind === "undeclared_touch") {
    status = "unclassified";
    error =
      "The event did not declare whether the touch was system or human, so nothing was stamped.";
  } else {
    status = "unknown";
    error = event.declaredType
      ? `Unrecognised event type "${event.declaredType}".`
      : "The payload declared no event type.";
  }

  const { data, error: insertError } = await db
    .from("inbound_events")
    .insert({
      client_id: clientId,
      event_type: event.declaredType,
      canonical_type: canonicalType,
      payload,
      status,
      provider_event_id: event.providerEventId,
      idempotency_key: idempotencyKey(event, { clientId: client.id, receivedAt }),
      declared_location_id: event.locationId,
      location_mismatch: locationMismatch,
      error,
      received_at: receivedAt,
    })
    .select("*")
    .returns<InboundEvent[]>()
    .single();

  if (insertError) {
    return isUniqueViolation(insertError)
      ? { kind: "duplicate" }
      : { kind: "unstorable", error: insertError.message };
  }

  return { kind: "stored", event: data };
}

/* -------------------------------------------------------------------------- */
/* Processing                                                                  */
/* -------------------------------------------------------------------------- */

async function runAndRecord(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent,
  canonical: CanonicalEventType,
  extra?: { resolutionNote?: string }
): Promise<void> {
  let outcome: ProcessOutcome;

  try {
    outcome = await runEvent(db, stored, client, event, canonical);
  } catch (thrown) {
    // A recognised event that fails to process is still acknowledged; the
    // failure lives on the stored event where an admin can see it.
    outcome = { status: "failed", error: message(thrown) };
  }

  await db
    .from("inbound_events")
    .update({
      status: outcome.status,
      canonical_type: canonical,
      client_id: client.id,
      lead_id: outcome.leadId ?? null,
      touch_id: outcome.touchId ?? null,
      appointment_id: outcome.appointmentId ?? null,
      error: outcome.error ?? null,
      location_mismatch: stored.location_mismatch,
      ...(extra?.resolutionNote
        ? { resolved_at: new Date().toISOString(), resolution_note: extra.resolutionNote }
        : {}),
    })
    .eq("id", stored.id);
}

async function runEvent(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent,
  canonical: CanonicalEventType
): Promise<ProcessOutcome> {
  switch (canonical) {
    case "lead_received":
      return handleLeadReceived(db, stored, client, event);
    case "system_touch":
      return handleTouch(db, stored, client, event, "system");
    case "human_touch":
      return handleTouch(db, stored, client, event, "human");
    case "contact_updated":
      return handleContactUpdated(db, client, event);
    case "appointment_booked":
      return handleAppointmentBooked(db, stored, client, event);
    case "appointment_showed":
      return handleAppointmentOutcome(db, client, event, true);
    case "appointment_no_show":
      return handleAppointmentOutcome(db, client, event, false);
  }
}

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

async function handleLeadReceived(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent
): Promise<ProcessOutcome> {
  // A response time computed from a receipt timestamp is slightly generous, so
  // which source was used is recorded alongside it.
  const arrivedAt = event.occurredAt ?? stored.received_at;
  const arrivalSource = event.occurredAt !== null ? "payload" : "received";

  const original = await findOriginalLead(db, client, event, arrivedAt);

  if (original !== null) {
    // The original keeps its arrival timestamp and its touches. Submitting twice
    // does not reset the response clock or create a second billable path.
    await recordSubmission(db, {
      leadId: original.id,
      eventId: stored.id,
      isOriginal: false,
      submittedAt: arrivedAt,
      payload: stored.payload,
    });

    return { status: "processed", leadId: original.id };
  }

  const campaignId = await resolveCampaign(db, client.id, event);

  const { data, error } = await db
    .from("leads")
    .insert({
      client_id: client.id,
      campaign_id: campaignId,
      name: event.contact.name,
      phone: event.contact.phone,
      email: event.contact.email,
      source: leadSource(event, campaignId !== null),
      utm_source: event.utm.source,
      utm_medium: event.utm.medium,
      utm_campaign: event.utm.campaign,
      utm_content: event.utm.content,
      job_type: event.jobType,
      raw_payload: stored.payload,
      arrived_at: arrivedAt,
      arrival_source: arrivalSource,
    })
    .select("id, client_id, phone_key, email_key, arrived_at")
    .returns<
      {
        id: string;
        client_id: string;
        phone_key: string | null;
        email_key: string | null;
        arrived_at: string;
      }[]
    >()
    .single();

  if (error) {
    throw new Error(`Could not create the lead: ${error.message}`);
  }

  await recordSubmission(db, {
    leadId: data.id,
    eventId: stored.id,
    isOriginal: true,
    submittedAt: arrivedAt,
    payload: stored.payload,
  });

  // Cross-client match is a flag only — never blocks this lead or the other.
  try {
    const { flagCrossClientMatches } = await import("@/lib/territory/cross-client");
    await flagCrossClientMatches(db, data);
  } catch {
    // A failed flag must not fail ingestion; the lead is already recorded.
  }

  return { status: "processed", leadId: data.id };
}

async function recordSubmission(
  db: LedgerDb,
  input: {
    leadId: string;
    eventId: string;
    isOriginal: boolean;
    submittedAt: string;
    payload: Json;
  }
): Promise<void> {
  await db.from("lead_submissions").insert({
    lead_id: input.leadId,
    inbound_event_id: input.eventId,
    is_original: input.isOriginal,
    submitted_at: input.submittedAt,
    payload: input.payload,
  });
}

/* -------------------------------------------------------------------------- */
/* Touches                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A touch of a given type stamps only once per lead, on the first occurrence,
 * and is never overwritten by a later contact of the same type. Later contacts
 * are still recorded — they are the activity history — but they do not move the
 * figure response times are computed from.
 */
async function handleTouch(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent,
  touchType: TouchType
): Promise<ProcessOutcome> {
  const lead = await findLeadForContact(db, client.id, event);

  if (lead === null) {
    return {
      status: "failed",
      error: "No lead matches this contact, so the touch was not stamped.",
    };
  }

  const { data: existing } = await db
    .from("touches")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("touch_type", touchType)
    .eq("is_first_of_type", true)
    .limit(1)
    .returns<{ id: string }[]>()
    .maybeSingle();

  const occurredAt = event.occurredAt ?? stored.received_at;

  const insert = (isFirst: boolean) =>
    db
      .from("touches")
      .insert({
        lead_id: lead.id,
        touch_type: touchType,
        channel: event.channel,
        occurred_at: occurredAt,
        is_first_of_type: isFirst,
        inbound_event_id: stored.id,
      })
      .select("id")
      .returns<{ id: string }[]>()
      .single();

  let { data, error } = await insert(existing === null);

  // Two deliveries racing for the first stamp: the index decides, and the loser
  // is recorded as a later touch rather than overwriting the winner.
  if (error && isUniqueViolation(error)) {
    ({ data, error } = await insert(false));
  }

  if (error || !data) {
    throw new Error(`Could not record the touch: ${error?.message ?? "unknown error"}`);
  }

  return { status: "processed", leadId: lead.id, touchId: data.id };
}

/* -------------------------------------------------------------------------- */
/* Contact updates                                                             */
/* -------------------------------------------------------------------------- */

async function handleContactUpdated(
  db: LedgerDb,
  client: Client,
  event: NormalisedEvent
): Promise<ProcessOutcome> {
  const lead = await findLeadForContact(db, client.id, event);

  if (lead === null) {
    return {
      status: "failed",
      error: "No lead matches this contact, so there was nothing to update.",
    };
  }

  const update: Record<string, string> = {};
  if (event.contact.name !== null) update.name = event.contact.name;
  if (event.contact.phone !== null) update.phone = event.contact.phone;
  if (event.contact.email !== null) update.email = event.contact.email;
  if (event.jobType !== null) update.job_type = event.jobType;

  if (Object.keys(update).length === 0) {
    return { status: "processed", leadId: lead.id };
  }

  // Contact details change; the arrival timestamp and the touches never do.
  const { error } = await db.from("leads").update(update).eq("id", lead.id);

  if (error) {
    throw new Error(`Could not update the lead: ${error.message}`);
  }

  return { status: "processed", leadId: lead.id };
}

/* -------------------------------------------------------------------------- */
/* Admin resolution                                                            */
/* -------------------------------------------------------------------------- */

export type StoredEventResolution = {
  /** The client the admin is attributing the event to, when it had none. */
  clientId?: string;
  /** The classification an admin supplies for a touch that declared none. */
  canonicalType?: CanonicalEventType;
  note: string;
};

/**
 * Replays a stored event through the same pipeline. This is how an admin
 * attributes an unattributed event or classifies an undeclared touch: it
 * processes normally, and cannot create records that bypass validation.
 */
export async function processStoredEvent(
  db: LedgerDb,
  eventId: string,
  resolution: StoredEventResolution
): Promise<{ ok: boolean; message: string }> {
  const { data: stored, error } = await db
    .from("inbound_events")
    .select("*")
    .eq("id", eventId)
    .returns<InboundEvent[]>()
    .maybeSingle();

  if (error || !stored) {
    return { ok: false, message: "That event no longer exists." };
  }

  const clientId = resolution.clientId ?? stored.client_id;
  if (clientId === null) {
    return { ok: false, message: "Choose a client to attribute this event to." };
  }

  const { data: client } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .returns<Client[]>()
    .maybeSingle();

  if (!client) {
    return { ok: false, message: "That client no longer exists." };
  }

  const event = normaliseEvent(stored.payload);
  const canonical =
    resolution.canonicalType ??
    stored.canonical_type ??
    (event.classification.kind === "recognised" ? event.classification.canonical : null);

  if (canonical === null) {
    return {
      ok: false,
      message: "This event still has no recognised type. Classify it or dismiss it.",
    };
  }

  await runAndRecord(db, stored, client, event, canonical, {
    resolutionNote: resolution.note,
  });

  const { data: after } = await db
    .from("inbound_events")
    .select("*")
    .eq("id", eventId)
    .returns<InboundEvent[]>()
    .maybeSingle();

  if (after?.status === "processed") {
    return { ok: true, message: "Event processed." };
  }

  return {
    ok: false,
    message: after?.error ?? "The event could not be processed.",
  };
}

export async function dismissStoredEvent(
  db: LedgerDb,
  eventId: string,
  note: string
): Promise<{ ok: boolean; message: string }> {
  const { error } = await db
    .from("inbound_events")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    })
    .eq("id", eventId);

  if (error) {
    return { ok: false, message: `Could not dismiss the event: ${error.message}` };
  }

  return { ok: true, message: "Event dismissed. It stays in the log." };
}
