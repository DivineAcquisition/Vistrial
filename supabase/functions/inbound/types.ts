/**
 * Minimal type surface for the inbound Edge Function.
 * Kept in sync with types/database.ts for the fields ingestion reads.
 */

export type LeadSource = "Paid" | "Direct" | "Referral" | "Organic" | "Other";
export type TouchChannel = "sms" | "email" | "call" | "dm" | "other";

export type CanonicalEventType =
  | "lead_received"
  | "system_touch"
  | "human_touch"
  | "contact_updated"
  | "appointment_booked"
  | "appointment_showed"
  | "appointment_no_show";

export type InboundEventStatus =
  | "pending"
  | "processed"
  | "unattributed"
  | "unknown"
  | "unclassified"
  | "failed"
  | "dismissed";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
