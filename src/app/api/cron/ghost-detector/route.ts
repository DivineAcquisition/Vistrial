import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runGhostDetector } from "@/lib/scoring/ghost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runGhostDetector(getSupabaseAdmin());
    return NextResponse.json({
      evaluated: result.evaluated,
      changed: result.changed,
      orgs: result.orgs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ghost detector failed.";
    console.error("[vistrial] ghost detector request failed", message);
    return NextResponse.json({ error: "Ghost detector failed." }, { status: 500 });
  }
}
