/**
 * Public Booking API Route
 * POST - Create a new booking from embed/public booking page
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { formatPhoneE164 } from "@/lib/twilio/format-phone"

interface BookingRequest {
  businessId: string
  serviceTypeId?: string
  scheduledDate: string
  scheduledTime: string
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  instructions?: string
  bedrooms: number
  bathrooms: number
  hasPets: boolean
  frequency: "onetime" | "weekly" | "biweekly" | "monthly"
  total: number
  depositAmount: number
}

export async function POST(request: NextRequest) {
  try {
    const body: BookingRequest = await request.json()
    const supabase = createAdminClient()

    const {
      businessId,
      serviceTypeId,
      scheduledDate,
      scheduledTime,
      firstName,
      lastName,
      phone,
      email,
      address,
      city,
      state,
      zip,
      instructions,
      bedrooms,
      bathrooms,
      hasPets,
      frequency,
      total,
      depositAmount,
    } = body

    // Validate required fields
    if (!businessId || !scheduledDate || !scheduledTime || !firstName || !phone || !email || !address) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get the business profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", businessId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      )
    }

    // Format phone number
    const formattedPhone = formatPhoneE164(phone) || phone

    // Create or find existing lead/customer
    let lead = null
    const { data: existingLead } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", businessId)
      .eq("phone", formattedPhone)
      .single()

    if (existingLead) {
      lead = existingLead
      // Update lead info
      await supabase
        .from("leads")
        .update({
          name: `${firstName} ${lastName}`,
          email,
          status: "booked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
    } else {
      // Create new lead
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          user_id: businessId,
          name: `${firstName} ${lastName}`,
          phone: formattedPhone,
          email,
          status: "booked",
          notes: instructions,
          consent_method: "online_booking",
          consent_timestamp: new Date().toISOString(),
        })
        .select()
        .single()

      if (leadError) {
        console.error("Error creating lead:", leadError)
        return NextResponse.json(
          { error: "Failed to create customer record" },
          { status: 500 }
        )
      }
      lead = newLead
    }

    // Create booking record
    const bookingData = {
      user_id: businessId,
      lead_id: lead.id,
      service_type_id: serviceTypeId || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      address_line1: address,
      city,
      state,
      zip,
      bedrooms,
      bathrooms,
      has_pets: hasPets,
      frequency,
      total,
      deposit_amount: depositAmount,
      deposit_paid: false,
      status: "confirmed",
      special_instructions: instructions,
      created_at: new Date().toISOString(),
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert(bookingData)
      .select()
      .single()

    if (bookingError) {
      console.error("Error creating booking:", bookingError)
      // Continue even if bookings table doesn't exist
    }

    // Send confirmation SMS if Twilio is configured
    if (profile.twilio_phone_number) {
      const confirmationMessage = `Hi ${firstName}! Your cleaning with ${profile.business_name || "us"} is confirmed for ${scheduledDate} at ${scheduledTime}. We'll text you a reminder the day before. Reply STOP to opt out.`

      try {
        await sendSMS({
          to: formattedPhone,
          from: profile.twilio_phone_number,
          body: confirmationMessage,
          accountSid: profile.twilio_account_sid,
          authToken: profile.twilio_auth_token,
        })

        // Log the message
        await supabase.from("messages").insert({
          lead_id: lead.id,
          user_id: businessId,
          direction: "outbound",
          status: "sent",
          to_phone: formattedPhone,
          from_phone: profile.twilio_phone_number,
          body: confirmationMessage,
          sent_at: new Date().toISOString(),
        })
      } catch (smsError) {
        console.error("SMS error:", smsError)
        // Continue even if SMS fails
      }
    }

    return NextResponse.json({
      success: true,
      booking: booking || { id: "pending" },
      customer: {
        id: lead.id,
        name: `${firstName} ${lastName}`,
      },
    })
  } catch (error) {
    console.error("Booking error:", error)
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    )
  }
}
