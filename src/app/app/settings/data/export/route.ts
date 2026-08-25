import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { buildOrgExport, exportFilename, exportJson } from "@/lib/ops/export";
import { isOwner } from "@/lib/settings/managed";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) {
    notFound();
  }
  try {
    const bundle = await buildOrgExport(getSupabaseAdmin(), ctx.org.id);
    const body = exportJson(bundle);
    return new NextResponse(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename({ slug: ctx.org.slug, name: ctx.org.name })}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
