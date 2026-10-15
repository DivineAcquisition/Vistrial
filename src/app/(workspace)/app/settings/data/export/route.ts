import { NextResponse } from "next/server";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { signedExportUrl, storeExportFile } from "@/lib/exports/store";
import { buildOrgExport, exportFilename, exportJson } from "@/lib/ops/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isStaff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (ctx.isStaff) {
    const { assertRecentAuth } = await import("@/lib/staff/mfa-check");
    await assertRecentAuth("/app/settings/data");
  }
  const includeOutbound = new URL(request.url).searchParams.get("outbound") === "1" && ctx.workspaceRole === "owner";
  try {
    const bundle = await buildOrgExport(getSupabaseAdmin(), ctx.org.id, {
      includeOutbound,
      includeTranscripts: false,
    });
    const fileName = exportFilename({ slug: ctx.org.slug, name: ctx.org.name });
    const stored = await storeExportFile({
      orgId: ctx.org.id,
      userId: ctx.user.id,
      kind: "workspace",
      fileName,
      contentType: "application/json",
      body: exportJson(bundle),
      params: { includeOutbound, includeTranscripts: false },
    });
    const url = await signedExportUrl(stored.path, fileName);
    if (!url) return NextResponse.json({ error: "Export failed." }, { status: 500 });
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
