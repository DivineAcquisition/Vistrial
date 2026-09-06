import { NextResponse } from "next/server";

import { isProductScopeEnabled } from "@/lib/product-scope";
import { assertReportingAccess } from "@/lib/reporting/access";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { reportingPdf } from "@/lib/reporting/pdf";
import { buildClientSummary, summaryOverstates } from "@/lib/reporting/summary";
import { formatPerHundred, formatPct, formatSample, formatCount } from "@/lib/reporting/format";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rateLine(label: string, value: unknown, perHundred: boolean): string {
  const row = asRecord(value);
  const tooSmall = row.too_small === true;
  const sample = str(row.sample_label) ?? formatSample(num(row.k) ?? 0, num(row.n) ?? 0);
  if (perHundred) {
    return `${label}: ${formatPerHundred(num(row.per_hundred), tooSmall)} (${sample})`;
  }
  return `${label}: ${formatPct(num(row.pct), tooSmall)} (${sample})`;
}

export async function POST(request: Request) {
  if (!isProductScopeEnabled("documentGeneration")) {
    return new NextResponse(null, { status: 404 });
  }
  const access = await assertReportingAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
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

  const [outcome, coverage, sources, terminal, speed, contribution] = await Promise.all([
    loadReportingPanel(access.ctx.org.id, "outcome", range),
    loadReportingPanel(access.ctx.org.id, "coverage", range),
    loadReportingPanel(access.ctx.org.id, "sources", range),
    loadReportingPanel(access.ctx.org.id, "terminal", range),
    loadReportingPanel(access.ctx.org.id, "speed", range),
    loadReportingPanel(access.ctx.org.id, "contribution", range),
  ]);

  const summary =
    summaryRaw.trim() ||
    buildClientSummary({
      outcome: outcome as never,
      coverage: coverage as never,
      sources: sources as never,
      terminal: terminal as never,
      speed: speed as never,
    });

  if (summaryOverstates(summary)) {
    return NextResponse.json({ error: "The summary overstates the product's contribution." }, { status: 400 });
  }

  const bytes = await reportingPdf({
    orgName: access.ctx.org.name,
    orgSlug: access.ctx.org.slug,
    range,
    generatedAt,
    summary,
    sections: [
      {
        title: "Outcome",
        lines: [
          rateLine("After activation", outcome.headline, true),
          outcome.baseline
            ? rateLine("Backfilled baseline", outcome.baseline, true)
            : "No pre-activation comparison is shown.",
          str(asRecord(outcome.comparison).plain) ?? "",
          str(outcome.attribution) ?? "",
        ].filter(Boolean),
      },
      {
        title: "Coverage",
        lines: [
          rateLine("Human touch", coverage.ever_touched, false),
          rateLine("Inside the window", coverage.within_window, false),
          `Went quiet with no human touch: ${formatCount(num(coverage.ghosted_no_touch) ?? 0)}`,
        ],
      },
      {
        title: "Diagnostics",
        lines: [
          sources.high_readiness_low_close
            ? `High-readiness low-close source: ${JSON.stringify(sources.high_readiness_low_close)}`
            : "No high-readiness low-close source flagged.",
          terminal.too_small === true
            ? String(terminal.suppressed_plain ?? "Terminal split withheld.")
            : `Terminal n=${formatCount(num(terminal.n) ?? 0)}`,
          speed.too_small === true
            ? String(speed.suppressed_plain ?? "Speed segmentation withheld.")
            : `Waiting-time n=${formatCount(num(speed.n) ?? 0)}`,
        ],
      },
      {
        title: "What Vistrial actually did",
        lines: [
          str(contribution.attribution) ?? "",
          ...(Array.isArray(contribution.items)
            ? contribution.items.map((item) => JSON.stringify(item))
            : []),
        ],
      },
    ],
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vistrial-client-report-${access.ctx.org.slug}-${range.fromDate}.pdf"`,
    },
  });
}
