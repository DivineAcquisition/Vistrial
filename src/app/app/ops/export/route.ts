import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { buildOrgExport, exportFilename, exportJson } from "@/lib/ops/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const orgId = new URL(request.url).searchParams.get("orgId")?.trim();
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required." }, { status: 400 });
  }
  try {
    const bundle = await buildOrgExport(getSupabaseAdmin(), orgId);
    const body = exportJson(bundle);
    return new NextResponse(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename({ slug: bundle.org.slug as string, name: bundle.org.name as string })}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
