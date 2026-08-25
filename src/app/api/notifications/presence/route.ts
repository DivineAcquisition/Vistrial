import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 240) : "";
  if (!path.startsWith("/app")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_presence").upsert({
    user_id: ctx.user.id,
    org_id: ctx.org.id,
    path,
    seen_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: "Could not record presence." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
