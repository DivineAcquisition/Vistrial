"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { dismissStoredEvent, processStoredEvent } from "@/lib/ingest/pipeline";
import {
  CLIENT_BASE_URL_KEY,
  EMAIL_FROM_KEY,
  EMAIL_REPLY_TO_KEY,
  STAFF_BASE_URL_KEY,
  WEBHOOK_BASE_URL_KEY,
  webhookBaseUrl,
} from "@/lib/settings/urls";
import { appendActivity } from "@/lib/team/activity";
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
  "appointment.booked",
  "appointment.showed",
  "appointment.no_show",
  "message.sent",
  "widget.exploded",
] as const;

const BOOKING_TYPES = new Set<string>([
  "appointment.booked",
  "appointment.showed",
  "appointment.no_show",
]);

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
  scheduledFor: z.string().trim().max(60).optional(),
  appointmentId: z.string().trim().max(200).optional(),
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const httpUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "URL must start with http:// or https://.",
  });

/**
 * Sends a payload through the real endpoint with the client's real secret. It
 * has no privileged path of its own: authentication, logging, idempotency, and
 * processing are all the ones an external provider gets.
 */
export async function sendTestEvent(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requirePermission("manage_commercial");

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
    scheduledFor: value(formData, "scheduledFor"),
    appointmentId: value(formData, "appointmentId"),
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

  if (BOOKING_TYPES.has(input.eventType)) {
    payload.appointment_id = input.appointmentId ?? `test-appt-${crypto.randomUUID()}`;
    payload.appointment_type = input.jobType ?? null;

    if (input.eventType === "appointment.booked") {
      // A booking with no time cannot become an appointment, so the tool
      // defaults to one rather than silently sending an unusable payload.
      const scheduled = input.scheduledFor
        ? new Date(input.scheduledFor)
        : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      payload.start_time = Number.isNaN(scheduled.getTime())
        ? input.scheduledFor ?? null
        : scheduled.toISOString();
    }
  } else if (
    input.eventType !== "lead.received" &&
    input.eventType !== "contact.updated"
  ) {
    payload.channel = input.channel ?? "sms";
  }

  let response: Response;
  try {
    // Posts to the configured webhook base URL (Supabase Edge Function), never
    // inferred from the incoming request host.
    response = await fetch(await webhookBaseUrl(), {
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
  revalidatePath("/appointments");
  revalidatePath("/queue");

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
  await requirePermission("manage_commercial");

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

/** Owner-only. Records the notify address used for lockouts and alerts. */
export async function saveIntegrationNotifyEmailAction(input: {
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await requirePermission("integration_secrets");
    const email = input.email.trim();
    if (!email || !email.includes("@")) {
      return { ok: false, error: "Enter a valid email." };
    }

    const db = createServiceClient();
    const { error } = await db.from("app_settings").upsert({
      key: "admin_notify_email",
      value: email,
    });
    if (error) return { ok: false, error: error.message };

    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "integration_settings_changed",
      subjectTeamUserId: admin.team.id,
      detail: { field: "admin_notify_email" },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

const domainSettingsSchema = z.object({
  staffBaseUrl: httpUrlSchema,
  clientBaseUrl: httpUrlSchema,
  webhookBaseUrl: httpUrlSchema,
  emailFrom: z.string().trim().min(3, "Enter a from address."),
  emailReplyTo: z.string().trim().email("Enter a valid reply-to email."),
});

/** Owner/Admin. Base URLs and mail identity — changeable without a deploy. */
export async function saveDomainSettingsAction(input: {
  staffBaseUrl: string;
  clientBaseUrl: string;
  webhookBaseUrl: string;
  emailFrom: string;
  emailReplyTo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await requirePermission("manage_commercial");
    const parsed = domainSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues.map((issue) => issue.message).join(" "),
      };
    }

    const db = createServiceClient();
    const rows = [
      {
        key: STAFF_BASE_URL_KEY,
        value: parsed.data.staffBaseUrl.replace(/\/$/, ""),
      },
      {
        key: CLIENT_BASE_URL_KEY,
        value: parsed.data.clientBaseUrl.replace(/\/$/, ""),
      },
      {
        key: WEBHOOK_BASE_URL_KEY,
        value: parsed.data.webhookBaseUrl.replace(/\/$/, ""),
      },
      { key: EMAIL_FROM_KEY, value: parsed.data.emailFrom },
      { key: EMAIL_REPLY_TO_KEY, value: parsed.data.emailReplyTo },
    ];

    for (const row of rows) {
      const { error } = await db.from("app_settings").upsert(row);
      if (error) return { ok: false, error: error.message };
    }

    await appendActivity(db, {
      actorTeamUserId: admin.team.id,
      actorEmail: admin.email,
      action: "integration_settings_changed",
      subjectTeamUserId: admin.team.id,
      detail: { field: "domain_settings" },
    });

    revalidatePath("/settings");
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
