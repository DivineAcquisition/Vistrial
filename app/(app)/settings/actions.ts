"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { dismissStoredEvent, processStoredEvent } from "@/lib/ingest/pipeline";
import { createServiceClient } from "@/lib/supabase/server";
import type { CanonicalEventType, Json } from "@/types/database";

export type ActionState = { ok: boolean; message: string } | null;

/**
 * The endpoint acknowledges before it processes, so a tool that reports on the
 * result has to let the deferred work land before it re-reads the tables.
 */
const SETTLE_MS = 600;

const TEST_EVENT_TYPES = [
  "lead.received",
  "touch.system",
  "touch.human",
  "contact.updated",
  "message.sent",
  "widget.exploded",
] as const;

const testEventSchema = z.object({
  clientId: z.uuid("Choose a client."),
  eventType: z.enum(TEST_EVENT_TYPES),
  eventId: z.string().trim().max(200).optional(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  jobType: z.string().trim().max(120).optional(),
  channel: z.enum(["sms", "email", "call", "dm", "other"]).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
});

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

async function origin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a payload through the real endpoint with the client's real secret. It
 * has no privileged path of its own: authentication, logging, idempotency, and
 * processing are all the ones an external provider gets.
 */
export async function sendTestEvent(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireUser();

  const parsed = testEventSchema.safeParse({
    clientId: value(formData, "clientId"),
    eventType: value(formData, "eventType"),
    eventId: value(formData, "eventId"),
    name: value(formData, "name"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    jobType: value(formData, "jobType"),
    channel: value(formData, "channel"),
    utmCampaign: value(formData, "utmCampaign"),
  });

  if (!parsed.success) {
    return { ok: false, message: describe(parsed.error) };
  }

  const input = parsed.data;
  const supabase = createServiceClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, name, webhook_secret")
    .eq("id", input.clientId)
    .returns<{ id: string; name: string; webhook_secret: string }[]>()
    .maybeSingle();

  if (error || !client) {
    return { ok: false, message: "That client could not be loaded." };
  }

  const payload: Record<string, Json> = {
    event_type: input.eventType,
    event_id: input.eventId ?? `test-${crypto.randomUUID()}`,
    occurred_at: new Date().toISOString(),
    name: input.name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
  };

  if (input.eventType === "lead.received") {
    payload.job_type = input.jobType ?? null;
    payload.utm_campaign = input.utmCampaign ?? null;
    payload.utm_source = input.utmCampaign ? "facebook" : null;
    payload.utm_medium = input.utmCampaign ? "cpc" : null;
  }

  if (input.eventType !== "lead.received" && input.eventType !== "contact.updated") {
    payload.channel = input.channel ?? "sms";
  }

  let response: Response;
  try {
    response = await fetch(`${await origin()}/api/webhooks/inbound`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vistrial-secret": client.webhook_secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (thrown) {
    return {
      ok: false,
      message: `Could not reach the endpoint: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: string;
    duplicate?: boolean;
    error?: string;
  };

  await wait(SETTLE_MS);
  revalidatePath("/leads");
  revalidatePath("/settings");

  if (!response.ok) {
    return {
      ok: false,
      message: `The endpoint rejected the request (${response.status}): ${body.error ?? "no reason given"}.`,
    };
  }

  if (body.duplicate) {
    return {
      ok: true,
      message: "Accepted and recognised as a repeat delivery. Nothing was created.",
    };
  }

  return {
    ok: true,
    message: `Accepted for ${client.name}. Stored as "${body.status ?? "accepted"}".`,
  };
}

/**
 * Every resolution replays the stored event through the same pipeline an
 * external request goes through, so an admin decision cannot create records that
 * bypass validation. Dismissal only marks the event; nothing is ever deleted.
 */
export async function resolveInboundEvent(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireUser();

  const eventId = value(formData, "eventId");
  const intent = value(formData, "intent");

  if (!eventId) {
    return { ok: false, message: "That event no longer exists." };
  }

  const supabase = createServiceClient();

  if (intent === "dismiss") {
    const result = await dismissStoredEvent(supabase, eventId, "Dismissed by an admin.");
    revalidatePath("/settings");
    return result;
  }

  let resolution: { clientId?: string; canonicalType?: CanonicalEventType; note: string };

  if (intent === "assign") {
    const clientId = value(formData, "clientId");
    if (!clientId) {
      return { ok: false, message: "Choose a client to attribute this event to." };
    }
    resolution = { clientId, note: "Attributed to a client by an admin." };
  } else if (intent === "system_touch" || intent === "human_touch") {
    resolution = {
      canonicalType: intent,
      note: `Classified as a ${intent === "system_touch" ? "system" : "human"} touch by an admin.`,
    };
    const clientId = value(formData, "clientId");
    if (clientId) resolution.clientId = clientId;
  } else if (intent === "retry") {
    resolution = { note: "Retried by an admin." };
  } else {
    return { ok: false, message: "Choose what to do with this event." };
  }

  const result = await processStoredEvent(supabase, eventId, resolution);

  revalidatePath("/settings");
  revalidatePath("/leads");
  return result;
}
