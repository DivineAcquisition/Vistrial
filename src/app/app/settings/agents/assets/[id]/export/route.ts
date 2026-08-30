import { NextResponse } from "next/server";

import { agentAssetPdf } from "@/lib/agents/assets-pdf";
import { assetExportBlocked } from "@/lib/agents/assets";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { org, user } = await requireOrgSettingsManager();
  const { id } = await context.params;
  const db = await createClient();
  const { data } = await (db as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
        };
      };
    };
  })
    .from("agent_assets")
    .select("id, title, body, data_basis, sample_size, version, verbatim_flagged, reviewed, created_at, exported_at")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "That asset is not in this workspace." }, { status: 404 });
  }
  const blocked = assetExportBlocked({
    reviewed: Boolean(data.reviewed),
    verbatimFlagged: Boolean(data.verbatim_flagged),
    sampleSize: Number(data.sample_size),
    dataBasis: String(data.data_basis ?? ""),
  });
  if (!blocked.ok) {
    return NextResponse.json({ error: blocked.reason }, { status: 400 });
  }
  const bytes = await agentAssetPdf({
    title: String(data.title),
    orgName: org.name,
    generatedAt: String(data.created_at),
    version: Number(data.version),
    dataBasis: String(data.data_basis),
    sampleSize: Number(data.sample_size),
    body: String(data.body),
    verbatimFlagged: Boolean(data.verbatim_flagged),
  });
  await (db as unknown as { from: (t: string) => { update: (v: object) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> } } } })
    .from("agent_assets")
    .update({ exported_at: new Date().toISOString(), exported_by: user.id })
    .eq("id", id)
    .eq("org_id", org.id);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vistrial-asset-${id.slice(0, 8)}.pdf"`,
    },
  });
}
