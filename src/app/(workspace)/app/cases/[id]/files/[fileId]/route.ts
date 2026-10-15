import { NextResponse } from "next/server";

import { isLeadId } from "@/lib/cases/filters";
import { decodeLeadFileContents } from "@/lib/cases/files";
import { hashDownloadToken, newDownloadToken } from "@/lib/exports/store";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await context.params;
  if (!isLeadId(id) || !isLeadId(fileId)) {
    return NextResponse.json({ error: "That file is not on this lead." }, { status: 404 });
  }

  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_files")
    .select("file_name, content_type, contents")
    .eq("org_id", ctx.org.id)
    .eq("lead_id", id)
    .eq("id", fileId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "That file is not on this lead." }, { status: 404 });
  }

  const token = new URL(_request.url).searchParams.get("token");
  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  if (!token) {
    const fresh = newDownloadToken();
    await admin.from("download_grants").insert({
      org_id: ctx.org.id,
      user_id: ctx.user.id,
      kind: "lead_file",
      subject_id: fileId,
      token_hash: hashDownloadToken(fresh),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const next = new URL(_request.url);
    next.searchParams.set("token", fresh);
    return NextResponse.redirect(next);
  }
  const { data: grant } = await admin
    .from("download_grants")
    .select("id, expires_at, used_at")
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("subject_id", fileId)
    .eq("token_hash", hashDownloadToken(token))
    .maybeSingle();
  const row = grant as { id: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) {
    return NextResponse.json({ error: "That download link has expired." }, { status: 410 });
  }
  await admin.from("download_grants").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await admin.rpc("ws_log", {
    p_org_id: ctx.org.id,
    p_action: "lead_file.downloaded",
    p_target_table: "lead_files",
    p_target_id: fileId,
    p_detail: { lead_id: id },
    p_actor_user_id: ctx.user.id,
  });
  const bytes = decodeLeadFileContents(data.contents);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.content_type,
      "Content-Disposition": contentDisposition(data.file_name),
      "Cache-Control": "private, no-store",
    },
  });
}
