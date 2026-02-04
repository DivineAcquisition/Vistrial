/**
 * Validation Utilities
 * 
 * Common validation functions and Zod schemas for:
 * - Phone numbers
 * - Email addresses
 * - User input
 * - API payloads
 */

import { z } from "zod";

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Phone number validation (US)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  
  // US numbers should be 10 or 11 digits
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith("1")) return true;
  
  return false;
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  
  // Return with + if not already
  return phone.startsWith("+") ? phone : `+${digits}`;
}

// ============================================
// Zod Schemas
// ============================================

/**
 * Phone number schema
 */
export const phoneSchema = z.string().transform((val, ctx) => {
  const normalized = normalizePhoneNumber(val);
  const digits = normalized.replace(/\D/g, "");
  
  if (digits.length < 10 || digits.length > 15) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid phone number",
    });
    return z.NEVER;
  }
  
  return normalized;
});

/**
 * Email schema
 */
export const emailSchema = z.string().email("Invalid email address").toLowerCase();

/**
 * Contact schema
 */
export const contactSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().max(100).optional(),
  phone: phoneSchema,
  email: emailSchema.optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Workflow step schema
 */
export const workflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(["sms", "voice", "delay", "condition"]),
  order: z.number().int().positive(),
  content: z.string().max(1000).optional(),
  delay_value: z.number().int().positive().optional(),
  delay_unit: z.enum(["minutes", "hours", "days"]).optional(),
  condition: z.object({
    field: z.string(),
    operator: z.enum(["equals", "not_equals", "contains", "greater_than", "less_than"]),
    value: z.string(),
  }).optional(),
});

export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;

/**
 * Workflow schema
 */
export const workflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  steps: z.array(workflowStepSchema).min(1, "At least one step is required"),
  settings: z.object({
    send_window_start: z.string().optional(), // HH:MM format
    send_window_end: z.string().optional(),
    timezone: z.string().optional(),
    auto_enroll: z.boolean().optional(),
  }).optional(),
});

export type WorkflowInput = z.infer<typeof workflowSchema>;

/**
 * SMS message schema
 */
export const smsMessageSchema = z.object({
  to: phoneSchema,
  message: z.string().min(1, "Message is required").max(1600),
  workflow_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime().optional(),
});

export type SmsMessageInput = z.infer<typeof smsMessageSchema>;

/**
 * Voice call schema
 */
export const voiceCallSchema = z.object({
  to: phoneSchema,
  script: z.string().min(1, "Script is required").max(5000),
  voice_id: z.string().optional(),
  workflow_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime().optional(),
});

export type VoiceCallInput = z.infer<typeof voiceCallSchema>;

/**
 * Validate and parse with helpful error messages
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  
  return { success: false, errors };
}
