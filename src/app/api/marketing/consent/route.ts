import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MODES = new Set(["accept", "reject", "custom", "dismiss"]);

/** Daily totals only. No identifier, address, or cookie value is stored. */
export async function POST(request: Request) {
  let mode = "";
  try {
    const body = await request.json();
    mode = typeof body?.mode === "string" ? body.mode : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!MODES.has(mode)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    await db.rpc("record_tracking_choice", { p_mode: mode });
  } catch {
    /* counts are optional */
  }
  return NextResponse.json({ ok: true });
}
