import { NextResponse } from "next/server";

import { isLeadId } from "@/lib/cases/filters";
import { decodeLeadFileContents } from "@/lib/cases/files";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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

  const bytes = decodeLeadFileContents(data.contents);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.content_type,
      "Content-Disposition": contentDisposition(data.file_name),
      "Cache-Control": "private, no-store",
    },
  });
}
