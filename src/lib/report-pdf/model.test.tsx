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
    expect(model.cover).toMatchObject({ businessName: "Bright Nest Cleaning", title: "Austin deep cleaning: market report", date: "November 9, 2026", brandMark: true });
    expect(model.summary.text).toContain("first-visit discounts");
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

  it("charts sources by platform, the offers and calls to action seen, and the business's own figures", () => {
    const model = buildReportPdf(input, { branding: "vistrial", generatedAt: AT });
    expect(model.charts.platforms).toEqual([
      { label: "Meta Ad Library", value: 2 },
      { label: "Web", value: 2 },
      { label: "Instagram", value: 1 },
      { label: "TikTok", value: 1 },
      { label: "YouTube", value: 1 },
    ]);
    expect(model.charts.ctas[0]).toEqual({ label: "Book now", value: 2 });
    expect(model.charts.offers.map((row) => row.label)).toContain("20% off first clean");
    const meta = model.charts.ownFigures?.find((row) => row.label === "Meta ads");
    expect(meta?.rows.map((row) => [row.label, row.display])).toEqual([
      ["Spend", "$3,913.89"],
      ["Results", "182"],
      ["Cost per result", "$21.50"],
    ]);
    expect(buildReportPdf({ ...input, figures: [] }, { branding: "vistrial", generatedAt: AT }).charts.ownFigures).toBeNull();
  });

  it("lists every source in the appendix, numbered as the findings cite them, with its link", () => {
    const model = buildReportPdf(input, { branding: "whiteLabel", generatedAt: AT });
    expect(model.appendix).toHaveLength(input.sources.length);
    expect(model.appendix.map((row) => row.url)).toEqual(input.sources.map((row) => row.url));
    expect(model.appendix[0]).toMatchObject({ number: 1, platform: "Meta Ad Library", publisher: "Sparkle Co" });
  });

  it("white-label uses the business's name and never says Vistrial, anywhere", () => {
    const model = buildReportPdf(input, { branding: "whiteLabel", generatedAt: AT });
    expect(JSON.stringify(model)).not.toMatch(/vistrial/i);
    expect(model.cover.brandMark).toBe(false);
    expect(model.cover.logoUrl).toBeNull();
    expect(model.meta).toEqual({ title: "Austin deep cleaning: market report", author: "Bright Nest Cleaning", creator: "Bright Nest Cleaning" });
    expect(model.footer.startsWith("Bright Nest Cleaning")).toBe(true);
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
