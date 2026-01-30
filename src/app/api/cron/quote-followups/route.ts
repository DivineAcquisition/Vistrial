// ============================================
// VISTRIAL - Quote Follow-ups Cron Job
// Sends automated follow-up SMS for unconverted quotes
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendQuoteFollowUp } from "@/lib/twilio/notifications";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  // Process each follow-up day
  const followUpDays = [
    { day: 1, column: "followup_day1_sent" },
    { day: 3, column: "followup_day3_sent" },
    { day: 5, column: "followup_day5_sent" },
    { day: 7, column: "followup_day7_sent" },
  ] as const;

  let totalSent = 0;

  for (const { day, column } of followUpDays) {
    // Calculate target date (quotes created X days ago)
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - day);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Find quotes that need this follow-up
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id")
      .eq(column, false)
      .in("status", ["sent", "viewed"])
      .gte("created_at", `${targetDateStr}T00:00:00`)
      .lt("created_at", `${targetDateStr}T23:59:59`);

    if (quotes && quotes.length > 0) {
      for (const quote of quotes) {
        await sendQuoteFollowUp(quote.id, day);
        totalSent++;
      }
    }
  }

  return NextResponse.json({
    message: "Quote follow-ups processed",
    sent: totalSent,
  });
}
