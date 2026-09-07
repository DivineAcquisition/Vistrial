import {
  signatureDeadLetterReason,
  writeWebhookDeadLetter,
} from "@/lib/ghl/dead-letter";
import { parseWebhookPayload } from "@/lib/ghl/payload";
import { ghlLog, ghlWarn } from "@/lib/ghl/log";
import { verifyGhlWebhookSignature, type SignatureResult } from "@/lib/ghl/signature";
import type { GhlDb } from "@/lib/ghl/tokens";

export type IngestResult =
  | { httpStatus: 401; reason: "missing" | "invalid" }
  | { httpStatus: 200; duplicate: boolean; insertedId: string | null; orgId: string | null };

export async function ingestGhlWebhook(
  db: GhlDb,
  args: {
    rawBody: string;
    ghlSignature: string | null;
    legacySignature: string | null;
  }
): Promise<IngestResult> {
  const verified: SignatureResult = verifyGhlWebhookSignature({
    rawBody: args.rawBody,
    ghlSignature: args.ghlSignature,
    legacySignature: args.legacySignature,
  });

  if (!verified.ok) {
    await persistRejection(db, verified.reason, args.rawBody);
    ghlWarn("ghl.webhook.rejected", { reason: verified.reason, bytes: args.rawBody.length });
    return { httpStatus: 401, reason: verified.reason };
  }

  const parsed = parseWebhookPayload(args.rawBody);
  const orgId = parsed.locationId ? await orgIdForLocation(db, parsed.locationId) : null;
  const malformed = !parsed.parsed;
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: orgId,
      source: "ghl",
      event_type: parsed.eventType,
      payload: parsed.payload,
      raw_body: args.rawBody,
      provider_event_id: parsed.providerEventId,
      contact_key: parsed.contactKey,
      processed: malformed,
      status: malformed ? "dead" : "pending",
      processed_at: malformed ? now : null,
      error_text: malformed ? "malformed_json" : null,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    ghlLog("ghl.webhook.received", {
      eventType: parsed.eventType,
      providerEventId: parsed.providerEventId,
      orgResolved: Boolean(orgId),
      duplicate: true,
    });
    return { httpStatus: 200, duplicate: true, insertedId: null, orgId };
  }

  if (error) {
    ghlWarn("ghl.webhook.insert_failed", { code: error.code });
    await writeWebhookDeadLetter(
      db,
      {
        orgId,
        reason: "insert_failed",
        eventType: parsed.eventType,
        providerEventId: parsed.providerEventId,
        rawBody: args.rawBody,
        payload: parsed.payload,
      },
      { required: true }
    );
    throw new Error("webhook_insert_failed");
  }

  if (malformed) {
    await writeWebhookDeadLetter(db, {
      orgId,
      webhookEventId: data?.id ?? null,
      reason: "malformed_json",
      eventType: parsed.eventType,
      providerEventId: parsed.providerEventId,
      rawBody: args.rawBody,
      payload: parsed.payload,
    });
  }

  ghlLog("ghl.webhook.received", {
    eventType: parsed.eventType,
    providerEventId: parsed.providerEventId,
    orgResolved: Boolean(orgId),
    duplicate: false,
    eventId: data?.id ?? null,
    malformed,
  });

  return { httpStatus: 200, duplicate: false, insertedId: data?.id ?? null, orgId };
}

async function orgIdForLocation(db: GhlDb, locationId: string): Promise<string | null> {
  const { data } = await db
    .from("organizations")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  return data?.id ?? null;
}

async function persistRejection(db: GhlDb, reason: "missing" | "invalid", rawBody: string) {
  const parsed = parseWebhookPayload(rawBody);
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: null,
      source: "ghl",
      event_type: `rejected.${reason}`,
      payload: parsed.payload,
      raw_body: rawBody,
      processed: true,
      status: "rejected",
      processed_at: new Date().toISOString(),
      error_text: reason,
    })
    .select("id")
    .maybeSingle();

  await writeWebhookDeadLetter(
    db,
    {
      orgId: null,
      webhookEventId: data?.id ?? null,
      reason: signatureDeadLetterReason(reason),
      eventType: parsed.eventType,
      providerEventId: parsed.providerEventId,
      rawBody,
      payload: parsed.payload,
    },
    { required: Boolean(error) || !data }
  );
}
