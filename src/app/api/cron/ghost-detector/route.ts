import { NextResponse } from "next/server";

import { runGhostDetector } from "@/lib/scoring/ghost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (secret) {
    return header === `Bearer ${secret}`;
  }
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: Request) {
  if (!authorized(request)) {
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
