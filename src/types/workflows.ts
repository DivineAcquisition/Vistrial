/**
 * Workflow Types
 * 
 * Type definitions for workflow entities and operations
 */

// ============================================
// Workflow Entity Types
// ============================================

export type WorkflowStatus = "active" | "paused" | "draft" | "archived";

export interface Workflow {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  settings: WorkflowSettings;
  stats: WorkflowStats;
  created_at: string;
  updated_at: string;
}

export type StepType = "sms" | "voice" | "delay" | "condition";

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  type: StepType;
  order: number;
  content?: string;
  delay_value?: number;
  delay_unit?: "minutes" | "hours" | "days";
  condition?: StepCondition;
  created_at: string;
}

export interface StepCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value: string;
}

export interface WorkflowSettings {
  send_window_start?: string; // HH:MM format
  send_window_end?: string;
  timezone?: string;
  auto_enroll?: boolean;
  max_enrollments?: number;
  respect_opt_out?: boolean;
  daily_limit?: number;
}

export interface WorkflowStats {
  total_enrolled: number;
  currently_enrolled: number;
  completed: number;
  response_rate: number;
  messages_sent: number;
  calls_made: number;
}

// ============================================
// Enrollment Types
// ============================================

export type EnrollmentStatus = "active" | "paused" | "completed" | "failed" | "cancelled";

export interface WorkflowEnrollment {
  id: string;
  workflow_id: string;
  contact_id: string;
  status: EnrollmentStatus;
  current_step: number;
  next_step_at?: string;
  started_at: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  metadata?: Record<string, any>;
}

export interface EnrollmentActivity {
  id: string;
  enrollment_id: string;
  step_id: string;
  action: "sms_sent" | "call_initiated" | "call_completed" | "step_skipped" | "error";
  status: "success" | "failed" | "pending";
  details?: Record<string, any>;
  created_at: string;
}

// ============================================
// Template Variables
// ============================================

export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  example: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: "first_name",
    label: "First Name",
    description: "Contact's first name",
    example: "John",
  },
  {
    key: "last_name",
    label: "Last Name",
    description: "Contact's last name",
    example: "Smith",
  },
  {
    key: "business_name",
    label: "Business Name",
    description: "Your business name",
    example: "Sparkle Clean Co",
  },
  {
    key: "phone",
    label: "Phone Number",
    description: "Contact's phone number",
    example: "(555) 123-4567",
  },
];

// ============================================
// Workflow Templates
// ============================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: Omit<WorkflowStep, "id" | "workflow_id" | "created_at">[];
  settings: WorkflowSettings;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "reactivation-sms-basic",
    name: "Basic SMS Reactivation",
    description: "Simple 3-step SMS sequence to re-engage dormant leads",
    category: "reactivation",
    steps: [
      { type: "sms", order: 1, content: "Hi {{first_name}}, it's been a while! {{business_name}} here. We'd love to help with your next project. Reply YES to learn about our current offers!" },
      { type: "delay", order: 2, delay_value: 3, delay_unit: "days" },
      { type: "sms", order: 3, content: "{{first_name}}, just checking in - any home service needs we can help with? We're offering 15% off for returning customers!" },
    ],
    settings: {
      send_window_start: "09:00",
      send_window_end: "20:00",
      respect_opt_out: true,
    },
  },
  {
    id: "reactivation-voice",
    name: "Voice Reactivation",
    description: "Personal voice call follow-up for high-value leads",
    category: "reactivation",
    steps: [
      { type: "voice", order: 1, content: "Hi {{first_name}}, this is a friendly call from {{business_name}}. We noticed it's been a while since we last helped you, and we wanted to reach out personally. We have some great offers for returning customers. Please give us a call back or reply to this message if you're interested!" },
    ],
    settings: {
      send_window_start: "10:00",
      send_window_end: "18:00",
      respect_opt_out: true,
    },
  },
];
