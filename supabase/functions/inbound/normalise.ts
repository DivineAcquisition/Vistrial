/**
 * Payload normalisation for the inbound webhook.
 *
 * GoHighLevel workflows, Facebook lead forms, and the landing page all post to
 * one endpoint and none of them agree on field names. Everything here is a
 * tolerant read of a payload we do not control: it never throws, and it never
 * infers meaning the sender did not declare. In particular, whether a touch was
 * automated or human is read from a declared field and never guessed at from the
 * body of the message — a wrong stamp corrupts the figure the business is paid on.
 */

import type {
  CanonicalEventType,
  Json,
  LeadSource,
  TouchChannel,
} from "./types.ts";

export type EventClassification =
  | { kind: "recognised"; canonical: CanonicalEventType }
  /** A contact attempt that never said whether it was automated or human. */
  | { kind: "undeclared_touch" }
  | { kind: "unknown" };

export type NormalisedEvent = {
  /** The type string exactly as the sender declared it. */
  declaredType: string | null;
  classification: EventClassification;
  providerEventId: string | null;
  /** Provider-supplied timestamp, ISO, or null when it supplied none. */
  occurredAt: string | null;
  locationId: string | null;
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    externalId: string | null;
  };
  jobType: string | null;
  channel: TouchChannel | null;
  booking: {
    /** When the appointment is scheduled for, ISO, or null when none was given. */
    scheduledFor: string | null;
    appointmentType: string | null;
    /**
     * The provider's identifier for the appointment itself, not for the
     * delivery. The same booking rescheduled arrives carrying the same one.
     */
    providerAppointmentId: string | null;
    /** The provider's own appointment status, verbatim, where it declared one. */
    declaredStatus: string | null;
  };
  campaign: {
    externalId: string | null;
    name: string | null;
    platform: string | null;
  };
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
  };
};

type Payload = Record<string, unknown>;

function isRecord(value: unknown): value is Payload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a dotted path, returning null for anything that is not a scalar. */
function read(payload: Payload, path: string): string | null {
  const segments = path.split(".");
  let current: unknown = payload;

  for (const segment of segments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }

  if (typeof current === "string") {
    const trimmed = current.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof current === "number" && Number.isFinite(current)) {
    return String(current);
  }
  if (typeof current === "boolean") return current ? "true" : "false";
  return null;
}

function first(payload: Payload, paths: string[]): string | null {
  for (const path of paths) {
    const value = read(payload, path);
    if (value !== null) return value;
  }
  return null;
}

const TYPE_PATHS = [
  "event_type",
  "eventType",
  "type",
  "event",
  "event.type",
  "webhook_type",
  "workflow_event",
];

const EVENT_ID_PATHS = [
  "event_id",
  "eventId",
  "idempotency_key",
  "idempotencyKey",
  "webhook_id",
  "webhookId",
  "delivery_id",
  "deliveryId",
  "message_id",
  "messageId",
];

const TIMESTAMP_PATHS = [
  "occurred_at",
  "occurredAt",
  "arrived_at",
  "arrivedAt",
  "timestamp",
  "date_created",
  "dateCreated",
  "dateAdded",
  "date_added",
  "created_at",
  "createdAt",
];

const LOCATION_PATHS = [
  "location_id",
  "locationId",
  "location.id",
  "ghl_location_id",
  "ghlLocationId",
];

const NAME_PATHS = [
  "name",
  "full_name",
  "fullName",
  "contact.name",
  "contact.full_name",
  "contact.fullName",
  "contact_name",
];

const FIRST_NAME_PATHS = [
  "first_name",
  "firstName",
  "contact.first_name",
  "contact.firstName",
];

const LAST_NAME_PATHS = [
  "last_name",
  "lastName",
  "contact.last_name",
  "contact.lastName",
];

const PHONE_PATHS = [
  "phone",
  "phone_number",
  "phoneNumber",
  "contact.phone",
  "contact.phone_number",
  "contact.phoneNumber",
];

const EMAIL_PATHS = ["email", "contact.email", "contact.email_address"];

const CONTACT_ID_PATHS = [
  "contact_id",
  "contactId",
  "contact.id",
  "lead_id",
  "leadId",
];

const JOB_TYPE_PATHS = [
  "job_type",
  "jobType",
  "service",
  "service_type",
  "serviceType",
  "customData.job_type",
  "customData.jobType",
  "custom_data.job_type",
];

const CHANNEL_PATHS = ["channel", "touch.channel", "message_type", "messageType"];

const SCHEDULED_PATHS = [
  "scheduled_for",
  "scheduledFor",
  "appointment.scheduled_for",
  "appointment.start_time",
  "appointment.startTime",
  "appointment_time",
  "appointmentTime",
  "start_time",
  "startTime",
  "calendar.startTime",
  "calendar.start_time",
  "booking.start_time",
  "booking.startTime",
  "appointment_date",
  "appointmentDate",
];

const APPOINTMENT_ID_PATHS = [
  "appointment_id",
  "appointmentId",
  "appointment.id",
  "calendar.appointmentId",
  "calendar.appointment_id",
  "booking_id",
  "bookingId",
  "booking.id",
];

const APPOINTMENT_TYPE_PATHS = [
  "appointment_type",
  "appointmentType",
  "appointment.title",
  "appointment.type",
  "calendar.title",
  "calendar_name",
  "calendarName",
  "booking.title",
];

const APPOINTMENT_STATUS_PATHS = [
  "appointment_status",
  "appointmentStatus",
  "appointment.status",
  "calendar.appointmentStatus",
  "booking.status",
  "status",
];

const CAMPAIGN_ID_PATHS = [
  "campaign_id",
  "campaignId",
  "campaign.id",
  "ad_campaign_id",
  "adCampaignId",
];

const CAMPAIGN_NAME_PATHS = [
  "campaign_name",
  "campaignName",
  "campaign.name",
  "campaign",
];

const PLATFORM_PATHS = ["platform", "campaign.platform", "ad_platform"];

/** A declared actor. Nothing else is consulted — message bodies never are. */
const ACTOR_PATHS = [
  "actor",
  "touch.actor",
  "touch_actor",
  "touchActor",
  "sender_type",
  "senderType",
  "initiated_by",
  "initiatedBy",
  "source",
  "sent_by",
  "sentBy",
];

const SYSTEM_ACTORS = new Set([
  "system",
  "automated",
  "automation",
  "workflow",
  "bot",
  "ai",
]);

const HUMAN_ACTORS = new Set([
  "human",
  "manual",
  "agent",
  "user",
  "staff",
  "rep",
]);

const LEAD_TYPES = new Set([
  "lead.received",
  "lead_received",
  "lead.created",
  "lead",
  "new_lead",
  "inboundlead",
  "inbound_lead",
  "form.submitted",
  "form_submission",
  "formsubmission",
  "contactcreate",
  "contact.create",
  "contact.created",
]);

const SYSTEM_TOUCH_TYPES = new Set([
  "touch.system",
  "system_touch",
  "system.touch",
  "automation.message",
  "workflow.message",
  "workflow_message",
  "automated_message",
]);

const HUMAN_TOUCH_TYPES = new Set([
  "touch.human",
  "human_touch",
  "human.touch",
  "manual_message",
  "manual.message",
  "call",
  "call.completed",
  "outboundcall",
  "outbound_call",
  "phone_call",
]);

const CONTACT_UPDATED_TYPES = new Set([
  "contact.updated",
  "contact_updated",
  "contactupdate",
  "contact.update",
  "lead.updated",
  "lead_updated",
]);

const BOOKING_TYPES = new Set([
  "appointment.booked",
  "appointment_booked",
  "appointment.created",
  "appointment_created",
  "appointmentcreate",
  "appointment.scheduled",
  "appointment.rescheduled",
  "appointment_rescheduled",
  "booking",
  "booking.created",
  "booking_created",
]);

const SHOWED_TYPES = new Set([
  "appointment.showed",
  "appointment_showed",
  "appointment.completed",
  "appointment_completed",
  "appointmentcomplete",
  "appointment.attended",
  "showed",
]);

const NO_SHOW_TYPES = new Set([
  "appointment.no_show",
  "appointment.noshow",
  "appointment_no_show",
  "appointment_noshow",
  "appointment.missed",
  "no_show",
  "noshow",
]);

/**
 * Appointment events that say only that something changed. What changed is read
 * from the provider's own appointment status, never inferred from the payload
 * shape, because a booking mistaken for a show is a booking billed too early.
 */
const AMBIGUOUS_APPOINTMENT_TYPES = new Set([
  "appointment",
  "appointment.updated",
  "appointment_updated",
  "appointmentupdate",
  "appointment.status_changed",
  "booking.updated",
  "bookingupdate",
]);

const SHOWED_STATUSES = new Set(["showed", "show", "completed", "attended", "complete"]);

const NO_SHOW_STATUSES = new Set(["noshow", "no_show", "missed", "did_not_attend"]);

const BOOKED_STATUSES = new Set([
  "booked",
  "confirmed",
  "scheduled",
  "new",
  "rescheduled",
  "pending",
  "unconfirmed",
]);

/** Contact attempts that carry no actor of their own and must declare one. */
const AMBIGUOUS_TOUCH_TYPES = new Set([
  "touch",
  "touch.recorded",
  "message",
  "message.sent",
  "message_sent",
  "outboundmessage",
  "outbound_message",
  "sms",
  "sms.sent",
  "email.sent",
  "note",
  "note.added",
  "conversation.message",
]);

const CHANNELS = new Set<TouchChannel>(["sms", "email", "call", "dm", "other"]);

const CHANNEL_ALIASES: Record<string, TouchChannel> = {
  text: "sms",
  "sms/text": "sms",
  phone: "call",
  voice: "call",
  voicemail: "call",
  mail: "email",
  dm: "dm",
  instagram: "dm",
  facebook: "dm",
  messenger: "dm",
  whatsapp: "dm",
};

function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function declaredActor(payload: Payload): "system" | "human" | null {
  const automated = payload["automated"] ?? payload["is_automated"];
  if (typeof automated === "boolean") return automated ? "system" : "human";

  for (const path of ACTOR_PATHS) {
    const value = read(payload, path);
    if (value === null) continue;
    const key = normaliseKey(value);
    if (SYSTEM_ACTORS.has(key)) return "system";
    if (HUMAN_ACTORS.has(key)) return "human";
  }

  return null;
}

export function classifyEvent(payload: Payload): {
  declaredType: string | null;
  classification: EventClassification;
} {
  const declaredType = first(payload, TYPE_PATHS);
  if (declaredType === null) {
    return { declaredType: null, classification: { kind: "unknown" } };
  }

  const key = normaliseKey(declaredType);
  const recognised = (canonical: CanonicalEventType) =>
    ({ declaredType, classification: { kind: "recognised", canonical } }) as const;

  if (LEAD_TYPES.has(key)) return recognised("lead_received");
  if (SYSTEM_TOUCH_TYPES.has(key)) return recognised("system_touch");
  if (HUMAN_TOUCH_TYPES.has(key)) return recognised("human_touch");
  if (CONTACT_UPDATED_TYPES.has(key)) return recognised("contact_updated");
  if (BOOKING_TYPES.has(key)) return recognised("appointment_booked");
  if (SHOWED_TYPES.has(key)) return recognised("appointment_showed");
  if (NO_SHOW_TYPES.has(key)) return recognised("appointment_no_show");

  if (AMBIGUOUS_APPOINTMENT_TYPES.has(key)) {
    const declared = first(payload, APPOINTMENT_STATUS_PATHS);
    const status = declared === null ? null : normaliseKey(declared);

    if (status !== null && SHOWED_STATUSES.has(status)) {
      return recognised("appointment_showed");
    }
    if (status !== null && NO_SHOW_STATUSES.has(status)) {
      return recognised("appointment_no_show");
    }
    if (status !== null && BOOKED_STATUSES.has(status)) {
      return recognised("appointment_booked");
    }

    // A cancellation, or a status this system has no rule for. Guessing here
    // would put a charge on the line, so it waits for an admin instead.
    return { declaredType, classification: { kind: "unknown" } };
  }

  if (AMBIGUOUS_TOUCH_TYPES.has(key)) {
    const actor = declaredActor(payload);
    if (actor === "system") return recognised("system_touch");
    if (actor === "human") return recognised("human_touch");
    return { declaredType, classification: { kind: "undeclared_touch" } };
  }

  return { declaredType, classification: { kind: "unknown" } };
}

function normaliseChannel(value: string | null): TouchChannel | null {
  if (value === null) return null;
  const key = normaliseKey(value);
  if (CHANNELS.has(key as TouchChannel)) return key as TouchChannel;
  return CHANNEL_ALIASES[key] ?? "other";
}

function normaliseTimestamp(value: string | null): string | null {
  if (value === null) return null;

  // Epoch seconds and milliseconds both turn up in provider payloads.
  if (/^\d{10}$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  if (/^\d{13}$/.test(value)) return new Date(Number(value)).toISOString();

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function fullName(payload: Payload): string | null {
  const whole = first(payload, NAME_PATHS);
  if (whole !== null) return whole;

  const parts = [
    first(payload, FIRST_NAME_PATHS),
    first(payload, LAST_NAME_PATHS),
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join(" ");
}

/** Digits only, last ten — the shape the database generates for `phone_key`. */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "").slice(-10);
  return digits === "" ? null : digits;
}

/** Lower-cased and trimmed — the shape the database generates for `email_key`. */
export function emailKey(email: string | null | undefined): string | null {
  if (!email) return null;
  const key = email.trim().toLowerCase();
  return key === "" ? null : key;
}

export function normaliseEvent(payload: Json): NormalisedEvent {
  const record: Payload = isRecord(payload) ? payload : {};
  const { declaredType, classification } = classifyEvent(record);

  return {
    declaredType,
    classification,
    providerEventId: first(record, EVENT_ID_PATHS),
    occurredAt: normaliseTimestamp(first(record, TIMESTAMP_PATHS)),
    locationId: first(record, LOCATION_PATHS),
    contact: {
      name: fullName(record),
      phone: first(record, PHONE_PATHS),
      email: first(record, EMAIL_PATHS),
      externalId: first(record, CONTACT_ID_PATHS),
    },
    jobType: first(record, JOB_TYPE_PATHS),
    channel: normaliseChannel(first(record, CHANNEL_PATHS)),
    booking: {
      scheduledFor: normaliseTimestamp(first(record, SCHEDULED_PATHS)),
      appointmentType:
        first(record, APPOINTMENT_TYPE_PATHS) ?? first(record, JOB_TYPE_PATHS),
      providerAppointmentId: first(record, APPOINTMENT_ID_PATHS),
      declaredStatus: first(record, APPOINTMENT_STATUS_PATHS),
    },
    campaign: {
      externalId: first(record, CAMPAIGN_ID_PATHS),
      name: first(record, CAMPAIGN_NAME_PATHS),
      platform: first(record, PLATFORM_PATHS),
    },
    utm: {
      source: first(record, ["utm_source", "utm.source", "utmSource"]),
      medium: first(record, ["utm_medium", "utm.medium", "utmMedium"]),
      campaign: first(record, ["utm_campaign", "utm.campaign", "utmCampaign"]),
      content: first(record, ["utm_content", "utm.content", "utmContent"]),
    },
  };
}

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social"]);
const PAID_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "google"]);

/**
 * A lead with no resolvable campaign is direct, not lost. Attribution gaps never
 * cost us the lead.
 */
export function leadSource(
  event: NormalisedEvent,
  hasCampaign: boolean
): LeadSource {
  if (hasCampaign) return "Paid";

  const medium = event.utm.medium ? normaliseKey(event.utm.medium) : null;
  if (medium !== null) {
    if (PAID_MEDIUMS.has(medium)) return "Paid";
    if (medium === "referral") return "Referral";
    if (medium === "organic") return "Organic";
  }

  const source = event.utm.source ? normaliseKey(event.utm.source) : null;
  if (source !== null && PAID_SOURCES.has(source)) return "Paid";

  return "Direct";
}

/**
 * The idempotency key. Providers retry routinely and a duplicated lead becomes a
 * duplicated appointment, which becomes a duplicated charge. Prefer the
 * provider's own event id; fall back to client, contact identity, and timestamp.
 *
 * A provider that supplies neither an event id nor a timestamp cannot be
 * deduplicated here at all — for those, duplicate resolution on the lead itself
 * is the safety net.
 */
export function idempotencyKey(
  event: NormalisedEvent,
  scope: { clientId: string | null; receivedAt: string }
): string {
  const client = scope.clientId ?? "unattributed";

  if (event.providerEventId !== null) {
    return `${client}:event:${event.providerEventId}`;
  }

  const identity =
    phoneKey(event.contact.phone) ??
    emailKey(event.contact.email) ??
    event.contact.externalId ??
    "anonymous";

  const at = event.occurredAt ?? scope.receivedAt.slice(0, 19);
  const type = event.declaredType ? normaliseKey(event.declaredType) : "untyped";

  return `${client}:${type}:${identity}:${at}`;
}
