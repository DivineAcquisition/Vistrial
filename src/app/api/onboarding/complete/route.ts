import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getTradeConfig, getTradeJobTypes } from "@/lib/onboarding/trade-config"
import type { TradeId } from "@/lib/onboarding/types"

interface OnboardingPayload {
  // Step 1: Trade
  trade: TradeId
  tradeOther?: string
  businessName: string
  ownerName?: string
  businessPhone?: string

  // Step 2: Reality
  monthlyQuotes: string
  currentFollowUp: string
  perceivedCloseRate: number

  // Step 3: Twilio
  twilioAccountSid: string
  twilioAuthToken: string
  twilioPhoneNumber: string
  webhookConfigured: boolean

  // Step 4: Compliance
  complianceAcknowledged: boolean
  acknowledgedAt?: string

  // Step 5: Sequence
  sequenceTemplate: "default" | "custom"
  customMessages?: Record<string, string>

  // Meta
  completedAt: string
  timeToComplete: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload: OnboardingPayload = await request.json()

    // Validate required fields
    if (!payload.trade || !payload.businessName || !payload.twilioAccountSid) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get trade config
    const tradeConfig = getTradeConfig(payload.trade)
    const jobTypes = getTradeJobTypes(payload.trade)

    // 1. Update profile with all collected data
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        business_name: payload.businessName,
        business_phone: payload.businessPhone || null,
        twilio_account_sid: payload.twilioAccountSid,
        twilio_auth_token: payload.twilioAuthToken,
        twilio_phone_number: payload.twilioPhoneNumber,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (profileError) {
      console.error("Error updating profile:", profileError)
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      )
    }

    // 2. Create default job types for their trade
    const jobTypeInserts = jobTypes.map((name, index) => ({
      user_id: user.id,
      name,
      color: getJobTypeColor(index),
      is_active: true,
    }))

    const { error: jobTypesError } = await supabase
      .from("job_types")
      .insert(jobTypeInserts)

    if (jobTypesError) {
      console.error("Error creating job types:", jobTypesError)
      // Non-fatal, continue
    }

    // 3. Create their first sequence
    const sequenceMessages =
      payload.sequenceTemplate === "custom" && payload.customMessages
        ? payload.customMessages
        : tradeConfig.defaultMessages

    const { data: sequence, error: sequenceError } = await supabase
      .from("sequences")
      .insert({
        user_id: user.id,
        name: `Standard ${tradeConfig.name} Follow-Up`,
        description: `Automated follow-up sequence for ${tradeConfig.name.toLowerCase()} quotes`,
        is_active: true,
        is_default: true,
      })
      .select()
      .single()

    if (sequenceError) {
      console.error("Error creating sequence:", sequenceError)
      return NextResponse.json(
        { error: "Failed to create sequence" },
        { status: 500 }
      )
    }

    // 4. Create sequence steps
    const steps = [
      {
        sequence_id: sequence.id,
        user_id: user.id,
        step_order: 1,
        step_type: "sms",
        delay_value: 0,
        delay_unit: "minutes",
        message_template: sequenceMessages.step1,
        send_time_start: "08:00",
        send_time_end: "21:00",
        skip_weekends: false,
        is_active: true,
      },
      {
        sequence_id: sequence.id,
        user_id: user.id,
        step_order: 2,
        step_type: "sms",
        delay_value: Math.ceil(tradeConfig.sequenceDays / 3),
        delay_unit: "days",
        message_template: sequenceMessages.step2,
        send_time_start: "08:00",
        send_time_end: "21:00",
        skip_weekends: false,
        is_active: true,
      },
      {
        sequence_id: sequence.id,
        user_id: user.id,
        step_order: 3,
        step_type: "sms",
        delay_value: tradeConfig.sequenceDays,
        delay_unit: "days",
        message_template: sequenceMessages.step3,
        send_time_start: "08:00",
        send_time_end: "21:00",
        skip_weekends: false,
        is_active: true,
      },
    ]

    // Add step 4 if it exists for this trade
    if (sequenceMessages.step4) {
      steps.push({
        sequence_id: sequence.id,
        user_id: user.id,
        step_order: 4,
        step_type: "sms",
        delay_value: tradeConfig.sequenceDays * 2,
        delay_unit: "days",
        message_template: sequenceMessages.step4,
        send_time_start: "08:00",
        send_time_end: "21:00",
        skip_weekends: false,
        is_active: true,
      })
    }

    const { error: stepsError } = await supabase
      .from("sequence_steps")
      .insert(steps)

    if (stepsError) {
      console.error("Error creating sequence steps:", stepsError)
      // Non-fatal, continue
    }

    // 5. Set sequence as default
    const { error: defaultError } = await supabase
      .from("profiles")
      .update({ default_sequence_id: sequence.id })
      .eq("id", user.id)

    if (defaultError) {
      console.error("Error setting default sequence:", defaultError)
      // Non-fatal, continue
    }

    // Log onboarding completion for analytics
    console.log("Onboarding completed:", {
      userId: user.id,
      trade: payload.trade,
      timeToComplete: payload.timeToComplete,
      currentFollowUp: payload.currentFollowUp,
      monthlyQuotes: payload.monthlyQuotes,
    })

    return NextResponse.json({
      success: true,
      sequenceId: sequence.id,
    })
  } catch (error) {
    console.error("Onboarding error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Helper to get job type colors
function getJobTypeColor(index: number): string {
  const colors = [
    "#3B82F6", // blue
    "#10B981", // green
    "#F59E0B", // amber
    "#EF4444", // red
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#06B6D4", // cyan
    "#F97316", // orange
  ]
  return colors[index % colors.length]
}
