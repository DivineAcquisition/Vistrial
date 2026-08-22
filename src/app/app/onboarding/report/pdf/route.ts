import { NextResponse } from "next/server";

import {
  benchmarkLines,
  formatMoney,
  leakFindingLines,
  parseLeakReport,
} from "@/lib/profile/leak";
import { assertProfileAccess, loadLatestLeakReport } from "@/lib/profile/load";
import { asRecord } from "@/lib/profile/parse";
import { documentPdf } from "@/lib/reporting/pdf";

export const dynamic = "force-dynamic";

const BASIS_SUMMARY: Record<string, string> = {
  backfill:
    "Every figure below is measured from this business's own CRM history. Value estimates use the close rate and price the owner stated, and are labelled as estimates.",
  backfill_partial:
    "Every figure below is measured from this business's own CRM history, which graded partial. What the history is missing is named rather than filled in.",
  profile_only:
    "The CRM history graded unusable, so there is nothing measured here. Everything below is the owner's own stated figures, and nothing has been inferred to cover the gap.",
};

export async function POST() {
  const access = await assertProfileAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const latest = await loadLatestLeakReport(access.ctx.org.id);
  if (!latest) {
    return NextResponse.json({ error: "No report has been generated yet." }, { status: 404 });
  }

  const report = parseLeakReport(asRecord(latest.payload));
  const generatedAt = report.generatedAt || new Date().toISOString();

  const sections = report.findings.map((finding) => ({
    title: finding.title,
    lines: leakFindingLines(finding, report.minSample),
  }));

  sections.push({
    title: "Against comparable businesses",
    lines: benchmarkLines(report.benchmark),
  });

  if (report.missing.length > 0) {
    sections.push({
      title: "What the history is missing",
      lines: report.missing,
    });
  }

  if (report.movement.length > 0) {
    sections.push({
      title: "Movement since the first report",
      lines: [
        `Measured against the same baseline, first cut ${
          report.movementAgainst ? new Date(report.movementAgainst).toISOString().slice(0, 10) : "earlier"
        }.`,
        ...report.movement.map(
          (row) =>
            `${row.key.replace(/_/g, " ")}: ${row.first} then, ${row.now} now (${
              row.delta > 0 ? "+" : ""
            }${row.delta}).`
        ),
      ],
    });
  }

  sections.push({
    title: "The figures you gave us",
    lines: [
      `Close rate: ${report.stated.closeRatePct ?? "not stated"}%.`,
      `Price per client: ${formatMoney(report.stated.pricePointCents)}.`,
      `Leads a month: ${report.stated.monthlyLeadVolume ?? "not stated"}.`,
      `Intended response time: ${report.stated.speedToLeadIntentMinutes ?? "not stated"} minutes.`,
      "Every value estimate in this report is built from these two figures and is an estimate, not a measurement.",
    ],
  });

  const bytes = await documentPdf({
    title: "Leak Report",
    subtitle: report.orgName || access.ctx.org.name,
    stampParts: [
      report.orgName || access.ctx.org.name,
      report.windowStart && report.windowEnd
        ? `History ${report.windowStart.slice(0, 10)} to ${report.windowEnd.slice(0, 10)}`
        : "No measurable history",
      `Generated ${generatedAt.slice(0, 10)}`,
      `Workspace ${report.orgSlug || access.ctx.org.slug}`,
    ],
    summaryTitle: "What this is",
    summary: BASIS_SUMMARY[report.basis] ?? report.basisLabel,
    sections,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vistrial-leak-report-${
        report.orgSlug || access.ctx.org.slug
      }-${generatedAt.slice(0, 10)}.pdf"`,
    },
  });
}
