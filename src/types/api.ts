/**
 * API Types
 * 
 * Type definitions for API requests and responses
 */

// ============================================
// Generic API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message?: string;
  code?: string;
  details?: Record<string, string[]>;
}

// ============================================
// Contact API Types
// ============================================

export interface CreateContactRequest {
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateContactRequest {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status?: "active" | "opted_out" | "unsubscribed";
}

export interface ContactUploadRequest {
  contacts: CreateContactRequest[];
  options?: {
    skip_duplicates?: boolean;
    update_existing?: boolean;
  };
}

export interface ContactUploadResponse {
  imported: number;
  skipped: number;
  errors: Array<{
    row: number;
    error: string;
  }>;
}

// ============================================
// Workflow API Types
// ============================================

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  steps: WorkflowStepRequest[];
  settings?: WorkflowSettings;
}

export interface WorkflowStepRequest {
  type: "sms" | "voice" | "delay" | "condition";
  order: number;
  content?: string;
  delay_value?: number;
  delay_unit?: "minutes" | "hours" | "days";
  condition?: {
    field: string;
    operator: string;
    value: string;
  };
}

export interface WorkflowSettings {
  send_window_start?: string;
  send_window_end?: string;
  timezone?: string;
  auto_enroll?: boolean;
  max_enrollments?: number;
}

export interface WorkflowActionRequest {
  action: "activate" | "pause" | "delete";
}

// ============================================
// Messaging API Types
// ============================================

export interface SendSmsRequest {
  to: string;
  message: string;
  workflow_id?: string;
  scheduled_at?: string;
}

export interface SendSmsResponse {
  success: boolean;
  message_id: string;
  credits_used: number;
}

export interface InitiateCallRequest {
  to: string;
  script: string;
  voice_id?: string;
  workflow_id?: string;
  scheduled_at?: string;
}

export interface InitiateCallResponse {
  success: boolean;
  call_id: string;
  status: string;
}

// ============================================
// Billing API Types
// ============================================

export interface CreateCheckoutRequest {
  price_id: string;
  mode?: "subscription" | "payment";
  success_url?: string;
  cancel_url?: string;
}

export interface CreateCheckoutResponse {
  url: string;
}

export interface RefillCreditsRequest {
  amount: number;
  auto_refill?: boolean;
}

export interface RefillCreditsResponse {
  success: boolean;
  credits_added: number;
  new_balance: number;
}

// ============================================
// Webhook Types
// ============================================

export interface TelnyxWebhookPayload {
  data: {
    event_type: string;
    id: string;
    occurred_at: string;
    payload: Record<string, any>;
    record_type: string;
  };
  meta: {
    attempt: number;
    delivered_to: string;
  };
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
  created: number;
}
