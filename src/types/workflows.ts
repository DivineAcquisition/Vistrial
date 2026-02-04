// ============================================
// WORKFLOW-SPECIFIC TYPES
// ============================================

import type { 
  MessageType, 
  WorkflowCategory, 
  ContactStatus,
  WorkflowStep,
  StepConditions,
  WorkflowSettings,
  DayOfWeek,
  EnrollmentCriteria,
  CustomFieldFilter,
  Workflow,
  WorkflowTemplate,
  WorkflowEnrollment,
  WorkflowStatus,
  EnrollmentStatus,
  Contact,
  Message,
  MessageQueue,
} from './database';

// Re-export types from database for convenience
export type { 
  WorkflowStep, 
  StepConditions, 
  WorkflowSettings, 
  DayOfWeek,
  EnrollmentCriteria,
  CustomFieldFilter,
  Workflow,
  WorkflowTemplate,
  WorkflowEnrollment,
  WorkflowStatus,
  EnrollmentStatus,
  Contact,
  Message,
  MessageQueue,
  MessageType,
  WorkflowCategory,
  ContactStatus,
};

// ============================================
// DEFAULT VALUES
// ============================================

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  send_window_start: '09:00',
  send_window_end: '20:00',
  send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  respect_timezone: true,
  stop_on_response: true,
  stop_on_booking: true,
};

export const DEFAULT_ENROLLMENT_CRITERIA: EnrollmentCriteria = {
  status: ['active'],
  tags_exclude: ['do_not_contact', 'vip'],
};

// ============================================
// TEMPLATE VARIABLE TYPES
// ============================================

export interface TemplateVariables {
  // Contact variables
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  
  // Business variables
  business_name: string;
  business_phone: string;
  business_email: string;
  business_website: string;
  
  // Custom variables
  review_link?: string;
  booking_link?: string;
  offer_code?: string;
  offer_expiry?: string;
  
  // Dynamic variables
  [key: string]: string | undefined;
}

export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  example: string;
  category: 'contact' | 'business' | 'custom';
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Contact variables
  {
    key: 'first_name',
    label: 'First Name',
    description: "Contact's first name",
    example: 'John',
    category: 'contact',
  },
  {
    key: 'last_name',
    label: 'Last Name',
    description: "Contact's last name",
    example: 'Smith',
    category: 'contact',
  },
  {
    key: 'full_name',
    label: 'Full Name',
    description: "Contact's full name",
    example: 'John Smith',
    category: 'contact',
  },
  {
    key: 'email',
    label: 'Email',
    description: "Contact's email address",
    example: 'john@example.com',
    category: 'contact',
  },
  {
    key: 'phone',
    label: 'Phone',
    description: "Contact's phone number",
    example: '(555) 123-4567',
    category: 'contact',
  },
  // Business variables
  {
    key: 'business_name',
    label: 'Business Name',
    description: 'Your business name',
    example: 'Sparkle Clean Co',
    category: 'business',
  },
  {
    key: 'business_phone',
    label: 'Business Phone',
    description: 'Your business phone number',
    example: '(555) 987-6543',
    category: 'business',
  },
  {
    key: 'business_email',
    label: 'Business Email',
    description: 'Your business email address',
    example: 'hello@sparkleclean.com',
    category: 'business',
  },
  {
    key: 'business_website',
    label: 'Business Website',
    description: 'Your business website URL',
    example: 'www.sparkleclean.com',
    category: 'business',
  },
  // Custom variables
  {
    key: 'review_link',
    label: 'Review Link',
    description: 'Link to leave a review',
    example: 'https://g.page/sparkleclean/review',
    category: 'custom',
  },
  {
    key: 'booking_link',
    label: 'Booking Link',
    description: 'Link to book a service',
    example: 'https://book.sparkleclean.com',
    category: 'custom',
  },
  {
    key: 'offer_code',
    label: 'Offer Code',
    description: 'Promotional offer code',
    example: 'SAVE15',
    category: 'custom',
  },
];

// ============================================
// WORKFLOW EXECUTION TYPES
// ============================================

export interface WorkflowExecutionContext {
  workflow_id: string;
  enrollment_id: string;
  contact_id: string;
  organization_id: string;
  current_step_index: number;
  step: WorkflowStep;
  variables: TemplateVariables;
}

export interface WorkflowExecutionResult {
  success: boolean;
  message_id?: string;
  error?: string;
  cost_cents?: number;
  next_step_index?: number | null;
  next_action_at?: Date | null;
  should_exit?: boolean;
  exit_reason?: string;
}

// ============================================
// WORKFLOW ANALYTICS TYPES
// ============================================

export interface WorkflowStats {
  workflow_id: string;
  total_enrolled: number;
  currently_active: number;
  completed: number;
  responses: number;
  conversions: number;
  unsubscribed: number;
  failed: number;
  response_rate: number;
  conversion_rate: number;
  average_conversion_value_cents: number;
}

export interface WorkflowStepStats {
  step_index: number;
  step_id: string;
  type: MessageType;
  total_sent: number;
  delivered: number;
  failed: number;
  responses: number;
  delivery_rate: number;
  response_rate: number;
}

// ============================================
// CATEGORY DISPLAY INFO
// ============================================

export interface WorkflowCategoryInfo {
  value: WorkflowCategory;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
}

export const WORKFLOW_CATEGORIES: WorkflowCategoryInfo[] = [
  {
    value: 'reactivation',
    label: 'Reactivation',
    description: 'Bring back inactive customers',
    icon: 'UserPlus',
    color: 'text-blue-500',
  },
  {
    value: 'retention',
    label: 'Retention',
    description: 'Keep customers engaged',
    icon: 'Heart',
    color: 'text-red-500',
  },
  {
    value: 'seasonal',
    label: 'Seasonal',
    description: 'Time-based promotions',
    icon: 'Calendar',
    color: 'text-orange-500',
  },
  {
    value: 'review_request',
    label: 'Review Request',
    description: 'Get more reviews',
    icon: 'Star',
    color: 'text-yellow-500',
  },
  {
    value: 'referral',
    label: 'Referral',
    description: 'Generate referrals',
    icon: 'Users',
    color: 'text-green-500',
  },
  {
    value: 'win_back',
    label: 'Win Back',
    description: 'Recover lost customers',
    icon: 'RotateCcw',
    color: 'text-purple-500',
  },
];

export function getCategoryInfo(category: WorkflowCategory): WorkflowCategoryInfo {
  return WORKFLOW_CATEGORIES.find((c) => c.value === category) || WORKFLOW_CATEGORIES[0];
}

// ============================================
// WORKFLOW BUILDER TYPES
// ============================================

export interface WorkflowBuilderStep {
  id: string;
  type: MessageType | 'delay';
  delay_days: number;
  delay_hours: number;
  template: string;
  voice_id?: string;
  isEditing?: boolean;
  errors?: Record<string, string>;
}

export interface WorkflowBuilderState {
  name: string;
  description: string;
  category: WorkflowCategory;
  steps: WorkflowBuilderStep[];
  settings: WorkflowSettings;
  enrollment_criteria: EnrollmentCriteria;
  isDirty: boolean;
  isValid: boolean;
  errors: Record<string, string>;
}

// ============================================
// WORKFLOW PREVIEW TYPES
// ============================================

export interface WorkflowPreview {
  total_steps: number;
  total_duration_days: number;
  message_breakdown: {
    sms: number;
    email: number;
    voice_drop: number;
  };
  estimated_cost_per_contact_cents: number;
}

export function calculateWorkflowPreview(steps: WorkflowStep[]): WorkflowPreview {
  let total_duration_days = 0;
  const message_breakdown = { sms: 0, email: 0, voice_drop: 0 };
  let estimated_cost_cents = 0;

  for (const step of steps) {
    total_duration_days += step.delay_days + (step.delay_hours / 24);
    
    if (step.type === 'sms') {
      message_breakdown.sms++;
      estimated_cost_cents += 3; // ~$0.03 per SMS
    } else if (step.type === 'email') {
      message_breakdown.email++;
      estimated_cost_cents += 1; // ~$0.01 per email
    } else if (step.type === 'voice_drop') {
      message_breakdown.voice_drop++;
      estimated_cost_cents += 15; // ~$0.15 per voice drop
    }
  }

  return {
    total_steps: steps.length,
    total_duration_days: Math.ceil(total_duration_days),
    message_breakdown,
    estimated_cost_per_contact_cents: estimated_cost_cents,
  };
}
