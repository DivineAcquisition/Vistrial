/**
 * SMS Compliance Constants for TCPA/FCC Regulations
 * 
 * These constants define the rules for legally sending SMS messages
 * in the United States under the Telephone Consumer Protection Act.
 */

// Opt-out keywords that must be honored immediately
export const OPT_OUT_KEYWORDS = [
  "STOP",
  "UNSUBSCRIBE", 
  "CANCEL",
  "END",
  "QUIT",
  "STOPALL",
] as const

// Re-subscribe keywords to allow users to opt back in
export const RESUBSCRIBE_KEYWORDS = [
  "START",
  "UNSTOP",
  "SUBSCRIBE",
  "YES",
] as const

// Help keywords for user assistance
export const HELP_KEYWORDS = [
  "HELP",
  "INFO",
] as const

// Response messages for compliance
export const COMPLIANCE_MESSAGES = {
  // Sent when user opts out
  optOutConfirmation: (businessName: string) =>
    `You have been unsubscribed from ${businessName} texts. You will receive no further messages. Reply START to resubscribe.`,
  
  // Sent when user re-subscribes  
  resubscribeConfirmation: (businessName: string) =>
    `You have been resubscribed to ${businessName} texts. Reply STOP at any time to opt out.`,
  
  // Sent when user requests help
  helpResponse: (businessName: string, businessPhone: string) =>
    `${businessName} - For help, call ${businessPhone}. Msg frequency varies. Reply STOP to opt out. Msg & data rates may apply.`,
  
  // Standard opt-out footer for first messages
  optOutFooter: "Reply STOP to opt out.",
  
  // Standard opt-out footer with full disclosure
  fullDisclosure: "Msg frequency varies. Reply STOP to opt out. Msg & data rates may apply.",
} as const

// Lead statuses that prevent messaging
export const NO_MESSAGE_STATUSES = [
  "cancelled",
  "not_interested",
  "opted_out",
  "booked",
] as const

// Timing restrictions (TCPA requires 8am-9pm recipient's local time)
export const MESSAGING_HOURS = {
  start: 8,  // 8:00 AM
  end: 21,   // 9:00 PM (21:00)
} as const

// Consent language templates
export const CONSENT_LANGUAGE = {
  // For quote forms
  quoteForm: (businessName: string) =>
    `I agree to receive text message updates about my quote from ${businessName}. Message frequency varies. Reply STOP to opt out. Msg & data rates may apply.`,
  
  // For website/online booking
  onlineBooking: (businessName: string) =>
    `By submitting this form, you consent to receive SMS messages from ${businessName} regarding your service request. Message frequency varies. Reply STOP to unsubscribe. Message and data rates may apply.`,
  
  // Verbal consent acknowledgment (for records)
  verbalConsent: (businessName: string, date: string) =>
    `Customer verbally agreed to receive text messages from ${businessName} on ${date}.`,
} as const

// First message template (MUST include opt-out)
export const FIRST_MESSAGE_TEMPLATE = `Hi {{first_name}}, this is {{business_name}}. Thanks for your interest! I've sent over your quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`

// Message templates for different sequence steps
export const MESSAGE_TEMPLATES = {
  // First message - includes opt-out (required)
  first: FIRST_MESSAGE_TEMPLATE,
  
  // Follow-up message
  followUp: `Hey {{first_name}}, just checking in on the quote I sent. Would love to get you scheduled this week. Still interested? - {{business_name}}`,
  
  // Final follow-up
  final: `Hi {{first_name}}, final follow-up on your quote. Reply YES to schedule or let me know if you have questions. Thanks! - {{business_name}}`,
  
  // Appointment reminder
  appointmentReminder: `Hi {{first_name}}, this is {{business_name}} confirming your appointment. Reply to confirm or reschedule. Reply STOP to opt out of texts.`,
} as const

/**
 * Check if a message body contains an opt-out keyword
 */
export function isOptOutMessage(body: string): boolean {
  const normalized = body.trim().toUpperCase()
  return OPT_OUT_KEYWORDS.some(keyword => normalized === keyword)
}

/**
 * Check if a message body contains a resubscribe keyword
 */
export function isResubscribeMessage(body: string): boolean {
  const normalized = body.trim().toUpperCase()
  return RESUBSCRIBE_KEYWORDS.some(keyword => normalized === keyword)
}

/**
 * Check if a message body contains a help keyword
 */
export function isHelpMessage(body: string): boolean {
  const normalized = body.trim().toUpperCase()
  return HELP_KEYWORDS.some(keyword => normalized === keyword)
}

/**
 * Extract the specific opt-out keyword used
 */
export function getOptOutKeyword(body: string): typeof OPT_OUT_KEYWORDS[number] | null {
  const normalized = body.trim().toUpperCase()
  const keyword = OPT_OUT_KEYWORDS.find(k => normalized === k)
  return keyword ?? null
}

/**
 * Check if the lead status allows messaging
 */
export function canMessageStatus(status: string): boolean {
  return !NO_MESSAGE_STATUSES.includes(status as any)
}

/**
 * Check if a message is the first in a sequence (requires opt-out footer)
 */
export function isFirstMessage(currentStep: number): boolean {
  return currentStep === 0 || currentStep === 1
}

/**
 * Ensure a message includes opt-out instructions (for first messages)
 */
export function ensureOptOutIncluded(message: string): string {
  const hasOptOut = /\b(STOP|opt.?out|unsubscribe)\b/i.test(message)
  
  if (hasOptOut) {
    return message
  }
  
  return `${message} ${COMPLIANCE_MESSAGES.optOutFooter}`
}
