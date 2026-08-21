import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ReportingRange } from "@/lib/reporting/range";

const ink = rgb(0.05, 0.05, 0.07);
const dim = rgb(0.35, 0.35, 0.4);
const line = rgb(0.85, 0.85, 0.88);

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
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

export async function reportingPdf(args: {
  orgName: string;
  orgSlug: string;
  range: ReportingRange;
  generatedAt: string;
  summary: string;
  sections: Array<{ title: string; lines: string[] }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 760;

  const stamp = [
    args.orgName,
    `Range ${args.range.fromDate} to ${args.range.toDate} (${args.range.key})`,
    `Generated ${args.generatedAt}`,
    `Workspace ${args.orgSlug}`,
  ].join("  ·  ");

  const ensure = (need: number) => {
    if (y - need < 48) {
      page.drawText(stamp, { x: 48, y: 28, size: 8, font, color: dim });
      page = doc.addPage([612, 792]);
      y = 760;
    }
  };

  page.drawText("Client report", { x: 48, y, size: 18, font: bold, color: ink });
  y -= 18;
  page.drawText(args.orgName, { x: 48, y, size: 12, font, color: ink });
  y -= 14;
  for (const lineText of wrap(stamp, 90)) {
    page.drawText(lineText, { x: 48, y, size: 9, font, color: dim });
    y -= 12;
  }
  y -= 8;
  page.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 1, color: line });
  y -= 20;

  page.drawText("Summary", { x: 48, y, size: 12, font: bold, color: ink });
  y -= 16;
  for (const summaryLine of wrap(args.summary, 92)) {
    ensure(14);
    page.drawText(summaryLine, { x: 48, y, size: 10, font, color: ink });
    y -= 13;
  }

  for (const section of args.sections) {
    y -= 10;
    ensure(28);
    page.drawText(section.title, { x: 48, y, size: 12, font: bold, color: ink });
    y -= 16;
    for (const sectionLine of section.lines) {
      for (const wrapped of wrap(sectionLine, 92)) {
        ensure(14);
        page.drawText(wrapped, { x: 48, y, size: 10, font, color: ink });
        y -= 13;
      }
    }
  }

  page.drawText(stamp, { x: 48, y: 28, size: 8, font, color: dim });
  const pages = doc.getPages();
  for (const p of pages) {
    p.drawText(stamp, { x: 48, y: 28, size: 8, font, color: dim });
  }
  return doc.save();
}
