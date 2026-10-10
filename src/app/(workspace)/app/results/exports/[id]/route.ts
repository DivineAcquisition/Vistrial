import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { portalDb } from "@/lib/metrics/load";
import { EXPORT_BUCKET } from "@/lib/portal/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The export row is read as the person, so only the person who asked can
 * open it. The file itself is private; this hands out a link for a minute.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isLeadId(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ctx = await getAuthContext();
  const db = await portalDb();
  const { data } = await db
    .from("results_exports")
    .select("id, status, file_path, expires_at")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .eq("requested_by_user_id", ctx.user.id)
    .maybeSingle();
  const row = data as { status: string; file_path: string | null; expires_at: string } | null;
  if (!row || row.status !== "ready" || !row.file_path || Date.parse(row.expires_at) < Date.now()) {
    return NextResponse.json({ error: "That export is not available." }, { status: 404 });
  }
  if (!row.file_path.startsWith(`${ctx.org.id}/`)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(EXPORT_BUCKET)
    .createSignedUrl(row.file_path, 60, { download: `vistrial-results-${id.slice(0, 8)}.csv` });
  if (error || !signed) return NextResponse.json({ error: "Could not open the export." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { status: 303 });
}
