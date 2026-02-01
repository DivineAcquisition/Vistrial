import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingReminder } from "@/lib/twilio/messages";

// Run daily at 9am via Vercel Cron
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find bookings for tomorrow that haven't had reminders sent
  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .eq("scheduled_date", tomorrowStr)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null);

  if (!bookings?.length) {
    return NextResponse.json({ message: "No reminders to send", count: 0 });
  }

  let sent = 0;
  for (const booking of bookings) {
    const result = await sendBookingReminder(booking.id);
    if (result.success) sent++;
  }

  return NextResponse.json({ message: "Reminders sent", count: sent });
}
