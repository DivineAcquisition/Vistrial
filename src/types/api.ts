// ============================================
// API TYPES
// ============================================

import type {
  Organization,
  Contact,
  Workflow,
  WorkflowTemplate,
  WorkflowEnrollment,
  Message,
  CreditBalance,
  Transaction,
  ContactImport,
  PlanTier,
  BusinessType,
  ContactStatus,
  WorkflowStatus,
  WorkflowStep,
  WorkflowSettings,
  EnrollmentCriteria,
} from './database';

// ============================================
// GENERIC API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ============================================
// AUTH TYPES
// ============================================

export interface SignUpRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  organization_name: string;
  business_type: BusinessType;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
  };
}

export interface ResetPasswordRequest {
  email: string;
}

export interface UpdatePasswordRequest {
  password: string;
}

// ============================================
// ORGANIZATION TYPES
// ============================================

export interface CreateOrganizationRequest {
  name: string;
  business_type: BusinessType;
  email?: string;
  phone?: string;
  website?: string;
  timezone?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  business_type?: BusinessType;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  primary_color?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export interface InviteMemberRequest {
  email: string;
  role: 'admin' | 'member';
  permissions?: {
    contacts?: boolean;
    workflows?: boolean;
    billing?: boolean;
    settings?: boolean;
  };
}

// ============================================
// CONTACT TYPES
// ============================================

export interface CreateContactRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  source?: string;
  tags?: string[];
  notes?: string;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateContactRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  status?: ContactStatus;
  tags?: string[];
  notes?: string;
  custom_fields?: Record<string, unknown>;
  sms_opted_in?: boolean;
  email_opted_in?: boolean;
  voice_opted_in?: boolean;
}

export interface ContactFilters {
  status?: ContactStatus[];
  tags?: string[];
  source?: string;
  search?: string; // Search in name, email, phone
  has_email?: boolean;
  has_phone?: boolean;
  last_contacted_before?: string;
  last_contacted_after?: string;
  created_before?: string;
  created_after?: string;
}

export interface BulkContactAction {
  action: 'add_tags' | 'remove_tags' | 'update_status' | 'delete' | 'enroll_workflow';
  contact_ids: string[];
  tags?: string[];
  status?: ContactStatus;
  workflow_id?: string;
}

export interface BulkContactActionResponse {
  success: boolean;
  affected_count: number;
  errors?: Array<{
    contact_id: string;
    error: string;
  }>;
}

// ============================================
// CONTACT IMPORT TYPES
// ============================================

export interface StartImportRequest {
  file_name: string;
  column_mapping: Record<string, string>;
}

export interface ImportProgress {
  import_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  errors: Array<{
    row: number;
    field: string;
    value: string;
    error: string;
  }>;
}

export interface ValidateImportRequest {
  file_content: string;
  column_mapping: Record<string, string>;
}

export interface ValidateImportResponse {
  valid: boolean;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: Array<{
    row: number;
    field: string;
    value: string;
    error: string;
  }>;
  preview: Array<Record<string, string>>;
}

// ============================================
// WORKFLOW TYPES
// ============================================

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  template_id?: string;
  category: string;
  steps?: WorkflowStep[];
  settings?: Partial<WorkflowSettings>;
  enrollment_criteria?: Partial<EnrollmentCriteria>;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  steps?: WorkflowStep[];
  settings?: Partial<WorkflowSettings>;
  enrollment_criteria?: Partial<EnrollmentCriteria>;
}

export interface WorkflowFilters {
  status?: WorkflowStatus[];
  category?: string[];
  search?: string;
}

export interface EnrollContactsRequest {
  workflow_id: string;
  contact_ids?: string[]; // Specific contacts
  use_criteria?: boolean; // Or use workflow's enrollment criteria
  filter?: ContactFilters; // Or apply custom filter
}

export interface EnrollContactsResponse {
  success: boolean;
  enrolled_count: number;
  skipped_count: number;
  errors?: Array<{
    contact_id: string;
    error: string;
  }>;
}

export interface WorkflowActionRequest {
  action: 'activate' | 'pause' | 'archive' | 'duplicate';
}

export interface WorkflowActionResponse {
  success: boolean;
  workflow?: Workflow;
  message?: string;
}

// ============================================
// MESSAGING TYPES
// ============================================

export interface SendMessageRequest {
  contact_id: string;
  type: 'sms' | 'email' | 'voice_drop';
  content: string;
  scheduled_for?: string;
}

export interface SendMessageResponse {
  success: boolean;
  message_id: string;
  cost_cents: number;
}

export interface MessageFilters {
  type?: ('sms' | 'email' | 'voice_drop')[];
  status?: string[];
  contact_id?: string;
  workflow_id?: string;
  date_from?: string;
  date_to?: string;
}

// ============================================
// BILLING TYPES
// ============================================

export interface CreateCheckoutRequest {
  plan_tier: PlanTier;
  interval?: 'monthly' | 'annual';
  success_url?: string;
  cancel_url?: string;
}

export interface CreateCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface CreatePortalResponse {
  portal_url: string;
}

export interface RefillCreditsRequest {
  amount_cents: number;
}

export interface RefillCreditsResponse {
  success: boolean;
  credits_added_cents: number;
  new_balance_cents: number;
  payment_intent_id?: string;
}

export interface UpdateRefillSettingsRequest {
  auto_refill_enabled: boolean;
  refill_threshold_cents: number;
  refill_amount_cents: number;
}

export interface UsageSummary {
  period_start: string;
  period_end: string;
  sms_sent: number;
  sms_cost_cents: number;
  voice_drops_sent: number;
  voice_drops_cost_cents: number;
  emails_sent: number;
  emails_cost_cents: number;
  total_cost_cents: number;
  credits_remaining_cents: number;
}

export interface UsageBreakdown {
  date: string;
  sms_count: number;
  sms_cost_cents: number;
  voice_count: number;
  voice_cost_cents: number;
  email_count: number;
  email_cost_cents: number;
  total_cost_cents: number;
}

// ============================================
// DASHBOARD TYPES
// ============================================

export interface VistrialDashboardStats {
  total_contacts: number;
  active_contacts: number;
  contacts_limit: number;
  contacts_percentage: number;
  
  active_workflows: number;
  total_enrolled: number;
  
  messages_sent_today: number;
  messages_sent_this_week: number;
  messages_sent_this_month: number;
  
  responses_this_week: number;
  response_rate: number;
  
  credits_remaining_cents: number;
  credits_spent_this_month_cents: number;
}

export interface RecentActivity {
  id: string;
  type: 'message_sent' | 'message_delivered' | 'response_received' | 'contact_enrolled' | 'workflow_completed' | 'contact_imported';
  description: string;
  contact_id?: string;
  contact_name?: string;
  workflow_id?: string;
  workflow_name?: string;
  created_at: string;
}

export interface DashboardChartData {
  date: string;
  messages_sent: number;
  responses: number;
  conversions: number;
}

// ============================================
// WEBHOOK PAYLOAD TYPES
// ============================================

export interface TelnyxWebhookPayload {
  data: {
    event_type: string;
    id: string;
    occurred_at: string;
    payload: {
      id: string;
      to: Array<{ phone_number: string }>;
      from: { phone_number: string };
      text?: string;
      direction: 'inbound' | 'outbound';
      [key: string]: unknown;
    };
  };
}

export interface TelnyxDeliveryPayload {
  data: {
    event_type: 'message.finalized';
    payload: {
      id: string;
      to: Array<{ phone_number: string; status: string }>;
      from: { phone_number: string };
      completed_at: string;
      errors: Array<{ code: string; title: string; detail: string }>;
    };
  };
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface StripeSubscriptionEvent {
  id: string;
  type: 
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | 'invoice.paid'
    | 'invoice.payment_failed';
  data: {
    object: {
      id: string;
      customer: string;
      status: string;
      items: {
        data: Array<{
          price: {
            id: string;
          };
        }>;
      };
      current_period_start: number;
      current_period_end: number;
      [key: string]: unknown;
    };
  };
}

// ============================================
// CRON JOB TYPES
// ============================================

export interface CronJobResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  duration_ms: number;
}

export interface ProcessWorkflowsResult extends CronJobResult {
  messages_sent: number;
  enrollments_completed: number;
  enrollments_failed: number;
}

export interface CheckBalancesResult extends CronJobResult {
  refills_triggered: number;
  refills_succeeded: number;
  refills_failed: number;
}
