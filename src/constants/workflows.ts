/**
 * Workflow Constants
 * 
 * Constants and configurations for workflow features
 */

// Step types available in workflow builder
export const STEP_TYPES = [
  {
    id: "sms",
    name: "SMS Message",
    description: "Send a text message to the contact",
    icon: "MessageSquare",
    creditCost: 1,
  },
  {
    id: "voice",
    name: "Voice Call",
    description: "Initiate an automated voice call",
    icon: "Phone",
    creditCost: 5, // per minute
  },
  {
    id: "delay",
    name: "Wait/Delay",
    description: "Wait before executing the next step",
    icon: "Clock",
    creditCost: 0,
  },
  {
    id: "condition",
    name: "Condition",
    description: "Branch based on contact data or responses",
    icon: "GitBranch",
    creditCost: 0,
  },
] as const;

// Delay unit options
export const DELAY_UNITS = [
  { value: "minutes", label: "Minutes", maxValue: 59 },
  { value: "hours", label: "Hours", maxValue: 23 },
  { value: "days", label: "Days", maxValue: 30 },
] as const;

// Condition operators
export const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
] as const;

// Contact fields available for conditions
export const CONDITION_FIELDS = [
  { value: "status", label: "Contact Status" },
  { value: "last_response", label: "Last Response" },
  { value: "days_since_contact", label: "Days Since Contact" },
  { value: "tags", label: "Tags" },
  { value: "custom_field", label: "Custom Field" },
] as const;

// Default workflow settings
export const DEFAULT_WORKFLOW_SETTINGS = {
  send_window_start: "09:00",
  send_window_end: "20:00",
  timezone: "America/New_York",
  respect_opt_out: true,
  auto_enroll: false,
  max_enrollments: 100,
  daily_limit: 50,
};

// Workflow status configurations
export const WORKFLOW_STATUSES = {
  active: {
    label: "Active",
    color: "green",
    description: "Workflow is running and processing enrollments",
  },
  paused: {
    label: "Paused",
    color: "amber",
    description: "Workflow is paused, no new steps will be executed",
  },
  draft: {
    label: "Draft",
    color: "gray",
    description: "Workflow is being edited and not yet active",
  },
  archived: {
    label: "Archived",
    color: "gray",
    description: "Workflow has been archived and is read-only",
  },
} as const;

// Enrollment status configurations
export const ENROLLMENT_STATUSES = {
  active: {
    label: "In Progress",
    color: "blue",
    description: "Contact is actively progressing through the workflow",
  },
  paused: {
    label: "Paused",
    color: "amber",
    description: "Enrollment is temporarily paused",
  },
  completed: {
    label: "Completed",
    color: "green",
    description: "Contact has completed all workflow steps",
  },
  failed: {
    label: "Failed",
    color: "red",
    description: "Enrollment failed due to an error",
  },
  cancelled: {
    label: "Cancelled",
    color: "gray",
    description: "Enrollment was manually cancelled",
  },
} as const;

// SMS character limits
export const SMS_LIMITS = {
  maxLength: 1600,
  segmentLength: 160,
  unicodeSegmentLength: 70,
};

// Voice call limits
export const VOICE_LIMITS = {
  maxScriptLength: 5000,
  maxDurationMinutes: 10,
  defaultTimeout: 30, // seconds to wait for answer
};

// Rate limiting
export const RATE_LIMITS = {
  smsPerMinute: 60,
  smsPerHour: 500,
  callsPerMinute: 10,
  callsPerHour: 100,
};
