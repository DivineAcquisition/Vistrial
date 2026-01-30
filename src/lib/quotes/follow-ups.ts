/**
 * Quote Follow-Up Utilities
 * Handles scheduling and processing of quote follow-ups
 */

import { createAdminClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"

// Follow-up schedule configuration
export const FOLLOW_UP_SCHEDULE = [
  { day: 1, templateKey: "follow_up_day_1", hour: 10 },
  { day: 3, templateKey: "follow_up_day_3", hour: 10 },
  { day: 5, templateKey: "follow_up_day_5", hour: 14 },
  { day: 7, templateKey: "follow_up_day_7", hour: 10 },
] as const

// Default follow-up templates
export const DEFAULT_FOLLOW_UP_TEMPLATES = {
  quote_sent: "Hi {{first_name}}! Here's your cleaning quote for ${{total}}. View details and book here: {{quote_link}} - {{business_name}}",
  follow_up_day_1: "Hey {{first_name}}! Just checking - did you get a chance to look at the quote I sent? Happy to answer any questions! {{quote_link}}",
  follow_up_day_3: "Hi {{first_name}}, following up on your cleaning quote. Ready to get your place sparkling? Book here: {{quote_link}}",
  follow_up_day_5: "{{first_name}}, your quote for ${{total}} is still available! Spots are filling up - secure yours: {{quote_link}}",
  follow_up_day_7: "Last chance, {{first_name}}! Your quote expires soon. Book now: {{quote_link}}",
  quote_accepted: "Awesome, {{first_name}}! Your cleaning is confirmed for {{scheduled_date}}. We'll text you a reminder the day before!",
} as const

/**
 * Schedule follow-ups for a newly sent quote
 */
export async function scheduleQuoteFollowUps(quoteId: string) {
  const supabase = createAdminClient()

  // Get quote with business
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, profiles(*)")
    .eq("id", quoteId)
    .single()

  if (error || !quote || !quote.follow_up_enabled) {
    console.log("Cannot schedule follow-ups:", error?.message || "Quote not found or follow-ups disabled")
    return
  }

  const sentAt = quote.sent_at ? new Date(quote.sent_at) : new Date()

  // Create follow-up records
  const followUps = FOLLOW_UP_SCHEDULE.map((schedule) => {
    const scheduledFor = new Date(sentAt)
    scheduledFor.setDate(scheduledFor.getDate() + schedule.day)
    scheduledFor.setHours(schedule.hour, 0, 0, 0)

    return {
      quote_id: quoteId,
      scheduled_for: scheduledFor.toISOString(),
      channel: "sms" as const,
      template_key: schedule.templateKey,
      status: "pending" as const,
      day_number: schedule.day,
    }
  })

  const { error: insertError } = await supabase
    .from("quote_follow_ups")
    .insert(followUps)

  if (insertError) {
    console.error("Error scheduling follow-ups:", insertError)
    return
  }

  // Update next follow-up time on quote
  const firstFollowUp = new Date(sentAt)
  firstFollowUp.setDate(firstFollowUp.getDate() + 1)
  firstFollowUp.setHours(10, 0, 0, 0)

  await supabase
    .from("quotes")
    .update({ next_follow_up_at: firstFollowUp.toISOString() })
    .eq("id", quoteId)

  console.log(`Scheduled ${followUps.length} follow-ups for quote ${quoteId}`)
}

/**
 * Process pending follow-ups (called by cron job)
 */
export async function processPendingFollowUps(): Promise<{ processed: number; failed: number }> {
  const supabase = createAdminClient()

  // Get follow-ups that are due
  const { data: followUps, error } = await supabase
    .from("quote_follow_ups")
    .select(`
      *,
      quotes!inner(
        id, status, follow_up_enabled, follow_up_paused, total, access_token,
        user_id, follow_up_count
      )
    `)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(100)

  if (error || !followUps?.length) {
    return { processed: 0, failed: 0 }
  }

  let processed = 0
  let failed = 0

  for (const followUp of followUps) {
    const quote = followUp.quotes

    // Skip if quote is no longer active
    if (quote.status !== "sent" || !quote.follow_up_enabled || quote.follow_up_paused) {
      await supabase
        .from("quote_follow_ups")
        .update({ status: "skipped" })
        .eq("id", followUp.id)
      continue
    }

    // Get the profile/user for this quote
    const { data: profile } = await supabase
      .from("profiles")
      .select("*, leads!inner(id, name, phone)")
      .eq("id", quote.user_id)
      .single()

    if (!profile?.twilio_phone_number) {
      await supabase
        .from("quote_follow_ups")
        .update({ status: "failed", failure_reason: "Twilio not configured" })
        .eq("id", followUp.id)
      failed++
      continue
    }

    // Get lead for this quote (we need to find by quote relationship)
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", quote.contact_id)
      .single()

    if (!lead) {
      await supabase
        .from("quote_follow_ups")
        .update({ status: "failed", failure_reason: "Lead not found" })
        .eq("id", followUp.id)
      failed++
      continue
    }

    // Get template
    const { data: template } = await supabase
      .from("quote_message_templates")
      .select("*")
      .eq("business_id", quote.user_id)
      .eq("template_key", followUp.template_key)
      .eq("channel", "sms")
      .single()

    // Use default template if not found
    const templateBody = template?.body || 
      DEFAULT_FOLLOW_UP_TEMPLATES[followUp.template_key as keyof typeof DEFAULT_FOLLOW_UP_TEMPLATES] ||
      DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_day_1

    // Build message
    const quoteLink = `${process.env.NEXT_PUBLIC_APP_URL}/q/${quote.access_token}`
    const message = templateBody
      .replace(/\{\{first_name\}\}/g, lead.name?.split(" ")[0] || "there")
      .replace(/\{\{total\}\}/g, quote.total.toString())
      .replace(/\{\{quote_link\}\}/g, quoteLink)
      .replace(/\{\{business_name\}\}/g, profile.business_name || "us")

    // Send SMS
    const result = await sendSMS({
      to: lead.phone,
      from: profile.twilio_phone_number,
      body: message,
      accountSid: profile.twilio_account_sid,
      authToken: profile.twilio_auth_token,
    })

    if (result.success) {
      // Update follow-up
      await supabase
        .from("quote_follow_ups")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_body: message,
        })
        .eq("id", followUp.id)

      // Update quote follow-up count
      await supabase
        .from("quotes")
        .update({ follow_up_count: (quote.follow_up_count || 0) + 1 })
        .eq("id", quote.id)

      // Log message
      await supabase.from("messages").insert({
        lead_id: lead.id,
        user_id: quote.user_id,
        direction: "outbound",
        status: "sent",
        to_phone: lead.phone,
        from_phone: profile.twilio_phone_number,
        body: message,
        twilio_sid: result.messageSid,
        sent_at: new Date().toISOString(),
      })

      processed++
    } else {
      await supabase
        .from("quote_follow_ups")
        .update({ status: "failed", failure_reason: result.error })
        .eq("id", followUp.id)
      failed++
    }
  }

  console.log(`Processed ${processed} follow-ups, ${failed} failed`)
  return { processed, failed }
}

/**
 * Cancel pending follow-ups for a quote
 */
export async function cancelQuoteFollowUps(quoteId: string) {
  const supabase = createAdminClient()

  await supabase
    .from("quote_follow_ups")
    .update({ status: "cancelled" })
    .eq("quote_id", quoteId)
    .eq("status", "pending")

  await supabase
    .from("quotes")
    .update({ follow_up_enabled: false, next_follow_up_at: null })
    .eq("id", quoteId)

  console.log(`Cancelled follow-ups for quote ${quoteId}`)
}

/**
 * Pause follow-ups for a quote
 */
export async function pauseQuoteFollowUps(quoteId: string) {
  const supabase = createAdminClient()

  await supabase
    .from("quotes")
    .update({ follow_up_paused: true })
    .eq("id", quoteId)
}

/**
 * Resume follow-ups for a quote
 */
export async function resumeQuoteFollowUps(quoteId: string) {
  const supabase = createAdminClient()

  await supabase
    .from("quotes")
    .update({ follow_up_paused: false })
    .eq("id", quoteId)
}

/**
 * Process template variables
 */
export function processQuoteTemplate(
  template: string,
  data: {
    firstName?: string
    total?: number
    quoteLink?: string
    businessName?: string
    scheduledDate?: string
  }
): string {
  return template
    .replace(/\{\{first_name\}\}/g, data.firstName || "there")
    .replace(/\{\{total\}\}/g, data.total?.toString() || "")
    .replace(/\{\{quote_link\}\}/g, data.quoteLink || "")
    .replace(/\{\{business_name\}\}/g, data.businessName || "us")
    .replace(/\{\{scheduled_date\}\}/g, data.scheduledDate || "")
}
