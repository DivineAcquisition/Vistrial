import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  const endpoint = body?.endpoint?.trim() ?? "";
  const p256dh = body?.keys?.p256dh?.trim() ?? "";
  const auth = body?.keys?.auth?.trim() ?? "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_push_subscriptions").upsert(
    {
      user_id: ctx.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    return NextResponse.json({ error: "Could not save the subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.trim() ?? "";
  const supabase = await createClient();
  let query = supabase.from("notification_push_subscriptions").delete().eq("user_id", ctx.user.id);
  if (endpoint) query = query.eq("endpoint", endpoint);
  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not remove the subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
