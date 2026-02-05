// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
// import { sendSMS } from "@/lib/twilio/client"; // Uncomment when Twilio is set up

// CORS headers for embeddable booking widget
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

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
      bedrooms,
      bathrooms,
      sqft,
      hasPets,
      instructions,
      frequency,
      subtotal,
      discount,
      total,
      deposit,
    } = body;

    // 1. Find or create contact
    let contactId: string;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", phone.replace(/\D/g, ""))
      .single();

    if (existingContact) {
      contactId = existingContact.id;

      // Update contact info
      await supabase
        .from("contacts")
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          address_line1: address,
          city,
          state,
          zip,
        })
        .eq("id", contactId);
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          business_id: businessId,
          first_name: firstName,
          last_name: lastName,
          phone: phone.replace(/\D/g, ""),
          email,
          address_line1: address,
          city,
          state,
          zip,
          source: "booking_page",
          status: "customer",
        })
        .select()
        .single();

      if (contactError) {
        console.error("Contact creation error:", contactError);
        return NextResponse.json(
          { error: "Failed to create contact" },
          { status: 500, headers: corsHeaders }
        );
      }

      contactId = newContact.id;
    }

    // 2. Get service details
    const { data: service } = await supabase
      .from("service_types")
      .select("*")
      .eq("id", serviceTypeId)
      .single();

    // 3. Create booking
    const estimatedDuration = service?.estimated_duration_minutes || 120;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        business_id: businessId,
        contact_id: contactId,
        service_type_id: serviceTypeId,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        estimated_duration_minutes: estimatedDuration,
        address_line1: address,
        city,
        state,
        zip,
        bedrooms,
        bathrooms,
        sqft,
        has_pets: hasPets,
        customer_notes: instructions,
        status: "confirmed",
        subtotal,
        discount_amount: discount,
        total,
        deposit_amount: deposit,
        deposit_paid: false, // Will be true after Stripe payment
        payment_status: "pending",
      })
      .select()
      .single();

    if (bookingError) {
      console.error("Booking creation error:", bookingError);
      return NextResponse.json(
        { error: "Failed to create booking" },
        { status: 500, headers: corsHeaders }
      );
    }

    // 4. Create membership if recurring
    if (frequency !== "onetime" && service?.is_recurring_eligible !== false) {
      const frequencyDays: Record<string, number> = {
        weekly: 7,
        biweekly: 14,
        monthly: 30,
      };

      const { error: membershipError } = await supabase
        .from("memberships")
        .insert({
          business_id: businessId,
          contact_id: contactId,
          service_type_id: serviceTypeId,
          frequency,
          frequency_days: frequencyDays[frequency] || 14,
          price_per_service: total,
          status: "active",
          next_service_date: scheduledDate,
          preferred_day_of_week: new Date(scheduledDate).getDay(),
          preferred_time: scheduledTime,
          address_line1: address,
          city,
          state,
          zip,
          bedrooms,
          bathrooms,
          has_pets: hasPets,
        });

      if (membershipError) {
        console.error("Membership creation error:", membershipError);
        // Don't fail the booking if membership creation fails
      }
    }

    // 5. Get business for SMS (used when Twilio is configured)
    const { data: _business } = await supabase
      .from("businesses")
      .select("name, phone")
      .eq("id", businessId)
      .single();

    // 6. Send confirmation SMS (uncomment when Twilio is configured)
    /*
    const formattedDate = new Date(scheduledDate).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    
    const formattedTime = (() => {
      const [hours] = scheduledTime.split(":");
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? "PM" : "AM";
      const hour12 = hour % 12 || 12;
      return `${hour12}:00 ${ampm}`;
    })();

    await sendSMS(
      phone,
      `✅ Confirmed! Your cleaning with ${business?.name} is scheduled for ${formattedDate} at ${formattedTime}. We'll text you a reminder the day before!`
    );
    */

    // 7. Log the message
    await supabase.from("messages").insert({
      business_id: businessId,
      contact_id: contactId,
      direction: "outbound",
      channel: "sms",
      body: `Booking confirmed for ${scheduledDate} at ${scheduledTime}`,
      status: "pending", // Will be 'sent' after Twilio sends
      booking_id: booking.id,
    });

    return NextResponse.json(
      {
        success: true,
        bookingId: booking.id,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Booking API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
