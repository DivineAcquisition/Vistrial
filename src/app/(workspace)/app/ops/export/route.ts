import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { signedExportUrl, storeExportFile } from "@/lib/exports/store";
import { enqueueNotification } from "@/lib/notifications/enqueue";
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
  const { assertRecentAuth } = await import("@/lib/staff/mfa-check");
  await assertRecentAuth(`/app/ops/export?orgId=${orgId}`);
  try {
    const admin = getSupabaseAdmin();
    const bundle = await buildOrgExport(admin, orgId, { includeOutbound: false, includeTranscripts: false });
    const fileName = exportFilename({ slug: bundle.org.slug as string, name: bundle.org.name as string });
    const stored = await storeExportFile({
      orgId,
      userId: ctx.user.id,
      kind: "workspace",
      fileName,
      contentType: "application/json",
      body: exportJson(bundle),
      params: { requestedBy: "platform_admin" },
    });
    const { data: owners } = await admin
      .from("org_members")
      .select("id, user_id")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .eq("active", true)
      .limit(3);
    for (const owner of owners ?? []) {
      await enqueueNotification(admin, {
        orgId,
        eventType: "export_ready",
        channel: "email",
        recipientUserId: owner.user_id,
        recipientMemberId: owner.id,
        subjectIds: [stored.jobId],
        title: "A workspace export was created",
        body: "Someone on the Vistrial team exported this workspace. The file does not include message text.",
        href: "/app/settings/privacy",
        dedupeKey: `staff-export:${stored.jobId}:${owner.user_id}`,
      });
    }
    const url = await signedExportUrl(stored.path, fileName);
    if (!url) return NextResponse.json({ error: "Export failed." }, { status: 500 });
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
