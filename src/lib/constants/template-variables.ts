export interface TemplateVariable {
  key: string
  label: string
  description: string
  example: string
  category?: "lead" | "business" | "compliance"
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Lead variables
  {
    key: "{{first_name}}",
    label: "First Name",
    description: "Customer's first name",
    example: "John",
    category: "lead",
  },
  {
    key: "{{name}}",
    label: "Full Name",
    description: "Customer's full name",
    example: "John Smith",
    category: "lead",
  },
  {
    key: "{{quote_amount}}",
    label: "Quote Amount",
    description: "The quoted price with dollar sign",
    example: "$850",
    category: "lead",
  },
  // Business variables
  {
    key: "{{business_name}}",
    label: "Business Name",
    description: "Your business name",
    example: "Pro Plumbing",
    category: "business",
  },
  {
    key: "{{business_phone}}",
    label: "Business Phone",
    description: "Your business phone number",
    example: "(555) 123-4567",
    category: "business",
  },
  // Compliance variables
  {
    key: "{{opt_out}}",
    label: "Opt-Out Text",
    description: "Standard opt-out instructions",
    example: "Reply STOP to opt out.",
    category: "compliance",
  },
  {
    key: "{{full_disclosure}}",
    label: "Full Disclosure",
    description: "Complete SMS disclosure text",
    example: "Msg frequency varies. Reply STOP to opt out. Msg & data rates may apply.",
    category: "compliance",
  },
]

/**
 * Pre-built compliant message templates for sequences
 * All templates include business identification
 * First message template includes opt-out (required by TCPA)
 */
export const COMPLIANT_TEMPLATES = {
  // First message - MUST include opt-out instructions
  firstMessage: `Hi {{first_name}}, this is {{business_name}}. Thanks for your interest! I've sent over your quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,

  // Follow-up messages (opt-out recommended but not required)
  followUp1: `Hey {{first_name}}, just checking in on the quote I sent. Would love to get you scheduled this week. Still interested? - {{business_name}}`,

  followUp2: `Hi {{first_name}}, following up on your quote from {{business_name}}. Ready to get started? Reply YES to schedule or let me know if you have questions.`,

  followUp3: `{{first_name}}, quick reminder about your {{quote_amount}} quote. We have availability this week if you're interested. - {{business_name}}`,

  // Final follow-up
  finalFollowUp: `Hi {{first_name}}, final follow-up on your quote. Reply YES to schedule or let me know if you have questions. Thanks! - {{business_name}}`,

  // Appointment reminders
  appointmentReminder: `Hi {{first_name}}, this is {{business_name}} confirming your upcoming appointment. Reply to confirm or reschedule.`,

  // Booking confirmation
  bookingConfirmation: `{{first_name}}, you're all set! Your appointment with {{business_name}} is confirmed. We'll see you soon. Reply STOP to opt out of texts.`,

  // Thank you / review request (after service)
  thankYou: `Thanks for choosing {{business_name}}, {{first_name}}! We hope you're happy with the work. We'd love a review if you have a moment. - {{business_name}}`,
} as const

/**
 * Get a list of template categories for UI grouping
 */
export function getTemplatesByCategory() {
  return {
    lead: TEMPLATE_VARIABLES.filter((v) => v.category === "lead"),
    business: TEMPLATE_VARIABLES.filter((v) => v.category === "business"),
    compliance: TEMPLATE_VARIABLES.filter((v) => v.category === "compliance"),
  }
}

export function processTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value)
  }

  return result
}

export function getTemplateVariables(
  lead: { name: string; quote_amount?: number | null },
  profile: { business_name?: string | null; business_phone?: string | null }
): Record<string, string> {
  const firstName = lead.name.split(" ")[0]
  const quoteAmount = lead.quote_amount ? `$${lead.quote_amount}` : "your quote"

  return {
    // Lead variables
    "{{first_name}}": firstName,
    "{{name}}": lead.name,
    "{{quote_amount}}": quoteAmount,
    // Business variables
    "{{business_name}}": profile.business_name || "us",
    "{{business_phone}}": profile.business_phone || "",
    // Compliance variables
    "{{opt_out}}": "Reply STOP to opt out.",
    "{{full_disclosure}}": "Msg frequency varies. Reply STOP to opt out. Msg & data rates may apply.",
  }
}

/**
 * Preview a template with sample data
 */
export function previewTemplate(template: string): string {
  const sampleVariables = {
    "{{first_name}}": "John",
    "{{name}}": "John Smith",
    "{{quote_amount}}": "$850",
    "{{business_name}}": "Pro Plumbing",
    "{{business_phone}}": "(555) 123-4567",
    "{{opt_out}}": "Reply STOP to opt out.",
    "{{full_disclosure}}": "Msg frequency varies. Reply STOP to opt out. Msg & data rates may apply.",
  }

  return processTemplate(template, sampleVariables)
}

/**
 * Count SMS segments for a message
 * Standard SMS: 160 chars, With unicode: 70 chars
 */
export function countSMSSegments(message: string): number {
  // Check if message contains non-GSM characters (unicode)
  const hasUnicode = /[^\x00-\x7F]/.test(message)
  const maxLength = hasUnicode ? 70 : 160

  if (message.length <= maxLength) {
    return 1
  }

  // Concatenated messages have smaller segment sizes
  const concatMaxLength = hasUnicode ? 67 : 153
  return Math.ceil(message.length / concatMaxLength)
}
