import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;

export async function GET() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const now = Date.now();
  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, lead_id, scheduled_at")
    .eq("org_id", ctx.org.id)
    .is("occurred_at", null)
    .gte("scheduled_at", new Date(now).toISOString())
    .lt("scheduled_at", new Date(now + HOUR_MS).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(8);

  if (error) {
    return NextResponse.json({ error: "Could not load upcoming calls." }, { status: 500 });
  }

  const items = (calls ?? [])
    .filter((call) => Boolean(call.lead_id))
    .map((call) => ({
      callId: call.id,
      leadId: call.lead_id as string,
      scheduledAt: call.scheduled_at,
    }));

  return NextResponse.json({ items });
}
