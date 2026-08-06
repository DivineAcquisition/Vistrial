import { NextResponse } from "next/server";

import { runWeeklySummaries } from "@/lib/portal/weekly";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Delivers weekly portal summaries. Authenticated with the same CRON_SECRET as
 * the billing cycle job — safe to run as often as you like; the unique index
 * prevents a second send for the same week.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const presented = request.headers.get("authorization");
  if (presented !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const db = createServiceClient();
    const result = await runWeeklySummaries(db);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Weekly summary failed.",
      },
      { status: 500 }
    );
  }
}
