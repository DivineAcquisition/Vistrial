// Database types matching Supabase schema

export type LeadStatus =
  | "new"
  | "in_sequence"
  | "responded"
  | "booked"
  | "not_interested"
  | "no_response"
  | "paused"
  | "cancelled"

export type StepType = "sms" | "email" | "wait"
export type DelayUnit = "minutes" | "hours" | "days"
export type MessageDirection = "outbound" | "inbound"
export type MessageStatus = "queued" | "sent" | "delivered" | "failed" | "received"
export type PlanType = "free" | "pro" | "growth"

export interface Profile {
  id: string
  email: string
  business_name: string | null
  business_phone: string | null
  twilio_account_sid: string | null
  twilio_auth_token: string | null
  twilio_phone_number: string | null
  timezone: string
  default_sequence_id: string | null
  plan: PlanType
  leads_used_this_month: number
  leads_limit: number
  billing_cycle_start: string
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface JobType {
  id: string
  user_id: string
  name: string
  color: string
  is_active: boolean
  created_at: string
}

export interface Sequence {
  id: string
  user_id: string
  name: string
  description: string | null
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface SequenceStep {
  id: string
  sequence_id: string
  user_id: string
  step_order: number
  step_type: StepType
  delay_value: number
  delay_unit: DelayUnit
  message_template: string
  send_time_start: string
  send_time_end: string
  skip_weekends: boolean
  is_active: boolean
  created_at: string
}

export interface Lead {
  id: string
  user_id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  job_type_id: string | null
  quote_amount: number | null
  job_description: string | null
  quote_date: string
  sequence_id: string | null
  status: LeadStatus
  current_step: number
  next_action_at: string | null
  last_response_at: string | null
  last_response_text: string | null
  response_sentiment: string | null
  booked_at: string | null
  booked_amount: number | null
  lost_reason: string | null
  source: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  // Joined fields
  job_type?: JobType
  sequence?: Sequence
}

export interface Message {
  id: string
  lead_id: string
  user_id: string
  direction: MessageDirection
  status: MessageStatus
  to_phone: string
  from_phone: string
  body: string
  sequence_id: string | null
  sequence_step: number | null
  twilio_sid: string | null
  twilio_status: string | null
  error_code: string | null
  error_message: string | null
  scheduled_at: string | null
  sent_at: string | null
  delivered_at: string | null
  segments: number
  cost: number | null
  created_at: string
}

// Dashboard stats type
export interface DashboardStats {
  total_leads: number
  in_sequence: number
  responded: number
  booked: number
  not_interested: number
  no_response: number
  response_rate: number
  booking_rate: number
  total_quoted: number
  total_booked: number
  messages_sent: number
}

// Input types for forms
export interface LeadInput {
  name: string
  phone: string
  email?: string
  address?: string
  job_type_id?: string
  quote_amount?: number
  job_description?: string
  quote_date?: string
  sequence_id?: string
  source?: string
  notes?: string
  tags?: string[]
}

export interface SequenceInput {
  name: string
  description?: string
  is_active?: boolean
  is_default?: boolean
}

export interface SequenceStepInput {
  step_order: number
  step_type?: StepType
  delay_value: number
  delay_unit: DelayUnit
  message_template: string
  send_time_start?: string
  send_time_end?: string
  skip_weekends?: boolean
  is_active?: boolean
}
