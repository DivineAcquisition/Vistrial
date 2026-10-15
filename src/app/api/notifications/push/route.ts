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
  const label = request.headers.get("user-agent")?.slice(0, 80) ?? "This browser";
  const { error } = await supabase.from("notification_push_subscriptions").upsert(
    {
      user_id: ctx.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
      device_label: label,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    return NextResponse.json({ error: "Could not save the subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_push_subscriptions")
    .select("id, device_label, user_agent, last_seen_at, endpoint")
    .eq("user_id", ctx.user.id)
    .order("last_seen_at", { ascending: false });
  return NextResponse.json({
    devices: (data ?? []).map((row) => ({
      id: row.id,
      label: row.device_label || row.user_agent || "This browser",
      lastSeenAt: row.last_seen_at,
      endpoint: row.endpoint,
    })),
  });
}

export async function PATCH(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { showFirstNames?: boolean } | null;
  const supabase = await createClient();
  const { error } = await (supabase as unknown as {
    from: (table: string) => { upsert: (row: object) => Promise<{ error: { message: string } | null }> };
  })
    .from("notification_push_settings")
    .upsert({
      user_id: ctx.user.id,
      show_first_names: body?.showFirstNames === true,
      updated_at: new Date().toISOString(),
    });
  if (error) return NextResponse.json({ error: "Could not save that choice." }, { status: 500 });
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
