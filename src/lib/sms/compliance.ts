/**
 * SMS Compliance Utilities
 * 
 * Implements TCPA compliance checks for sending SMS messages:
 * - Opt-out list verification
 * - Timing restrictions (8am-9pm recipient's local time)
 * - Lead status validation
 * - Consent verification
 */

import {
  MESSAGING_HOURS,
  canMessageStatus,
  isFirstMessage,
  ensureOptOutIncluded,
} from "@/lib/constants/sms-compliance"
import type { Lead } from "@/types/database"

// Default timezone if none specified
const DEFAULT_TIMEZONE = "America/New_York"

/**
 * Result of a compliance check
 */
export interface ComplianceCheckResult {
  canSend: boolean
  reason?: string
  requiresScheduling?: boolean
  nextValidTime?: Date
}

/**
 * Check if current time is within allowed messaging hours for a timezone
 * TCPA requires messages between 8am-9pm recipient's local time
 */
export function isWithinMessagingHours(timezone: string = DEFAULT_TIMEZONE): boolean {
  try {
    const now = new Date()
    const recipientTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    )
    
    const hour = recipientTime.getHours()
    return hour >= MESSAGING_HOURS.start && hour < MESSAGING_HOURS.end
  } catch {
    // If timezone is invalid, use default
    return isWithinMessagingHours(DEFAULT_TIMEZONE)
  }
}

/**
 * Get the next valid send time if currently outside messaging hours
 */
export function getNextValidSendTime(timezone: string = DEFAULT_TIMEZONE): Date {
  try {
    const now = new Date()
    const recipientTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    )
    
    const hour = recipientTime.getHours()
    
    if (hour < MESSAGING_HOURS.start) {
      // Before 8 AM - schedule for 8 AM today
      recipientTime.setHours(MESSAGING_HOURS.start, 0, 0, 0)
    } else if (hour >= MESSAGING_HOURS.end) {
      // After 9 PM - schedule for 8 AM tomorrow
      recipientTime.setDate(recipientTime.getDate() + 1)
      recipientTime.setHours(MESSAGING_HOURS.start, 0, 0, 0)
    }
    
    // Convert back to UTC
    return new Date(recipientTime.toISOString())
  } catch {
    // Fallback: schedule for 8 hours from now
    const fallback = new Date()
    fallback.setHours(fallback.getHours() + 8)
    return fallback
  }
}

/**
 * Check if it's a weekend (optional compliance check)
 */
export function isWeekend(timezone: string = DEFAULT_TIMEZONE): boolean {
  try {
    const now = new Date()
    const recipientTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    )
    
    const day = recipientTime.getDay()
    return day === 0 || day === 6 // Sunday = 0, Saturday = 6
  } catch {
    return false
  }
}

/**
 * Get the day of week for a timezone
 */
export function getDayOfWeek(timezone: string = DEFAULT_TIMEZONE): number {
  try {
    const now = new Date()
    const recipientTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    )
    return recipientTime.getDay()
  } catch {
    return new Date().getDay()
  }
}

/**
 * Comprehensive pre-send compliance check
 * Returns whether a message can be sent and the reason if not
 */
export async function checkSendCompliance(params: {
  lead: Pick<Lead, "phone" | "status" | "consent_timestamp" | "created_at" | "timezone">
  profileTimezone: string
  isOptedOut: boolean
  skipWeekends?: boolean
}): Promise<ComplianceCheckResult> {
  const { lead, profileTimezone, isOptedOut, skipWeekends = false } = params
  
  // 1. Check opt-out list first (most important)
  if (isOptedOut) {
    return {
      canSend: false,
      reason: "Phone number has opted out of messages",
    }
  }
  
  // 2. Check lead status
  if (!canMessageStatus(lead.status)) {
    return {
      canSend: false,
      reason: `Lead status "${lead.status}" prevents messaging`,
    }
  }
  
  // 3. Check consent exists (consent_timestamp or created_at implies consent)
  if (!lead.consent_timestamp && !lead.created_at) {
    return {
      canSend: false,
      reason: "No consent record found for this lead",
    }
  }
  
  // 4. Determine timezone to use (lead's timezone > profile timezone > default)
  const timezone = lead.timezone || profileTimezone || DEFAULT_TIMEZONE
  
  // 5. Check weekend restriction if enabled
  if (skipWeekends && isWeekend(timezone)) {
    const nextWeekday = getNextValidSendTime(timezone)
    // Move to Monday if currently weekend
    const day = getDayOfWeek(timezone)
    if (day === 0) {
      nextWeekday.setDate(nextWeekday.getDate() + 1) // Sunday -> Monday
    } else if (day === 6) {
      nextWeekday.setDate(nextWeekday.getDate() + 2) // Saturday -> Monday
    }
    
    return {
      canSend: false,
      reason: "Weekend messaging is disabled for this sequence",
      requiresScheduling: true,
      nextValidTime: nextWeekday,
    }
  }
  
  // 6. Check timing restrictions (8am-9pm recipient's local time)
  if (!isWithinMessagingHours(timezone)) {
    return {
      canSend: false,
      reason: "Outside allowed messaging hours (8am-9pm recipient's local time)",
      requiresScheduling: true,
      nextValidTime: getNextValidSendTime(timezone),
    }
  }
  
  // All checks passed
  return {
    canSend: true,
  }
}

/**
 * Prepare a message for sending with compliance requirements
 * Ensures first messages include opt-out instructions
 */
export function prepareCompliantMessage(
  message: string,
  currentStep: number
): string {
  // First message must include opt-out instructions
  if (isFirstMessage(currentStep)) {
    return ensureOptOutIncluded(message)
  }
  
  return message
}

/**
 * Validate that a message includes required elements
 */
export interface MessageValidationResult {
  isValid: boolean
  warnings: string[]
  errors: string[]
}

export function validateMessageContent(
  message: string,
  businessName: string,
  isFirstMessage: boolean
): MessageValidationResult {
  const warnings: string[] = []
  const errors: string[] = []
  
  // Check message length (SMS segments)
  if (message.length > 160) {
    warnings.push(`Message is ${message.length} characters and will be sent as multiple segments`)
  }
  
  if (message.length > 1600) {
    errors.push("Message is too long (max 1600 characters)")
  }
  
  // Check for business identification
  const hasBusinessId = message.toLowerCase().includes(businessName.toLowerCase()) ||
                        /\bthis is\b/i.test(message) ||
                        /\bfrom\b/i.test(message)
  
  if (!hasBusinessId) {
    warnings.push("Message should identify your business")
  }
  
  // Check for opt-out in first message
  if (isFirstMessage) {
    const hasOptOut = /\b(STOP|opt.?out|unsubscribe)\b/i.test(message)
    if (!hasOptOut) {
      errors.push("First message must include opt-out instructions (e.g., 'Reply STOP to opt out')")
    }
  }
  
  // Check for potentially problematic content
  if (/[!]{3,}|[A-Z]{10,}/.test(message)) {
    warnings.push("Avoid excessive punctuation or ALL CAPS which may appear as spam")
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  }
}

/**
 * Format a consent record for storage
 */
export function createConsentRecord(params: {
  method: "verbal" | "written" | "online_form" | "text_reply"
  ip?: string
  customLanguage?: string
  businessName: string
}): {
  consent_method: string
  consent_timestamp: string
  consent_ip: string | null
  consent_language: string
} {
  const { method, ip, customLanguage, businessName } = params
  
  const defaultLanguage = `Customer agreed to receive text messages from ${businessName} regarding their service request. Message frequency varies. Reply STOP to unsubscribe.`
  
  return {
    consent_method: method,
    consent_timestamp: new Date().toISOString(),
    consent_ip: ip || null,
    consent_language: customLanguage || defaultLanguage,
  }
}
