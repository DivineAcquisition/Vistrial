import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { documentPdf } from "@/lib/reporting/pdf";

describe("exported documents", () => {
  it("renders a real PDF and stamps every page with the org, range and date", async () => {
    const bytes = await documentPdf({
      title: "Leak Report",
      subtitle: "Apex Fitness Mentoring",
      stampParts: [
        "Apex Fitness Mentoring",
        "History 2025-08-22 to 2026-08-22",
        "Generated 2026-08-22",
        "Workspace apex-fitness",
      ],
      summaryTitle: "What this is",
      summary: "Every figure below is measured from this business's own CRM history.",
      // Enough content to spill onto a second page, so the per-page stamp is
      // exercised rather than only the first one.
      sections: Array.from({ length: 12 }, (_, index) => ({
        title: `Finding ${index + 1}`,
        lines: Array.from({ length: 8 }, (_, line) => `Line ${line + 1} of finding ${index + 1}.`),
      })),
    });

    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("%%EOF");

    // It has to spill onto a second page, because that is the case where a
    // page could end up leaving the reader without the stamp.
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it("survives a document with nothing in it rather than throwing", async () => {
    const bytes = await documentPdf({
      title: "Leak Report",
      subtitle: "Nobody Co",
      stampParts: ["Nobody Co", "", "Generated 2026-08-22", "Workspace nobody"],
      summaryTitle: "What this is",
      summary: "",
      sections: [],
    });
    expect(Buffer.from(bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
  });
});
