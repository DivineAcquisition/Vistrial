import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { EXPORT_BUCKET } from "@/lib/portal/export";
import { staffDb } from "@/lib/staff/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** A signed download for an Owner, only while the link is still inside its window. */
export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (ctx.role !== "owner") return new NextResponse("Forbidden", { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const db = await staffDb();
  const { data } = await db
    .from("data_requests")
    .select("id, org_id, kind, status, export_path, export_expires_at")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  const row = data as { kind: string; status: string; export_path: string | null; export_expires_at: string | null } | null;
  if (!row || row.kind !== "export" || row.status !== "completed" || !row.export_path || !row.export_expires_at) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (Date.parse(row.export_expires_at) <= Date.now()) return new NextResponse("This link has expired.", { status: 410 });
  const admin = getSupabaseAdmin();
  const signed = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(row.export_path, 60, { download: "vistrial-workspace.json" });
  if (signed.error || !signed.data?.signedUrl) return new NextResponse("Could not prepare the download.", { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
