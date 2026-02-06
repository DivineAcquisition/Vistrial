// ============================================
// WORKFLOW TYPE DEFINITIONS
// Re-exports from database.ts plus additional utilities
// ============================================

// Re-export types from database.ts
export type {
  EnrollmentCriteria,
  StepConditions,
  WorkflowSettings,
  DayOfWeek,
} from './database';

import type { 
  EnrollmentCriteria, 
  WorkflowSettings,
  StepConditions,
  DayOfWeek,
} from './database';

export interface WorkflowStep {
  id: string;
  type: 'sms' | 'email' | 'voice_drop';
  delay_days: number;
  delay_hours: number;
  
  // SMS fields
  template?: string;
  
  // Email fields
  email_subject?: string;
  email_body?: string;
  email_cta_text?: string;
  email_cta_url?: string;
  
  // Voice drop fields
  voice_id?: string;
  voice_script?: string;
  
  // Conditions
  conditions?: StepConditions;
}

export const TEMPLATE_VARIABLES = [
  { key: 'first_name', label: 'First Name', example: 'John' },
  { key: 'last_name', label: 'Last Name', example: 'Smith' },
  { key: 'full_name', label: 'Full Name', example: 'John Smith' },
  { key: 'business_name', label: 'Business Name', example: 'Sparkle Cleaning' },
  { key: 'business_phone', label: 'Business Phone', example: '(555) 123-4567' },
  { key: 'booking_link', label: 'Booking Link', example: 'https://book.example.com' },
  { key: 'review_link', label: 'Review Link', example: 'https://g.page/review' },
];

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  send_window_start: '09:00',
  send_window_end: '20:00',
  send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayOfWeek[],
  respect_timezone: true,
  stop_on_response: true,
  stop_on_booking: true,
};

export const DEFAULT_ENROLLMENT_CRITERIA: EnrollmentCriteria = {
  status: ['active'],
  has_phone: true,
  has_email: false,
};
