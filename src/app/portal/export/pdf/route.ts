import { NextResponse } from "next/server";

import { assertPortalAccess } from "@/lib/portal/access";
import { loadPortalRpc } from "@/lib/portal/load";
import { previousEqualRange } from "@/lib/portal/range";
import { portalPdf } from "@/lib/portal/pdf";
import { buildPortalSummary } from "@/lib/portal/summary";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { summaryOverstates } from "@/lib/reporting/summary";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await assertPortalAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const form = await request.formData();
  const summaryRaw = String(form.get("summary") ?? "");
  if (summaryOverstates(summaryRaw)) {
    return NextResponse.json(
      { error: "The summary credits Vistrial with a close or with revenue. That cannot be exported." },
      { status: 400 }
    );
  }

  const meta = await loadReportingState(access.ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);
  const generatedAt = new Date().toISOString();
  const previous = previousEqualRange(range, activatedAt);

  const [outcome, coverage, sources, terminal, speed, previousOutcome, previousCoverage, adoption, ads, processor, calendar, forms, recorder] =
    await Promise.all([
      loadReportingPanel(access.ctx.org.id, "outcome", range),
      loadReportingPanel(access.ctx.org.id, "coverage", range),
      loadReportingPanel(access.ctx.org.id, "sources", range),
      loadReportingPanel(access.ctx.org.id, "terminal", range),
      loadReportingPanel(access.ctx.org.id, "speed", range),
      previous ? loadReportingPanel(access.ctx.org.id, "outcome", previous) : Promise.resolve(null),
      previous ? loadReportingPanel(access.ctx.org.id, "coverage", previous) : Promise.resolve(null),
      loadPortalRpc(access.ctx.org.id, "portal_adoption", range),
      loadPortalRpc(access.ctx.org.id, "portal_ads", range),
      loadPortalRpc(access.ctx.org.id, "portal_processor", range),
      loadPortalRpc(access.ctx.org.id, "portal_calendar", range),
      loadPortalRpc(access.ctx.org.id, "portal_forms", range),
      loadPortalRpc(access.ctx.org.id, "portal_recorder", range),
    ]);

  const summary =
    summaryRaw.trim() ||
    buildPortalSummary({
      outcome: outcome as never,
      previousOutcome: previousOutcome as never,
      coverage: coverage as never,
      previousCoverage: previousCoverage as never,
      sources: sources as never,
      terminal: terminal as never,
      speed: speed as never,
    });

  if (summaryOverstates(summary)) {
    return NextResponse.json({ error: "The summary overstates the product's contribution." }, { status: 400 });
  }

  const bytes = await portalPdf({
    orgName: access.ctx.org.name,
    orgSlug: access.ctx.org.slug,
    range,
    generatedAt,
    summary,
    outcome,
    coverage,
    terminal,
    sources,
    adoption,
    ads,
    processor,
    calendar,
    forms,
    recorder,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vistrial-owner-report-${access.ctx.org.slug}-${range.fromDate}.pdf"`,
    },
  });
}
