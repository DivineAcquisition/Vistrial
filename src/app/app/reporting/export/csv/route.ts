import { NextResponse } from "next/server";

import { assertReportingAccess } from "@/lib/reporting/access";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { reportingCsv } from "@/lib/reporting/csv";
import { CLIENT_PANELS } from "@/lib/reporting/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await assertReportingAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const meta = await loadReportingState(access.ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);
  const generatedAt = new Date().toISOString();
  const panels: Record<string, Record<string, unknown>> = {};
  for (const panel of CLIENT_PANELS) {
    panels[panel] = await loadReportingPanel(access.ctx.org.id, panel, range);
  }
  const csv = reportingCsv({
    orgName: access.ctx.org.name,
    orgSlug: access.ctx.org.slug,
    range,
    generatedAt,
    panels,
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vistrial-reporting-${access.ctx.org.slug}-${range.fromDate}-${range.toDate}.csv"`,
    },
  });
}
