import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { deliverQueuedNotifications } from "@/lib/notifications/deliver";
import { runNotificationObserve } from "@/lib/notifications/observe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();
    const observed = await runNotificationObserve(db);
    const delivered = await deliverQueuedNotifications(db);
    return NextResponse.json({ ...observed, ...delivered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notifications cron failed.";
    console.error("[vistrial] notifications cron failed", message);
    return NextResponse.json({ error: "Notifications cron failed." }, { status: 500 });
  }
}
