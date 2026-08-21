import "server-only";

import { WEBHOOK_MAX_ATTEMPTS } from "@/lib/ghl/constants";
import { disconnectGhl } from "@/lib/ghl/connect";
import { fetchUser } from "@/lib/ghl/client";
import { normalizeEventKind } from "@/lib/ghl/events";
import {
  answersEqual,
  applyGhlFieldMaps,
  mergeAnswers,
  type GhlFieldMap,
} from "@/lib/ghl/field-map";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import {
  appointmentFromPayload,
  contactFromPayload,
  inboundTouchSummary,
  isAutomationOutbound,
  mapAppointmentOutcome,
  mapMessageChannel,
  messageIdFromPayload,
  occurredAtFromPayload,
  outboundTouchSummary,
  pick,
  timezoneFromContact,
} from "@/lib/ghl/message-meta";
import { asJsonRecord } from "@/lib/ghl/payload";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import { scoreInboundReplyAfterSilence, scoreLeadFromAnswerChange, scoreNoShow } from "@/lib/scoring/event-apply";
import { scoreLeadOnIntake } from "@/lib/scoring/intake";
import { assertScorePersisted, loadScoreConfig } from "@/lib/scoring/store";
import { calendarDaysBetween } from "@/lib/scoring/timezone";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Database, Json } from "@/types/database";

type WebhookRow = Database["public"]["Tables"]["webhook_events"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export async function processGhlWebhookQueue(db: GhlDb, maxContacts = 20): Promise<{
  contacts: number;
  events: number;
  failed: number;
}> {
  let contacts = 0;
  let events = 0;
  let failed = 0;

  for (let i = 0; i < maxContacts; i += 1) {
    const { data: key, error } = await db.rpc("claim_ghl_contact_key");
    if (error) {
      ghlError("ghl.process.claim_failed", { code: error.code });
      break;
    }
    if (!key) break;
    contacts += 1;
    try {
      const batch = await loadClaimedEvents(db, key);
      for (const event of batch) {
        try {
          await processOneEvent(db, event);
          events += 1;
        } catch (cause) {
          failed += 1;
          await markEventFailure(db, event, cause);
        }
      }
    } finally {
      await db.rpc("release_ghl_contact_key", { p_key: key });
    }
  }

  return { contacts, events, failed };
}

async function loadClaimedEvents(db: GhlDb, key: string): Promise<WebhookRow[]> {
  if (key.startsWith("id:")) {
    const id = key.slice(3);
    const { data } = await db
      .from("webhook_events")
      .select("*")
      .eq("id", id)
      .eq("processed", false)
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .maybeSingle();
    return data ? [data] : [];
  }

  const { data } = await db
    .from("webhook_events")
    .select("*")
    .eq("source", "ghl")
    .eq("contact_key", key)
    .eq("processed", false)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("received_at", { ascending: true })
    .limit(100);
  return data ?? [];
}

async function processOneEvent(db: GhlDb, event: WebhookRow): Promise<void> {
  const payload = asJsonRecord(event.payload);
  const orgId = event.org_id ?? (await resolveOrgFromPayload(db, payload));
  const kind = normalizeEventKind(event.event_type);

  if (!orgId && kind !== "ignored" && kind !== "install") {
    throw new Error("unresolved_org");
  }

  if (orgId && event.org_id !== orgId) {
    await db.from("webhook_events").update({ org_id: orgId }).eq("id", event.id);
  }

  switch (kind) {
    case "contact_created":
      await handleContact(db, orgId as string, event, payload, true);
      break;
    case "contact_updated":
      await handleContact(db, orgId as string, event, payload, false);
      break;
    case "inbound_message":
      await handleInbound(db, orgId as string, event, payload);
      break;
    case "outbound_message":
      await handleOutbound(db, orgId as string, event, payload);
      break;
    case "appointment_booked":
      await handleAppointmentBooked(db, orgId as string, event, payload);
      break;
    case "appointment_status":
      await handleAppointmentStatus(db, orgId as string, event, payload);
      break;
    case "opportunity_stage":
      await handleOpportunity(db, orgId as string, payload);
      break;
    case "uninstall":
      await disconnectGhl(db, orgId as string);
      break;
    case "install":
      break;
    case "ignored":
      await markEventUnsupported(db, event);
      return;
  }

  await markEventProcessed(db, event.id);
  ghlLog("ghl.webhook.processed", {
    eventId: event.id,
    eventType: event.event_type,
    kind,
    orgId: orgId ?? null,
  });
}

async function resolveOrgFromPayload(db: GhlDb, payload: Record<string, unknown>): Promise<string | null> {
  const locationId = pick(payload, ["locationId", "location_id"]);
  if (!locationId) return null;
  const { data } = await db
    .from("organizations")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadFieldMaps(db: GhlDb, orgId: string): Promise<GhlFieldMap[]> {
  const { data } = await db
    .from("ghl_field_maps")
    .select("id, ghl_field_id, ghl_field_key, answer_key")
    .eq("org_id", orgId);
  return (data ?? []).map((row) => ({
    id: row.id,
    ghlFieldId: row.ghl_field_id,
    ghlFieldKey: row.ghl_field_key,
    answerKey: row.answer_key,
  }));
}

function identityFromContact(contact: Record<string, unknown>) {
  const attribution = (contact.attributionSource ?? contact.attribution) as Record<string, unknown> | undefined;
  return {
    first_name: pick(contact, ["firstName", "first_name"]),
    last_name: pick(contact, ["lastName", "last_name"]),
    email: pick(contact, ["email"]),
    phone: pick(contact, ["phone"]),
    source: pick(contact, ["source"]) ?? pick(attribution ?? null, ["sessionSource", "medium", "source"]),
    campaign: pick(contact, ["campaign"]) ?? pick(attribution ?? null, ["campaign", "utmCampaign"]),
    opted_in_at: pick(contact, ["dateAdded", "date_added", "createdAt"]),
    timezone: timezoneFromContact(contact),
  };
}

async function findOrCreateLead(
  db: GhlDb,
  orgId: string,
  contactId: string,
  fields: ReturnType<typeof identityFromContact>,
  answers: Record<string, unknown>
): Promise<{ lead: LeadRow; created: boolean }> {
  const { data: existing } = await db
    .from("leads")
    .select("*")
    .eq("org_id", orgId)
    .eq("ghl_contact_id", contactId)
    .maybeSingle();
  if (existing) {
    if (fields.timezone && existing.timezone !== fields.timezone) {
      const { data: updated } = await db
        .from("leads")
        .update({ timezone: fields.timezone })
        .eq("id", existing.id)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      return { lead: updated ?? { ...existing, timezone: fields.timezone }, created: false };
    }
    return { lead: existing, created: false };
  }

  const isTest = contactId.startsWith("vistrial-golive-");
  const { data, error } = await db
    .from("leads")
    .insert({
      org_id: orgId,
      ghl_contact_id: contactId,
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email,
      phone: fields.phone,
      source: isTest ? "vistrial_golive" : fields.source,
      campaign: fields.campaign,
      application_answers: answers as Json,
      status: "new",
      is_test: isTest,
      ...(fields.timezone ? { timezone: fields.timezone } : {}),
      ...(fields.opted_in_at ? { opted_in_at: fields.opted_in_at } : {}),
    })
    .select("*")
    .maybeSingle();

  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("leads")
      .select("*")
      .eq("org_id", orgId)
      .eq("ghl_contact_id", contactId)
      .maybeSingle();
    if (raced) return { lead: raced, created: false };
  }
  if (error || !data) throw new Error("lead_insert_failed");
  return { lead: data, created: true };
}

async function handleContact(
  db: GhlDb,
  orgId: string,
  event: WebhookRow,
  payload: Record<string, unknown>,
  createdEvent: boolean
) {
  const contact = contactFromPayload(payload);
  const contactId = pick(contact, ["id", "contactId", "contact_id"]) ?? pick(payload, ["contactId", "contact_id"]);
  if (!contactId) throw new Error("missing_contact_id");

  const maps = await loadFieldMaps(db, orgId);
  const mapped = applyGhlFieldMaps(contact, maps);
  const identity = identityFromContact(contact);
  const { lead, created } = await findOrCreateLead(db, orgId, contactId, identity, mapped);

  const existingAnswers = asJsonRecord(lead.application_answers);
  const nextAnswers = mergeAnswers(existingAnswers, mapped);
  const answersChanged = !answersEqual(existingAnswers, nextAnswers);

  await db
    .from("leads")
    .update({
      first_name: identity.first_name ?? lead.first_name,
      last_name: identity.last_name ?? lead.last_name,
      email: identity.email ?? lead.email,
      phone: identity.phone ?? lead.phone,
      source: identity.source ?? lead.source,
      campaign: identity.campaign ?? lead.campaign,
      application_answers: nextAnswers as Json,
      ...(identity.timezone ? { timezone: identity.timezone } : {}),
    })
    .eq("id", lead.id)
    .eq("org_id", orgId);

  if (created) {
    assertScorePersisted(
      await scoreLeadOnIntake(db, {
        orgId,
        leadId: lead.id,
        answers: nextAnswers as Json,
      })
    );
  } else if (answersChanged) {
    assertScorePersisted(
      await scoreLeadFromAnswerChange(db, {
        orgId,
        leadId: lead.id,
        answers: nextAnswers as Json,
        idempotencyKey: `event:contact_update:${event.id}`,
      })
    );
  } else if (createdEvent) {
    assertScorePersisted(
      await scoreLeadOnIntake(db, {
        orgId,
        leadId: lead.id,
        answers: nextAnswers as Json,
      })
    );
  }
}

async function requireLead(db: GhlDb, orgId: string, payload: Record<string, unknown>): Promise<LeadRow> {
  const contact = contactFromPayload(payload);
  const contactId =
    pick(payload, ["contactId", "contact_id"]) ?? pick(contact, ["id", "contactId", "contact_id"]);
  if (!contactId) throw new Error("missing_contact_id");
  const { lead } = await findOrCreateLead(db, orgId, contactId, identityFromContact(contact), {});
  return lead;
}

async function handleInbound(db: GhlDb, orgId: string, event: WebhookRow, payload: Record<string, unknown>) {
  const lead = await requireLead(db, orgId, payload);
  const messageId = messageIdFromPayload(payload);
  if (messageId && (await touchExists(db, orgId, messageId))) {
    return;
  }

  const channel = mapMessageChannel(pick(payload, ["messageType", "message_type", "type"]));
  const occurredAt = occurredAtFromPayload(payload);
  const previousTouch = lead.last_touch_at ?? lead.opted_in_at;
  const { data: org } = await db.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const timezone = org?.timezone ?? "America/New_York";
  const config = await loadScoreConfig(db, orgId);
  const daysSilent = calendarDaysBetween(new Date(previousTouch), new Date(occurredAt), timezone);

  const { data: touch, error } = await db
    .from("touches")
    .insert({
      org_id: orgId,
      lead_id: lead.id,
      type: "system",
      channel,
      direction: "inbound",
      summary: inboundTouchSummary(channel),
      ghl_message_id: messageId,
      occurred_at: occurredAt,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") return;
  if (error || !touch) throw new Error("touch_insert_failed");

  assertScorePersisted(
    await scoreInboundReplyAfterSilence(db, {
      orgId,
      leadId: lead.id,
      touchId: touch.id,
      daysSilentBeforeTouch: daysSilent,
      ghostDaysSoft: config.ghostDaysSoft,
    })
  );
}

async function handleOutbound(db: GhlDb, orgId: string, _event: WebhookRow, payload: Record<string, unknown>) {
  const lead = await requireLead(db, orgId, payload);
  const messageId = messageIdFromPayload(payload);
  if (messageId) {
    if (await touchExists(db, orgId, messageId)) return;
    const { data: dispatch } = await db
      .from("ghl_dispatches")
      .select("id")
      .eq("org_id", orgId)
      .eq("ghl_message_id", messageId)
      .maybeSingle();
    if (dispatch) return;
  }

  const channel = mapMessageChannel(pick(payload, ["messageType", "message_type", "type"]));
  const automated = isAutomationOutbound(payload);
  const userId = pick(payload, ["userId", "user_id"]);
  let actorId: string | null = null;
  if (!automated && userId) {
    actorId = await resolveActor(db, orgId, userId);
  }
  const type = actorId ? "human" : "system";

  const { error } = await db.from("touches").insert({
    org_id: orgId,
    lead_id: lead.id,
    type,
    channel,
    direction: "outbound",
    actor_member_id: actorId,
    summary: outboundTouchSummary(channel, type),
    ghl_message_id: messageId,
    occurred_at: occurredAtFromPayload(payload),
  });
  if (error?.code === "23505") return;
  if (error) throw new Error("touch_insert_failed");
}

async function handleAppointmentBooked(db: GhlDb, orgId: string, _event: WebhookRow, payload: Record<string, unknown>) {
  const lead = await requireLead(db, orgId, payload);
  const appt = appointmentFromPayload(payload);
  const appointmentId = pick(appt, ["id", "appointmentId", "appointment_id"]);
  const scheduledAt =
    pick(appt, ["startTime", "start_time", "appointmentStartTime", "scheduledAt"]) ??
    pick(payload, ["startTime", "start_time"]);

  const { error } = await db.from("calls").insert({
    org_id: orgId,
    lead_id: lead.id,
    type: "triage",
    scheduled_at: scheduledAt,
    ghl_appointment_id: appointmentId,
  });
  if (error && error.code !== "23505") throw new Error("call_insert_failed");

  await db.from("leads").update({ status: "call_booked" }).eq("id", lead.id).eq("org_id", orgId);
}

async function handleAppointmentStatus(db: GhlDb, orgId: string, _event: WebhookRow, payload: Record<string, unknown>) {
  const lead = await requireLead(db, orgId, payload);
  const appt = appointmentFromPayload(payload);
  const appointmentId = pick(appt, ["id", "appointmentId", "appointment_id"]);
  const status = pick(appt, ["appointmentStatus", "status", "appoinmentStatus"]);
  const outcome = mapAppointmentOutcome(status);
  const scheduledAt = pick(appt, ["startTime", "start_time", "appointmentStartTime"]);

  let callId: string | null = null;
  if (appointmentId) {
    const { data: existing } = await db
      .from("calls")
      .select("id")
      .eq("org_id", orgId)
      .eq("ghl_appointment_id", appointmentId)
      .maybeSingle();
    callId = existing?.id ?? null;
  }

  if (!callId) {
    const { data: created, error } = await db
      .from("calls")
      .insert({
        org_id: orgId,
        lead_id: lead.id,
        type: "triage",
        scheduled_at: scheduledAt,
        outcome,
        ghl_appointment_id: appointmentId,
      })
      .select("id")
      .maybeSingle();
    if (error && error.code !== "23505") throw new Error("call_insert_failed");
    callId = created?.id ?? null;
  } else {
    await db
      .from("calls")
      .update({
        outcome,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      })
      .eq("id", callId)
      .eq("org_id", orgId);
  }

  if (outcome === "no_show") {
    await db.from("leads").update({ status: "no_show" }).eq("id", lead.id).eq("org_id", orgId);
    if (callId) {
      assertScorePersisted(await scoreNoShow(db, { orgId, leadId: lead.id, callId }));
    }
  } else if (outcome === "cancelled") {
    await db.from("leads").update({ status: "follow_up" }).eq("id", lead.id).eq("org_id", orgId);
  }
}

async function handleOpportunity(db: GhlDb, orgId: string, payload: Record<string, unknown>) {
  const lead = await requireLead(db, orgId, payload);
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const opportunityId = pick(payload, ["opportunityId", "id"]) ?? pick(data, ["id", "opportunityId"]);
  const stage =
    pick(payload, ["pipelineStage", "pipelineStageId", "stage"]) ??
    pick(data, ["pipelineStage", "pipelineStageId", "status", "stage"]);
  await db
    .from("leads")
    .update({
      pipeline_stage: stage ?? lead.pipeline_stage,
      ghl_opportunity_id: opportunityId ?? lead.ghl_opportunity_id,
    })
    .eq("id", lead.id)
    .eq("org_id", orgId);
}

async function touchExists(db: GhlDb, orgId: string, messageId: string): Promise<boolean> {
  const { data } = await db
    .from("touches")
    .select("id")
    .eq("org_id", orgId)
    .eq("ghl_message_id", messageId)
    .maybeSingle();
  return Boolean(data);
}

async function resolveActor(db: GhlDb, orgId: string, ghlUserId: string): Promise<string | null> {
  const { data: byId } = await db
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("ghl_user_id", ghlUserId)
    .maybeSingle();
  if (byId) return byId.id;

  const user = await fetchUser(db, orgId, ghlUserId);
  const email = typeof user.json?.email === "string" ? user.json.email.trim().toLowerCase() : null;
  if (!email) return null;
  const { data: byEmail } = await db
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle();
  if (!byEmail) return null;
  await db.from("org_members").update({ ghl_user_id: ghlUserId }).eq("id", byEmail.id).eq("org_id", orgId);
  return byEmail.id;
}

async function markEventUnsupported(db: GhlDb, event: WebhookRow) {
  ghlError("ghl.webhook.unsupported", {
    eventId: event.id,
    eventType: event.event_type,
  });
  await db
    .from("webhook_events")
    .update({
      processed: true,
      status: "dead",
      processed_at: new Date().toISOString(),
      error_text: "unsupported_event_type",
    })
    .eq("id", event.id);
}

async function markEventProcessed(db: GhlDb, id: string) {
  await db
    .from("webhook_events")
    .update({
      processed: true,
      status: "processed",
      processed_at: new Date().toISOString(),
      error_text: null,
    })
    .eq("id", id);
}

async function markEventFailure(db: GhlDb, event: WebhookRow, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "process_failed";
  const attempts = event.attempt_count + 1;
  const dead = shouldMarkDead(attempts, WEBHOOK_MAX_ATTEMPTS);
  ghlError("ghl.webhook.failed", {
    eventId: event.id,
    eventType: event.event_type,
    attempts,
    dead,
    reason: message,
  });
  await db
    .from("webhook_events")
    .update({
      attempt_count: attempts,
      error_text: message.slice(0, 500),
      status: dead ? "dead" : "pending",
      processed: dead,
      processed_at: dead ? new Date().toISOString() : null,
      next_attempt_at: dead ? new Date().toISOString() : nextAttemptAt(attempts),
    })
    .eq("id", event.id);
}

export async function retryDeadEvent(db: GhlDb, orgId: string, eventId: string): Promise<boolean> {
  const { data } = await db
    .from("webhook_events")
    .update({
      status: "pending",
      processed: false,
      processed_at: null,
      attempt_count: 0,
      error_text: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("org_id", orgId)
    .eq("status", "dead")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}
