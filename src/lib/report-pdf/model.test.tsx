import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { storyReportPdf } from "@/app/dev/work-tabs/fixtures";
import { ReportPdf } from "@/components/work/report-pdf";

import { buildReportPdf, pdfText, tally } from "./model";

const AT = Date.UTC(2026, 10, 9);
const input = storyReportPdf();

describe("report PDF content", () => {
  it("has a cover, a summary, findings with their basis, opportunities, charts and a sources appendix", () => {
    const model = buildReportPdf(input, { branding: "vistrial", generatedAt: AT });
    expect(model.cover).toMatchObject({ businessName: "Northlight Growth", title: "Home-service lead generation: market report", date: "November 9, 2026", brandMark: true });
    expect(model.summary.text).toContain("free audits");
    expect(model.summary.stats).toEqual([
      { label: "Findings", value: "4" },
      { label: "Opportunities", value: "2" },
      { label: "Sources", value: "7" },
    ]);
    expect(model.findings.map((row) => row.basisLabel)).toEqual(["Observed", "Observed", "Inference", "Your data"]);
    expect(model.findings[0].sources).toEqual([1, 2, 4]);
    expect(model.findings[3].sources).toEqual([]);
    expect(model.opportunities.map((row) => [row.opportunity, row.uncertainty])).toEqual([
      ["Own the guarantee", null],
      ["Show a fixed price", "Untested hypothesis"],
    ]);
    expect(model.limits).toHaveLength(1);
  });

  it("puts the answer first: the weakest label, the claims by label, and the first opportunity's action", () => {
    const model = buildReportPdf(input, { branding: "vistrial", generatedAt: AT });
    // Observed, Observed, Inference, Your data from the findings, and one untested opportunity.
    expect(model.answer.label).toBe("Untested hypothesis");
    expect(model.answer.byLabel).toEqual([
      { label: "Your data", count: 1 },
      { label: "Observed", count: 2 },
      { label: "Inference", count: 1 },
      { label: "Untested hypothesis", count: 1 },
    ]);
    expect(model.answer.legend.map((row) => row.label)).toEqual(["Your data", "Observed", "Inference", "Untested hypothesis"]);
    expect(model.answer.next).toEqual({ action: "Lead with 20 booked calls in 60 days or we work free.", from: "Own the guarantee", label: null });
    // No opportunities: nothing to do next is invented.
    expect(buildReportPdf({ ...input, opportunities: [] }, { branding: "vistrial", generatedAt: AT }).answer.next).toBeNull();
    // A finding with no saved basis never reads as strong.
    expect(buildReportPdf({ ...input, opportunities: [], findings: [{ statement: "x", basisLabel: "No basis", sourceIds: [] }] }, { branding: "vistrial", generatedAt: AT }).answer.label).toBe("Untested hypothesis");
  });

  it("charts sources by platform, the offers and calls to action seen, and the business's own figures", () => {
    const model = buildReportPdf(input, { branding: "vistrial", generatedAt: AT });
    expect(model.charts.platforms).toEqual([
      { label: "Meta Ad Library", value: 2 },
      { label: "Web", value: 2 },
      { label: "Instagram", value: 1 },
      { label: "TikTok", value: 1 },
      { label: "YouTube", value: 1 },
    ]);
    expect(model.charts.ctas[0]).toEqual({ label: "Book a call", value: 4 });
    expect(model.charts.offers.map((row) => row.label)).toContain("Free audit, 90-day pilot");
    const meta = model.charts.ownFigures?.find((row) => row.label === "Meta ads");
    expect(meta?.rows.map((row) => [row.label, row.display])).toEqual([
      ["Spend", "$3,870"],
      ["Results", "45"],
      ["Cost per result", "$86"],
    ]);
    expect(buildReportPdf({ ...input, figures: [] }, { branding: "vistrial", generatedAt: AT }).charts.ownFigures).toBeNull();
  });

  it("lists every source in the appendix, numbered as the findings cite them, with its link", () => {
    const model = buildReportPdf(input, { branding: "whiteLabel", generatedAt: AT });
    expect(model.appendix).toHaveLength(input.sources.length);
    expect(model.appendix.map((row) => row.url)).toEqual(input.sources.map((row) => row.url));
    expect(model.appendix[0]).toMatchObject({ number: 1, platform: "Meta Ad Library", publisher: "LeadForge Media" });
  });

  it("white-label uses the business's name and never says Vistrial, anywhere", () => {
    const model = buildReportPdf(input, { branding: "whiteLabel", generatedAt: AT });
    expect(JSON.stringify(model)).not.toMatch(/vistrial/i);
    expect(model.cover.brandMark).toBe(false);
    expect(model.cover.logoUrl).toBeNull();
    expect(model.meta).toEqual({ title: "Home-service lead generation: market report", author: "Northlight Growth", creator: "Northlight Growth" });
    expect(model.footer.startsWith("Northlight Growth")).toBe(true);
    // A logo shows only on a white-label cover.
    expect(buildReportPdf(input, { branding: "whiteLabel", logoUrl: "https://example.com/logo.png", generatedAt: AT }).cover.logoUrl).toBe("https://example.com/logo.png");
    expect(buildReportPdf(input, { branding: "vistrial", logoUrl: "https://example.com/logo.png", generatedAt: AT }).cover.logoUrl).toBeNull();
    // The branded one credits Vistrial.
    expect(JSON.stringify(buildReportPdf(input, { branding: "vistrial", generatedAt: AT }))).toMatch(/Vistrial/);
  });

  it("keeps text the PDF's fonts can draw, and folds a long tally into Other", () => {
    expect(pdfText("Leads → bookings ✓ 🎉")).toBe("Leads -> bookings +");
    expect(pdfText("Price: €120 – “fixed”")).toBe("Price: €120 – “fixed”");
    const bars = tally(["a", "b", "c", "d", "e", "f", "g", "a"], 4);
    expect(bars).toEqual([
      { label: "a", value: 2 },
      { label: "b", value: 1 },
      { label: "c", value: 1 },
      { label: "Other", value: 4 },
    ]);
  });

  it("renders both brandings to real PDFs, and the white-label file's metadata names only the business", async () => {
    const out = process.env.SAMPLE_PDF_DIR;
    for (const branding of ["vistrial", "whiteLabel"] as const) {
      // The root must be the Document element itself.
      const buffer = await renderToBuffer(ReportPdf({ model: buildReportPdf(input, { branding, generatedAt: AT }) }));
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(5000);
      const raw = buffer.toString("latin1");
      if (branding === "whiteLabel") expect(raw).not.toMatch(/Vistrial/);
      else expect(raw).toMatch(/Vistrial/);
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, `sample-report-${branding === "vistrial" ? "vistrial" : "white-label"}.pdf`), buffer);
      }
    }
  }, 30_000);
});
