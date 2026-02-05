// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendQuoteFollowUp } from "@/lib/twilio/messages";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get quotes that need follow-ups
  // Day 1: same day as quote
  // Day 3: 2 days after quote
  // Day 5: 4 days after quote
  // Day 7: 6 days after quote

  const followupDays = [
    { day: 1, minAge: 0, maxAge: 0 },
    { day: 3, minAge: 2, maxAge: 2 },
    { day: 5, minAge: 4, maxAge: 4 },
    { day: 7, minAge: 6, maxAge: 6 },
  ];

  let totalSent = 0;

  for (const { day, minAge, maxAge } of followupDays) {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - maxAge);
    minDate.setHours(0, 0, 0, 0);

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() - minAge);
    maxDate.setHours(23, 59, 59, 999);

    const { data: quotes } = await admin
      .from("quotes")
      .select("id, followup_count")
      .eq("status", "sent")
      .gte("created_at", minDate.toISOString())
      .lte("created_at", maxDate.toISOString())
      .lt("followup_count", day);

    if (quotes?.length) {
      for (const quote of quotes) {
        const result = await sendQuoteFollowUp(quote.id, day);
        if (result.success) totalSent++;
      }
    }
  }

  return NextResponse.json({ message: "Follow-ups sent", count: totalSent });
}
