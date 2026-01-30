// ============================================
// VISTRIAL - Membership Reminders Cron Job
// Sends SMS reminders for upcoming recurring service
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAndLogSMS } from "@/lib/twilio/client";
import { SMS_TEMPLATES, formatDateForSMS } from "@/lib/twilio/templates";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get memberships with service in 2 days
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2);
  const targetDateStr = targetDate.toISOString().split("T")[0];

  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("status", "active")
    .eq("next_service_date", targetDateStr);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ message: "No membership reminders", count: 0 });
  }

  let sent = 0;

  for (const membership of memberships) {
    if (!membership.contacts?.phone) continue;

    const message = SMS_TEMPLATES.membershipRenewal({
      businessName: membership.businesses.name,
      customerName: membership.contacts.first_name,
      date: formatDateForSMS(membership.next_service_date),
    });

    const success = await sendAndLogSMS(
      membership.contacts.phone,
      message,
      membership.business_id,
      membership.contacts.id
    );

    if (success) sent++;
  }

  return NextResponse.json({
    message: "Membership reminders sent",
    sent,
    total: memberships.length,
  });
}
