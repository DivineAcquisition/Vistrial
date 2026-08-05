export type ClientStatus = "Onboarding" | "Active" | "Paused" | "Churned";
export type BillOn = "booked" | "showed";
export type LeadSource = "Paid" | "Direct" | "Referral" | "Organic" | "Other";
export type TouchType = "system" | "human";
export type TouchChannel = "sms" | "email" | "call" | "dm" | "other";
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "disputed"
  | "billed";
export type ChargeStatus =
  | "draft"
  | "notified"
  | "processing"
  | "paid"
  | "failed"
  | "credited";

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
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;

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
  created_at: string;
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
  duplicate_of: string | null;
  created_at: string;
}

export interface Touch {
  id: string;
  lead_id: string;
  touch_type: TouchType;
  channel: TouchChannel | null;
  occurred_at: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  client_id: string;
  lead_id: string;
  definition_version: number | null;
  scheduled_for: string;
  appointment_type: string | null;
  status: AppointmentStatus;
  showed: boolean | null;
  confirmed_at: string | null;
  review_window_ends_at: string | null;
  rejected_reason: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_resolution: string | null;
  charge_id: string | null;
  rate_applied: number | null;
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
  total: number;
  status: ChargeStatus;
  notified_at: string | null;
  processed_at: string | null;
  stripe_payment_intent_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface InboundEvent {
  id: string;
  client_id: string | null;
  event_type: string | null;
  payload: Json;
  processed: boolean;
  error: string | null;
  received_at: string;
}
