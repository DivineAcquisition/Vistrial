// ============================================
// DATABASE TYPES
// Auto-generated types should be placed here after running:
// npx supabase gen types typescript --local > src/types/database.ts
// 
// Below are manual type definitions that mirror the database schema
// These will be replaced by auto-generated types in production
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================
// ENUMS
// ============================================

export type BusinessType =
  | 'cleaning_residential'
  | 'cleaning_commercial'
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'landscaping'
  | 'pest_control'
  | 'roofing'
  | 'painting'
  | 'handyman'
  | 'moving'
  | 'carpet_cleaning'
  | 'window_cleaning'
  | 'pressure_washing'
  | 'pool_service'
  | 'garage_door'
  | 'appliance_repair'
  | 'locksmith'
  | 'junk_removal'
  | 'other';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';

export type PlanTier = 'starter' | 'growth';

export type ContactStatus =
  | 'active'
  | 'unsubscribed'
  | 'bounced'
  | 'invalid'
  | 'do_not_contact';

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export type WorkflowCategory =
  | 'reactivation'
  | 'retention'
  | 'seasonal'
  | 'review_request'
  | 'referral'
  | 'win_back';

export type EnrollmentStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'unsubscribed';

export type MessageType = 'sms' | 'email' | 'voice_drop';

export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'undelivered';

export type TransactionType =
  | 'subscription_payment'
  | 'credit_purchase'
  | 'credit_refill'
  | 'credit_adjustment'
  | 'refund';

// ============================================
// TABLE TYPES
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: BusinessType;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  logo_url: string | null;
  primary_color: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_tier: PlanTier;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  contact_limit: number;
  timezone: string;
  settings: OrganizationSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrganizationSettings {
  default_send_window_start?: string;
  default_send_window_end?: string;
  default_send_days?: string[];
  review_link?: string;
  [key: string]: Json | undefined;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  permissions: MemberPermissions;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberPermissions {
  contacts: boolean;
  workflows: boolean;
  billing: boolean;
  settings: boolean;
}

export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  default_organization_id: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreditBalance {
  id: string;
  organization_id: string;
  balance_cents: number;
  auto_refill_enabled: boolean;
  refill_threshold_cents: number;
  refill_amount_cents: number;
  total_purchased_cents: number;
  total_spent_cents: number;
  last_refill_at: string | null;
  last_refill_amount_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  organization_id: string;
  type: TransactionType;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  stripe_charge_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  description: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: ContactStatus;
  source: string | null;
  source_id: string | null;
  last_contacted_at: string | null;
  last_response_at: string | null;
  last_job_at: string | null;
  total_jobs: number;
  lifetime_value_cents: number;
  sms_opted_in: boolean;
  email_opted_in: boolean;
  voice_opted_in: boolean;
  opted_out_at: string | null;
  custom_fields: Record<string, Json>;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContactImport {
  id: string;
  organization_id: string;
  file_name: string;
  file_url: string | null;
  file_size_bytes: number | null;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  column_mapping: ColumnMapping;
  errors: ImportError[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColumnMapping {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tags?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export interface ImportError {
  row: number;
  field: string;
  value: string;
  error: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: WorkflowCategory;
  business_types: BusinessType[];
  steps: WorkflowStep[];
  default_settings: WorkflowSettings;
  times_used: number;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
  updated_at: string;
}

export interface Workflow {
  id: string;
  organization_id: string;
  template_id: string | null;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  settings: WorkflowSettings;
  enrollment_criteria: EnrollmentCriteria;
  total_enrolled: number;
  total_completed: number;
  total_responses: number;
  total_conversions: number;
  activated_at: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkflowEnrollment {
  id: string;
  organization_id: string;
  workflow_id: string;
  contact_id: string;
  status: EnrollmentStatus;
  current_step_index: number;
  next_action_at: string | null;
  responded_at: string | null;
  converted_at: string | null;
  conversion_value_cents: number | null;
  exit_reason: string | null;
  exited_at: string | null;
  metadata: Json;
  enrolled_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  organization_id: string;
  contact_id: string;
  workflow_id: string | null;
  enrollment_id: string | null;
  step_index: number | null;
  type: MessageType;
  status: MessageStatus;
  to_address: string;
  from_address: string | null;
  content: string;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  provider_error: string | null;
  cost_cents: number;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  response_received_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface MessageQueue {
  id: string;
  organization_id: string;
  contact_id: string;
  workflow_id: string | null;
  enrollment_id: string | null;
  step_index: number | null;
  type: MessageType;
  to_address: string;
  content: string;
  audio_url: string | null;
  scheduled_for: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
  message_id: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundMessage {
  id: string;
  organization_id: string;
  contact_id: string | null;
  type: MessageType;
  from_address: string;
  to_address: string;
  content: string | null;
  provider: string;
  provider_message_id: string | null;
  detected_intent: string | null;
  processed: boolean;
  processed_at: string | null;
  in_reply_to_message_id: string | null;
  received_at: string;
  created_at: string;
}

// ============================================
// WORKFLOW STEP & SETTINGS TYPES (imported by workflows.ts)
// ============================================

export interface WorkflowStep {
  id: string;
  type: MessageType;
  delay_days: number;
  delay_hours: number;
  template: string;
  voice_id?: string;
  audio_url?: string;
  conditions?: StepConditions;
}

export interface StepConditions {
  previous_step_no_response?: boolean;
  previous_step_delivered?: boolean;
  contact_has_email?: boolean;
  contact_has_phone?: boolean;
  custom_field_equals?: {
    field: string;
    value: string;
  };
}

export interface WorkflowSettings {
  send_window_start: string;
  send_window_end: string;
  send_days: DayOfWeek[];
  respect_timezone: boolean;
  stop_on_response: boolean;
  stop_on_booking: boolean;
  max_contacts_per_day?: number;
  throttle_per_minute?: number;
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface EnrollmentCriteria {
  status?: ContactStatus[];
  tags_include?: string[];
  tags_exclude?: string[];
  last_contacted_before_days?: number;
  last_contacted_after_days?: number;
  last_job_before_days?: number;
  last_job_after_days?: number;
  has_email?: boolean;
  has_phone?: boolean;
  custom_field_filters?: CustomFieldFilter[];
}

export interface CustomFieldFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
  value?: string;
}

// ============================================
// INSERT/UPDATE TYPES
// ============================================

export type OrganizationInsert = Omit<
  Organization,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
  id?: string;
};

export type OrganizationUpdate = Partial<
  Omit<Organization, 'id' | 'created_at' | 'updated_at'>
>;

export type ContactInsert = Omit<
  Contact,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
  id?: string;
};

export type ContactUpdate = Partial<
  Omit<Contact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>
>;

export type WorkflowInsert = Omit<
  Workflow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'total_enrolled'
  | 'total_completed'
  | 'total_responses'
  | 'total_conversions'
> & {
  id?: string;
};

export type WorkflowUpdate = Partial<
  Omit<Workflow, 'id' | 'organization_id' | 'created_at' | 'updated_at'>
>;

export type MessageInsert = Omit<Message, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type TransactionInsert = Omit<
  Transaction,
  'id' | 'created_at' | 'updated_at'
> & {
  id?: string;
};

// ============================================
// JOINED/EXTENDED TYPES
// ============================================

export interface OrganizationWithMembers extends Organization {
  organization_members: OrganizationMember[];
}

export interface OrganizationWithCredits extends Organization {
  credit_balances: CreditBalance | null;
}

export interface ContactWithEnrollments extends Contact {
  workflow_enrollments: WorkflowEnrollment[];
}

export interface WorkflowWithTemplate extends Workflow {
  workflow_templates: WorkflowTemplate | null;
}

export interface WorkflowWithEnrollments extends Workflow {
  workflow_enrollments: WorkflowEnrollment[];
}

export interface EnrollmentWithContact extends WorkflowEnrollment {
  contacts: Contact;
}

export interface EnrollmentWithWorkflow extends WorkflowEnrollment {
  workflows: Workflow;
}

export interface MessageWithContact extends Message {
  contacts: Contact;
}

// ============================================
// DATABASE HELPER TYPE
// ============================================

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Omit<OrganizationMember, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrganizationMember, 'id' | 'created_at' | 'updated_at'>>;
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      credit_balances: {
        Row: CreditBalance;
        Insert: Omit<CreditBalance, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CreditBalance, 'id' | 'created_at' | 'updated_at'>>;
      };
      transactions: {
        Row: Transaction;
        Insert: TransactionInsert;
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>;
      };
      contacts: {
        Row: Contact;
        Insert: ContactInsert;
        Update: ContactUpdate;
      };
      contact_imports: {
        Row: ContactImport;
        Insert: Omit<ContactImport, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ContactImport, 'id' | 'created_at' | 'updated_at'>>;
      };
      workflow_templates: {
        Row: WorkflowTemplate;
        Insert: Omit<WorkflowTemplate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<WorkflowTemplate, 'id' | 'created_at' | 'updated_at'>>;
      };
      workflows: {
        Row: Workflow;
        Insert: WorkflowInsert;
        Update: WorkflowUpdate;
      };
      workflow_enrollments: {
        Row: WorkflowEnrollment;
        Insert: Omit<WorkflowEnrollment, 'id' | 'enrolled_at' | 'updated_at'>;
        Update: Partial<Omit<WorkflowEnrollment, 'id' | 'enrolled_at' | 'updated_at'>>;
      };
      messages: {
        Row: Message;
        Insert: MessageInsert;
        Update: Partial<Omit<Message, 'id' | 'created_at' | 'updated_at'>>;
      };
      message_queue: {
        Row: MessageQueue;
        Insert: Omit<MessageQueue, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MessageQueue, 'id' | 'created_at' | 'updated_at'>>;
      };
      inbound_messages: {
        Row: InboundMessage;
        Insert: Omit<InboundMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<InboundMessage, 'id' | 'created_at'>>;
      };
      // Legacy table aliases for backward compatibility
      businesses: {
        Row: LegacyBusiness;
        Insert: Omit<LegacyBusiness, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<LegacyBusiness, 'id' | 'created_at' | 'updated_at'>>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
    Enums: {
      business_type: BusinessType;
      subscription_status: SubscriptionStatus;
      plan_tier: PlanTier;
      contact_status: ContactStatus;
      workflow_status: WorkflowStatus;
      workflow_category: WorkflowCategory;
      enrollment_status: EnrollmentStatus;
      message_type: MessageType;
      message_status: MessageStatus;
      transaction_type: TransactionType;
    };
  };
}

// ============================================
// LEGACY TYPES (Backward Compatibility)
// These types support the existing codebase
// and will be gradually migrated to new types
// ============================================

export type LeadStatus =
  | "new"
  | "in_sequence"
  | "responded"
  | "booked"
  | "not_interested"
  | "no_response"
  | "paused"
  | "cancelled"
  | "opted_out";

export type ConsentMethod = "verbal" | "written" | "online_form" | "text_reply";

export type OptOutReason = "STOP" | "UNSUBSCRIBE" | "CANCEL" | "END" | "QUIT" | "STOPALL" | "manual";

export type StepType = "sms" | "email" | "wait";
export type DelayUnit = "minutes" | "hours" | "days";
export type MessageDirection = "outbound" | "inbound";
export type LegacyMessageStatus = "queued" | "sent" | "delivered" | "failed" | "received";
export type PlanType = "free" | "pro" | "growth";

export interface Profile {
  id: string;
  email: string;
  business_name: string | null;
  business_phone: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  timezone: string;
  default_sequence_id: string | null;
  plan: PlanType;
  leads_used_this_month: number;
  leads_limit: number;
  billing_cycle_start: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LegacyBusiness {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  logo_url: string | null;
  is_active: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_period_end: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  auto_refill_enabled: boolean;
  auto_refill_threshold: number | null;
  auto_refill_amount: number | null;
  settings: Json;
  created_at: string;
  updated_at: string;
}

export interface JobType {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  user_id: string;
  step_order: number;
  step_type: StepType;
  delay_value: number;
  delay_unit: DelayUnit;
  message_template: string;
  send_time_start: string;
  send_time_end: string;
  skip_weekends: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  job_type_id: string | null;
  quote_amount: number | null;
  job_description: string | null;
  quote_date: string;
  sequence_id: string | null;
  status: LeadStatus;
  current_step: number;
  next_action_at: string | null;
  last_response_at: string | null;
  last_response_text: string | null;
  response_sentiment: string | null;
  booked_at: string | null;
  booked_amount: number | null;
  lost_reason: string | null;
  source: string | null;
  notes: string | null;
  tags: string[] | null;
  consent_method: ConsentMethod | null;
  consent_timestamp: string | null;
  consent_ip: string | null;
  consent_language: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
  job_type?: JobType;
  sequence?: Sequence;
}

export interface OptOut {
  id: string;
  user_id: string;
  phone: string;
  opted_out_at: string;
  reason: OptOutReason | null;
  lead_id: string | null;
  created_at: string;
}

export interface LegacyMessage {
  id: string;
  lead_id: string;
  user_id: string;
  direction: MessageDirection;
  status: LegacyMessageStatus;
  to_phone: string;
  from_phone: string;
  body: string;
  sequence_id: string | null;
  sequence_step: number | null;
  twilio_sid: string | null;
  twilio_status: string | null;
  error_code: string | null;
  error_message: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  segments: number;
  cost: number | null;
  created_at: string;
}

export interface LegacyDashboardStats {
  total_leads: number;
  in_sequence: number;
  responded: number;
  booked: number;
  not_interested: number;
  no_response: number;
  response_rate: number;
  booking_rate: number;
  total_quoted: number;
  total_booked: number;
  messages_sent: number;
}

// Alias for backward compatibility
export type DashboardStats = LegacyDashboardStats;

export interface LeadInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  job_type_id?: string;
  quote_amount?: number;
  job_description?: string;
  quote_date?: string;
  sequence_id?: string;
  source?: string;
  notes?: string;
  tags?: string[];
  consent_method?: ConsentMethod;
  consent_timestamp?: string;
  consent_ip?: string;
  consent_language?: string;
  timezone?: string;
}

export interface OptOutInput {
  phone: string;
  reason?: OptOutReason;
  lead_id?: string;
}

export interface SequenceInput {
  name: string;
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface SequenceStepInput {
  step_order: number;
  step_type?: StepType;
  delay_value: number;
  delay_unit: DelayUnit;
  message_template: string;
  send_time_start?: string;
  send_time_end?: string;
  skip_weekends?: boolean;
  is_active?: boolean;
}
