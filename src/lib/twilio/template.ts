/**
 * Twilio Message Template Processing
 * 
 * Process message templates by replacing {{variables}} with actual values
 */

export interface TemplateData {
  firstName?: string
  name?: string
  quoteAmount?: number
  businessName?: string
  businessPhone?: string
  jobType?: string
  appointmentDate?: string
  appointmentTime?: string
}

/**
 * Process a message template by replacing {{variables}}
 */
export function processTemplate(template: string, data: TemplateData): string {
  let result = template

  // Extract first name from full name if not provided
  const firstName = data.firstName || data.name?.split(" ")[0] || "there"

  // Format quote amount
  const quoteAmount = data.quoteAmount
    ? `$${data.quoteAmount.toLocaleString()}`
    : "your quote"

  // Replace all variables (case-insensitive)
  result = result.replace(/\{\{first_name\}\}/gi, firstName)
  result = result.replace(/\{\{name\}\}/gi, data.name || "there")
  result = result.replace(/\{\{quote_amount\}\}/gi, quoteAmount)
  result = result.replace(/\{\{business_name\}\}/gi, data.businessName || "us")
  result = result.replace(/\{\{business_phone\}\}/gi, data.businessPhone || "")
  result = result.replace(/\{\{job_type\}\}/gi, data.jobType || "service")
  result = result.replace(/\{\{appointment_date\}\}/gi, data.appointmentDate || "")
  result = result.replace(/\{\{appointment_time\}\}/gi, data.appointmentTime || "")

  // Clean up any remaining unmatched variables
  result = result.replace(/\{\{[^}]+\}\}/g, "")

  // Clean up double spaces
  result = result.replace(/  +/g, " ").trim()

  return result
}

/**
 * Extract variable names from a template
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}]+)\}\}/g) || []
  return matches.map((m) => m.replace(/[{}]/g, "").toLowerCase())
}

/**
 * Validate that a template has all required variables populated
 */
export function validateTemplateData(
  template: string,
  data: TemplateData
): { valid: boolean; missingVariables: string[] } {
  const variables = extractTemplateVariables(template)
  const missingVariables: string[] = []

  for (const variable of variables) {
    switch (variable) {
      case "first_name":
      case "name":
        if (!data.firstName && !data.name) {
          missingVariables.push(variable)
        }
        break
      case "quote_amount":
        // Quote amount has a fallback, so it's optional
        break
      case "business_name":
        if (!data.businessName) {
          missingVariables.push(variable)
        }
        break
      case "business_phone":
        if (!data.businessPhone) {
          missingVariables.push(variable)
        }
        break
      case "job_type":
        // Job type has a fallback, so it's optional
        break
    }
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables,
  }
}

/**
 * Preview a template with sample data
 */
export function previewTemplate(template: string): string {
  return processTemplate(template, {
    firstName: "John",
    name: "John Smith",
    quoteAmount: 850,
    businessName: "Pro Plumbing",
    businessPhone: "(555) 123-4567",
    jobType: "water heater installation",
    appointmentDate: "Monday, Jan 15",
    appointmentTime: "2:00 PM",
  })
}

/**
 * Built-in message templates for common scenarios
 */
export const MESSAGE_TEMPLATES = {
  // First message (includes required opt-out)
  firstMessage: `Hi {{first_name}}, this is {{business_name}}. Thanks for your interest! I've sent over your quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,

  // Follow-up messages
  followUp1: `Hey {{first_name}}, just checking in on the quote I sent. Would love to get you scheduled this week. Still interested? - {{business_name}}`,

  followUp2: `Hi {{first_name}}, following up on your {{business_name}} quote. Ready to get started? Reply YES to schedule or let me know if you have questions.`,

  followUp3: `{{first_name}}, quick reminder about your {{quote_amount}} quote. We have availability this week if you're interested. - {{business_name}}`,

  // Final follow-up
  finalFollowUp: `Hi {{first_name}}, final follow-up on your quote. Reply YES to schedule or let me know if you have questions. Thanks! - {{business_name}}`,

  // Appointment reminder
  appointmentReminder: `Hi {{first_name}}, this is {{business_name}} confirming your appointment on {{appointment_date}} at {{appointment_time}}. Reply to confirm or reschedule.`,

  // Booking confirmation
  bookingConfirmation: `{{first_name}}, you're all set! Your appointment with {{business_name}} is confirmed for {{appointment_date}}. We'll see you soon!`,

  // Thank you / review request
  thankYou: `Thanks for choosing {{business_name}}, {{first_name}}! We hope you're happy with the work. We'd love a review if you have a moment. - {{business_name}}`,
} as const
