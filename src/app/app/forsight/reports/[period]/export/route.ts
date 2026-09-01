import { NextResponse } from "next/server";

import { loadStoredReport, periodPath, periodStartFromParam } from "@/lib/forsight/report/load";
import { forsightReportPdf } from "@/lib/forsight/report/pdf";
import { assertReportingAccess } from "@/lib/reporting/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Downloads the stored snapshot. The PDF is built from `forsight_reports.payload`
 * and never re-queries a source. Isolation is the same RLS that scopes every
 * other Forsight read: the query is for the caller's workspace, so another
 * workspace's report is not a URL away.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> }
) {
  const access = await assertReportingAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const { period } = await context.params;
  const periodStart = periodStartFromParam(period);
  if (!periodStart) {
    return NextResponse.json({ error: "Not a month." }, { status: 404 });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("v"));
  const version =
    access.ctx.isPlatformAdmin && Number.isInteger(requested) && requested > 0
      ? requested
      : null;

  const supabase = await createClient();
  const stored = await loadStoredReport(supabase, {
    orgId: access.ctx.org.id,
    periodStart,
    version,
  });
  if (!stored) {
    return NextResponse.json({ error: "No report for that month." }, { status: 404 });
  }

  const bytes = await forsightReportPdf(stored);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="forsight-${periodPath(periodStart)}-v${stored.version}.pdf"`,
    },
  });
}
