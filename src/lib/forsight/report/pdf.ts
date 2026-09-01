import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ForsightReport, ReportSection, StoredReport } from "@/lib/forsight/report/types";

/**
 * A downloadable copy of a generated report.
 *
 * The shared `documentPdf` helper only wraps prose. A Forsight report has a
 * team scorecard table and a closed-versus-lost comparison that cannot be
 * flattened into sentences without losing the thing the section is for, so
 * this renderer draws those as a table and as two bars. Every page still
 * carries the generation timestamp, because a forwarded page has to remain
 * citable on its own.
 */

const ink = rgb(0.05, 0.05, 0.07);
const dim = rgb(0.35, 0.35, 0.4);
const rule = rgb(0.85, 0.85, 0.88);
const bar = rgb(0.45, 0.38, 0.85);

function pdfSafe(text: string): string {
  return text
    .replaceAll("×", "x")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"');
}

function wrap(text: string, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function stampFor(report: ForsightReport, version: number): string {
  return [
    report.workspace.name,
    report.period.label,
    `Generated ${report.generatedAt}`,
    `Version ${version}`,
  ].join("  ·  ");
}

export async function forsightReportPdf(stored: StoredReport): Promise<Uint8Array> {
  const report = stored.report;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const stamp = pdfSafe(stampFor(report, stored.version));

  let page = doc.addPage([612, 792]);
  let y = 760;

  const ensure = (need: number) => {
    if (y - need < 48) {
      page.drawText(stamp, { x: 48, y: 28, size: 8, font, color: dim });
      page = doc.addPage([612, 792]);
      y = 760;
    }
  };

  const write = (text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number } = {}) => {
    const used = opts.font ?? font;
    const size = opts.size ?? 10;
    const color = opts.color ?? ink;
    const width = opts.width ?? 92;
    for (const line of wrap(text, width)) {
      ensure(14);
      page.drawText(line, { x: 48, y, size, font: used, color });
      y -= size + 3;
    }
  };

  write(report.workspace.name, { size: 18, font: bold, width: 70 });
  write(`${report.period.label} client report`, { size: 12, width: 80 });
  write(`Generated ${report.generatedAt}  ·  Version ${stored.version}`, {
    size: 9,
    color: dim,
    width: 90,
  });
  y -= 6;
  page.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 1, color: rule });
  y -= 18;

  for (const section of report.sections) {
    y -= 8;
    ensure(28);
    write(section.title, { size: 12, font: bold, width: 80 });
    drawSection(section, {
      ensure,
      write,
      getPage: () => page,
      getY: () => y,
      setY: (next) => {
        y = next;
      },
      font,
    });
  }

  const pages = doc.getPages();
  for (const p of pages) {
    p.drawText(stamp, { x: 48, y: 28, size: 8, font, color: dim });
  }
  return doc.save();
}

function drawSection(
  section: ReportSection,
  ctx: {
    ensure: (need: number) => void;
    write: (text: string, opts?: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number }) => void;
    getPage: () => PDFPage;
    getY: () => number;
    setY: (y: number) => void;
    font: PDFFont;
  }
) {
  switch (section.kind) {
    case "absent":
      ctx.write(section.line, { size: 10, color: dim });
      return;
    case "funnel":
      for (const step of section.steps) {
        const conv = step.fromPrevious ? `  (${step.fromPrevious} of the previous step)` : "";
        ctx.write(`${step.label}  ${step.count}${conv}`);
      }
      return;
    case "speed":
      if (section.comparison) {
        ctx.write(section.comparison.title, { size: 10 });
        drawComparison(section.comparison, ctx);
        ctx.write(section.comparison.interpretation);
      }
      for (const figure of section.figures) {
        ctx.write(`${figure.label}: ${figure.value}`);
      }
      return;
    case "revenue":
    case "nurture":
      for (const figure of section.figures) {
        ctx.write(`${figure.label}: ${figure.value}`);
      }
      return;
    case "team":
    case "objections":
      drawTable(section.table.columns, section.table.rows, ctx);
      if (section.kind === "objections") ctx.write(section.interpretation);
      return;
  }
}

function drawComparison(
  comparison: Extract<ReportSection, { kind: "speed" }>["comparison"],
  ctx: {
    ensure: (need: number) => void;
    write: (text: string, opts?: { size?: number }) => void;
    getPage: () => PDFPage;
    getY: () => number;
    setY: (y: number) => void;
    font: PDFFont;
  }
) {
  if (!comparison) return;
  const max = Math.max(comparison.left.value, comparison.right.value, 1);
  const width = 360;
  for (const side of [comparison.left, comparison.right]) {
    ctx.ensure(28);
    const y = ctx.getY();
    ctx.getPage().drawText(pdfSafe(`${side.label}  ${side.display}`), {
      x: 48,
      y,
      size: 10,
      font: ctx.font,
      color: ink,
    });
    ctx.setY(y - 14);
    const barY = ctx.getY();
    ctx.getPage().drawRectangle({
      x: 48,
      y: barY,
      width: Math.max(8, (side.value / max) * width),
      height: 8,
      color: bar,
    });
    ctx.setY(barY - 16);
  }
}

function drawTable(
  columns: string[],
  rows: string[][],
  ctx: {
    ensure: (need: number) => void;
    write: (text: string, opts?: { size?: number; font?: PDFFont }) => void;
  }
) {
  ctx.write(columns.join("  |  "), { size: 9 });
  for (const row of rows) {
    ctx.write(row.join("  |  "), { size: 9 });
  }
}
