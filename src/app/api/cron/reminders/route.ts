// ============================================
// VISTRIAL - Booking Reminders Cron Job
// Sends SMS reminders for bookings scheduled tomorrow
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingReminder } from "@/lib/twilio/notifications";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find bookings for tomorrow that haven't been reminded
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("scheduled_date", tomorrowStr)
    .eq("status", "confirmed")
    .eq("reminder_sent", false);

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ message: "No reminders to send", count: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const booking of bookings) {
    const success = await sendBookingReminder(booking.id, "day_before");

    if (success) {
      // Mark as reminded
      await supabase
        .from("bookings")
        .update({ reminder_sent: true })
        .eq("id", booking.id);
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    message: "Reminders processed",
    sent,
    failed,
    total: bookings.length,
  });
}
