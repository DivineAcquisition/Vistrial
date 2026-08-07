/**
 * Public webhook surface on the Supabase project endpoint.
 *
 * Prompt 3 contract (unchanged):
 *   1. Authenticate against the per-client secret before parsing.
 *   2. Write the raw payload before interpreting.
 *   3. Resolve the client from the secret.
 *   4. Acknowledge quickly and process afterward.
 *   5. Unrecognised event types are stored and surfaced, not hard errors.
 *
 * No sessions. No cookies. Authentication is the shared secret header alone.
 *
 * GAP: Deep processing (lead capture, booking, touches) still runs through
 * `lib/ingest` via the ledger job at POST /api/jobs/process-inbound after
 * acknowledgement. That keeps one TypeScript implementation of process logic
 * rather than a drifting Deno port. The store/ack path below mirrors
 * receiveInboundEvent's write-before-interpret behaviour.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import {
  idempotencyKey,
  normaliseEvent,
  type NormalisedEvent,
} from "./normalise.ts";
import type {
  CanonicalEventType,
  InboundEventStatus,
  Json,
} from "./types.ts";

const SECRET_HEADERS = ["x-vistrial-secret", "x-webhook-secret", "x-ghl-secret"];

function readSecret(request: Request): string | null {
  for (const header of SECRET_HEADERS) {
    const value = request.headers.get(header);
    if (value && value.trim() !== "") return value.trim();
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const value = authorization.slice(7).trim();
    if (value !== "") return value;
  }

  return null;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Webhook surface: never set cookies.
    },
  });
}

type ClientRow = {
  id: string;
  name: string;
  ghl_location_id: string | null;
  webhook_secret: string;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  const secret = readSecret(request);
  if (secret === null) {
    return json({ ok: false, error: "Missing webhook secret." }, 401);
  }

  const rawBody = await request.text();
  const receivedAt = new Date().toISOString();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Function is not configured." }, 503);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: client, error: clientError } = await db
    .from("clients")
    .select("id, name, ghl_location_id, webhook_secret")
    .eq("webhook_secret", secret)
    .maybeSingle();

  if (clientError) {
    return json({ ok: false, error: "Client lookup failed." }, 503);
  }
  if (!client) {
    return json({ ok: false, error: "Unrecognised webhook secret." }, 401);
  }

  const row = client as ClientRow;

  let payload: Json;
  let parseError: string | null = null;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    payload = { unparsed: rawBody };
    parseError = "Payload is not valid JSON.";
  }

  const event = normaliseEvent(payload);

  const locationMismatch =
    row.ghl_location_id !== null &&
    event.locationId !== null &&
    event.locationId !== row.ghl_location_id;

  const stored = await storeEvent(db, {
    client: row,
    event,
    payload,
    parseError,
    locationMismatch,
    receivedAt,
  });

  if (stored.kind === "duplicate") {
    return json({ ok: true, duplicate: true, message: "Event already received." });
  }

  if (stored.kind === "unstorable") {
    return json({ ok: false, error: stored.error }, 503);
  }

  const storedEvent = stored.event;
  const canonical = storedEvent.canonical_type;

  if (storedEvent.status !== "pending" || canonical === null) {
    return json({
      ok: true,
      event_id: storedEvent.id,
      status: storedEvent.status,
    });
  }

  // Acknowledge first. Process afterward via the ledger job (same processStoredEvent
  // path admin replay uses) so ingestion behaviour stays in one TypeScript tree.
  const processPromise = triggerProcess(db, storedEvent.id);

  // EdgeRuntime.waitUntil keeps the work alive after the response when available.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(processPromise);
  } else {
    // Local `supabase functions serve` may lack waitUntil; still attempt process.
    await processPromise;
  }

  return json({
    ok: true,
    event_id: storedEvent.id,
    status: "accepted",
  });
});

type StoreResult =
  | {
      kind: "stored";
      event: {
        id: string;
        status: InboundEventStatus;
        canonical_type: CanonicalEventType | null;
      };
    }
  | { kind: "duplicate" }
  | { kind: "unstorable"; error: string };

async function storeEvent(
  db: ReturnType<typeof createClient>,
  input: {
    client: ClientRow;
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
      idempotency_key: idempotencyKey(event, {
        clientId: client.id,
        receivedAt,
      }),
      declared_location_id: event.locationId,
      location_mismatch: locationMismatch,
      error,
      received_at: receivedAt,
    })
    .select("id, status, canonical_type")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return { kind: "duplicate" };
    }
    return { kind: "unstorable", error: insertError.message };
  }

  if (!data) {
    return { kind: "unstorable", error: "Insert returned no row." };
  }

  return {
    kind: "stored",
    event: data as {
      id: string;
      status: InboundEventStatus;
      canonical_type: CanonicalEventType | null;
    },
  };
}

async function triggerProcess(
  db: ReturnType<typeof createClient>,
  eventId: string
): Promise<void> {
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (!cronSecret) {
    console.error("CRON_SECRET is not set; deferred process skipped for", eventId);
    return;
  }

  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "staff_base_url")
    .maybeSingle();

  const staffBase = (
    (typeof setting?.value === "string" && setting.value.trim()) ||
    Deno.env.get("STAFF_BASE_URL") ||
    "https://admin.vistrial.io"
  ).replace(/\/$/, "");

  const url = `${staffBase}/api/jobs/process-inbound`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "Deferred process failed",
        eventId,
        response.status,
        detail.slice(0, 200)
      );
    }
  } catch (thrown) {
    console.error(
      "Deferred process could not reach ledger",
      eventId,
      thrown instanceof Error ? thrown.message : String(thrown)
    );
  }
}
