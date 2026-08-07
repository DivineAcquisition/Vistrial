export type ClientStatus = "Onboarding" | "Active" | "Paused" | "Churned";
export type BillOn = "booked" | "showed";
export type LeadSource = "Paid" | "Direct" | "Referral" | "Organic" | "Other";
export type LeadArrivalSource = "payload" | "received";
/** Whether the lead came from an enquiry or was created by a booking. */
export type LeadOrigin = "inquiry" | "booking";
export type TouchType = "system" | "human";
export type TouchChannel = "sms" | "email" | "call" | "dm" | "other";

/** The event types the ingestion pipeline recognises. */
export type CanonicalEventType =
  | "lead_received"
  | "system_touch"
  | "human_touch"
  | "contact_updated"
  | "appointment_booked"
  | "appointment_showed"
  | "appointment_no_show";

/**
 * `unattributed` — no client could be resolved. `unknown` — the declared type is
 * not one this system handles. `unclassified` — a touch that never declared
 * whether it was system or human, so nothing was stamped. All three wait for an
 * admin; none of them is ever discarded.
 */
export type InboundEventStatus =
  | "pending"
  | "processed"
  | "unattributed"
  | "unknown"
  | "unclassified"
  | "failed"
  | "dismissed";
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "disputed"
  | "billed";
export type BookingSource = "webhook" | "manual";
/**
 * Who a change is attributed to. `client` covers a dispute raised by the client
 * even when an admin recorded it on their behalf; the label says which admin.
 */
export type AppointmentActor = "admin" | "client" | "system";
export type AppointmentEventKind =
  | "created"
  | "status_changed"
  | "rescheduled"
  | "show_recorded";
export type DisputeRaisedBy = "client" | "admin";
export type DisputeOutcome = "upheld" | "resolved";
export type NotificationStatus = "pending" | "sent" | "failed";
export type ChargeStatus =
  | "draft"
  | "notified"
  | "processing"
  | "paid"
  | "failed"
  | "credited";
export type ChargeLineKind = "appointment" | "minimum_adjustment" | "credit";
export type ChargeNotificationKind =
  | "pre_charge"
  | "receipt"
  | "payment_failed"
  | "payment_failed_final";
export type PaymentOutcome = "succeeded" | "failed";
export type ProcessorMode = "live" | "test";
/** Stripe's dispute vocabulary, reduced to the states worth acting on. */
export type ChargebackStatus = "warning" | "open" | "under_review" | "won" | "lost";
export type StripeEventStatus = "pending" | "processed" | "ignored" | "failed";
export type JobAction =
  | "assembled"
  | "notified"
  | "processed"
  | "failed"
  | "retried"
  | "skipped";

/** Invite-only portal accounts. No row here means the session is an admin. */
export type ClientUserStatus = "invited" | "active" | "archived" | "closed";
export type ClientNotificationKind =
  | "invitation"
  | "weekly_summary"
  | "dispute_alert";
export type ClientNotificationAudience = "client" | "admin";
export type DigestDeliveryStatus = "pending" | "sent" | "failed" | "skipped";
export type ExclusivityStatus = "active" | "overridden" | "not_offered";
export type TerritoryKind = "radius" | "postal_codes" | "named_regions";
export type CrossClientMatchOn = "phone" | "email";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: ClientStatus;

  rate_per_appointment: number;
  monthly_minimum: number;
  billing_cycle_days: number;
  review_window_hours: number;
  bill_on: BillOn;

  service_area: string | null;
  accepted_job_types: string[] | null;

  ghl_location_id: string | null;
  webhook_secret: string;

  /**
   * Processor references and the card metadata the processor reports back. No
   * card number is ever stored, transmitted, or displayed.
   */
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  payment_method_added_at: string | null;
  payment_setup_session_id: string | null;

  /** The cycle anchors to activation rather than to the calendar. */
  activated_at: string | null;
  next_cycle_close: string | null;
  last_cycle_close: string | null;

  /**
   * How far back a matching phone or email counts as the same lead. A homeowner
   * asking twice in a week is one lead; the same person eight months later is not.
   */
  duplicate_window_days: number;

  /**
   * Whether Divine Acquisition has promised category×territory exclusivity for
   * this client. Independent of the appointment-definition service area.
   */
  exclusivity_status: ExclusivityStatus;

  created_at: string;
  updated_at: string;
}

/**
 * Insert shape for clients. `webhook_secret` is deliberately absent: the column
 * default generates it, and application code must never set it.
 */
export interface ClientInsert {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status?: ClientStatus;

  rate_per_appointment?: number;
  monthly_minimum?: number;
  billing_cycle_days?: number;
  review_window_hours?: number;
  bill_on?: BillOn;

  service_area?: string | null;
  accepted_job_types?: string[] | null;

  ghl_location_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_payment_method_id?: string | null;

  duplicate_window_days?: number;
}

export type ClientUpdate = Partial<ClientInsert>;

export interface AppointmentDefinition {
  id: string;
  client_id: string;
  version: number;
  criteria: string;
  service_area: string | null;
  accepted_job_types: string[] | null;
  effective_from: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  platform: string;
  external_campaign_id: string | null;
  utm_campaign: string | null;
  created_at: string;
}

export interface AdSpend {
  id: string;
  client_id: string;
  campaign_id: string | null;
  spend_date: string;
  amount: number;
  entered_by: string | null;
  entered_by_label: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One person at one client business. Created by an administrator; there is no
 * public signup path anywhere in the product.
 */
export interface ClientUser {
  id: string;
  client_id: string;
  user_id: string | null;
  name: string;
  email: string;
  status: ClientUserStatus;
  weekly_summary: boolean;
  invitation_token_hash: string | null;
  invitation_expires_at: string | null;
  invited_by: string | null;
  invited_by_label: string | null;
  invited_at: string;
  accepted_at: string | null;
  archived_at: string | null;
  access_ends_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Time-limited, revocable, view-only access to the portal dashboard. */
export interface ShareLink {
  id: string;
  client_id: string;
  token_hash: string;
  label: string | null;
  created_by: string | null;
  created_by_label: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ShareLinkView {
  id: string;
  link_id: string;
  viewed_at: string;
  user_agent: string | null;
}

export interface ClientNotification {
  id: string;
  client_id: string;
  client_user_id: string | null;
  audience: ClientNotificationAudience;
  kind: ClientNotificationKind;
  channel: "email" | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  client_id: string;
  campaign_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  job_type: string | null;
  raw_payload: Json | null;
  arrived_at: string;
  /** Whether `arrived_at` came from the provider or from the moment of receipt. */
  arrival_source: LeadArrivalSource;
  /**
   * A booking for someone who never enquired still needs a lead. Recording that
   * it came from the booking stops its response times reading as a failure.
   */
  origin: LeadOrigin;
  /** Generated by the database from `phone` / `email`; never written by the app. */
  phone_key: string | null;
  email_key: string | null;
  duplicate_of: string | null;
  created_at: string;
}

export interface Touch {
  id: string;
  lead_id: string;
  touch_type: TouchType;
  channel: TouchChannel | null;
  occurred_at: string;
  /**
   * Set on the first touch of each type and never on another. A partial unique
   * index enforces it, which is what makes a response time defensible.
   */
  is_first_of_type: boolean;
  inbound_event_id: string | null;
  created_at: string;
}

/**
 * One arrival of a lead. The first submission and every repeat live here, so a
 * lead that submitted twice stays visible without a second lead existing.
 */
export interface LeadSubmission {
  id: string;
  lead_id: string;
  inbound_event_id: string | null;
  is_original: boolean;
  submitted_at: string;
  payload: Json | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  client_id: string;
  lead_id: string;
  /** The definition in effect at creation. Stamped once and never changed. */
  definition_version: number;
  definition_id: string | null;
  scheduled_for: string;
  appointment_type: string | null;
  status: AppointmentStatus;
  showed: boolean | null;
  show_recorded_at: string | null;
  confirmed_at: string | null;
  review_window_ends_at: string | null;
  rejected_reason: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_resolution: string | null;
  charge_id: string | null;
  rate_applied: number | null;

  booking_source: BookingSource;
  /** The provider's own identifier for the booking, where it supplied one. */
  provider_appointment_id: string | null;
  /** Retained by the database on every reschedule. */
  previous_scheduled_for: string | null;
  reschedule_count: number;
  notified_at: string | null;
  created_by: string | null;

  /** Who made the most recent change and why. The audit is in appointment_events. */
  last_actor: AppointmentActor | null;
  last_actor_id: string | null;
  last_actor_label: string | null;
  last_reason_code: string | null;
  last_reason: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * One entry in an appointment's history. Written by a database trigger as part
 * of the change itself, so a status can never move without the record of it.
 */
export interface AppointmentEvent {
  id: string;
  appointment_id: string;
  kind: AppointmentEventKind;
  from_status: AppointmentStatus | null;
  to_status: AppointmentStatus | null;
  previous_scheduled_for: string | null;
  new_scheduled_for: string | null;
  showed: boolean | null;
  actor: AppointmentActor;
  actor_id: string | null;
  actor_label: string | null;
  reason_code: string | null;
  reason: string | null;
  occurred_at: string;
}

/** Permanent. A dispute and its outcome outlive the appointment's status. */
export interface AppointmentDispute {
  id: string;
  appointment_id: string;
  client_id: string;
  raised_by: DisputeRaisedBy;
  raised_at: string;
  reason_code: string | null;
  reason: string;
  outcome: DisputeOutcome | null;
  outcome_reason: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  window_ended_at: string | null;
  created_at: string;
}

/** What the client was told, and whether it actually reached them. */
export interface AppointmentNotification {
  id: string;
  appointment_id: string;
  client_id: string;
  kind: "confirmation";
  channel: "email" | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Charge {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  appointment_count: number;
  appointments_subtotal: number;
  minimum_adjustment: number;
  credits_applied: number;
  total: number;
  currency: string;
  status: ChargeStatus;
  /** The calendar month a minimum adjustment on this charge settles. */
  minimum_month: string | null;
  notified_at: string | null;
  /** No earlier than twenty-four hours after the notification was sent. */
  scheduled_for: string | null;
  processed_at: string | null;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  stripe_payment_intent_id: string | null;
  processor_mode: ProcessorMode | null;
  failure_code: string | null;
  failure_reason: string | null;

  /**
   * A reversal. The charge stays `paid`, because it was; this is the separate
   * fact that the money came back out.
   */
  chargeback_at: string | null;
  chargeback_status: ChargebackStatus | null;
  chargeback_reason: string | null;
  chargeback_amount: number | null;
  chargeback_reference: string | null;

  created_at: string;
  updated_at: string;
}

/** The itemisation, exactly as the client was shown it. Written once. */
export interface ChargeLine {
  id: string;
  charge_id: string;
  kind: ChargeLineKind;
  appointment_id: string | null;
  credit_id: string | null;
  description: string;
  amount: number;
  sort: number;
  created_at: string;
}

export interface ChargeAttempt {
  id: string;
  charge_id: string;
  attempt_no: number;
  attempted_at: string;
  outcome: PaymentOutcome;
  processor_reference: string | null;
  processor_mode: ProcessorMode | null;
  failure_code: string | null;
  failure_message: string | null;
}

/** Every event Stripe sent, stored before it was interpreted. */
export interface StripeEvent {
  id: string;
  stripe_event_id: string;
  type: string;
  livemode: boolean;
  payload: Json;
  status: StripeEventStatus;
  charge_id: string | null;
  client_id: string | null;
  note: string | null;
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface ChargeNotification {
  id: string;
  charge_id: string;
  client_id: string;
  kind: ChargeNotificationKind;
  channel: "email" | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A correction. A processed charge never changes, so this is how money moves back. */
export interface Credit {
  id: string;
  client_id: string;
  amount: number;
  reason: string;
  appointment_id: string | null;
  created_by: string | null;
  created_by_label: string | null;
  applied_charge_id: string | null;
  applied_at: string | null;
  created_at: string;
}

export interface JobRun {
  id: string;
  kind: string;
  trigger: "schedule" | "manual";
  started_at: string;
  finished_at: string | null;
  assembled: number;
  notified: number;
  processed: number;
  failed: number;
  skipped: number;
  error: string | null;
}

export interface JobRunEntry {
  id: string;
  run_id: string;
  client_id: string | null;
  charge_id: string | null;
  action: JobAction;
  detail: string;
  created_at: string;
}

export interface InboundEvent {
  id: string;
  client_id: string | null;
  /** The type the sender declared, verbatim, whether or not it is recognised. */
  event_type: string | null;
  canonical_type: CanonicalEventType | null;
  payload: Json;
  status: InboundEventStatus;
  provider_event_id: string | null;
  idempotency_key: string | null;
  declared_location_id: string | null;
  location_mismatch: boolean;
  lead_id: string | null;
  touch_id: string | null;
  appointment_id: string | null;
  error: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  received_at: string;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}

/** One morning's attention digest attempt. */
export interface AttentionDigest {
  id: string;
  digest_for: string;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  item_count: number;
  escalated_count: number;
  value_at_risk: number;
  status: DigestDeliveryStatus;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

/** Maintained list — never free text on the client. */
export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface ClientCategory {
  client_id: string;
  category_id: string;
}

/**
 * Exclusivity geography. Separate from appointment_definitions.service_area —
 * a client may accept occasional jobs outside the area they were sold
 * exclusivity in.
 */
export interface Territory {
  id: string;
  client_id: string;
  kind: TerritoryKind;
  label: string | null;
  center_lat: number | null;
  center_lng: number | null;
  center_address: string | null;
  radius_miles: number | null;
  postal_codes: string[];
  region_names: string[];
  created_at: string;
  updated_at: string;
}

export interface ExclusivityOverride {
  id: string;
  client_a_id: string;
  client_b_id: string;
  shared_category_ids: string[];
  overlap_summary: string;
  reason: string;
  overridden_by: string | null;
  overridden_by_label: string | null;
  created_at: string;
}

/** Flag only — never blocks either lead. */
export interface CrossClientMatch {
  id: string;
  lead_a_id: string;
  lead_b_id: string;
  client_a_id: string;
  client_b_id: string;
  match_on: CrossClientMatchOn;
  match_key: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_by_label: string | null;
  created_at: string;
}
