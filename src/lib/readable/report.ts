/**
 * The at-a-glance layer for a written report (a market report, a diagnosis read as a document). Everything is
 * read back out of what the report already says: its own Markdown body and its saved evidence rows. Nothing is
 * rewritten or summarised here, and no model is called. If the body is not in the shape reports are written in,
 * the parts that cannot be found are simply absent.
 */
import { evidenceCounts, weakestClaim, type EvidenceWord } from "./evidence";

export type ReportEvidence = { basisLabel?: string | null; sources?: { url: string }[]; missing?: boolean };
export type ReportOpportunity = { title: string; evidence: string; why: string; action: string; howToTell: string };
export type ReportSection = { title: string; id: string; items: number };
export type ReportGlance = {
  /** The report's own first paragraph after its objective. */
  summary: string;
  objective: string;
  opportunities: ReportOpportunity[];
  sections: ReportSection[];
  claims: number;
  /** Distinct sources cited across the claims. */
  sources: number;
  /** Claims whose source cannot be found. They block approval. */
  missing: number;
  byLabel: { label: EvidenceWord; count: number }[];
  /** The weakest label among the claims that make a claim (see weakestClaim). Null when no claim carries one (older reports). */
  weakest: EvidenceWord | null;
};

const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\s)_([^_]+)_/g, "$1$2").trim();

/** The id a heading gets on the page, so the outline can link to it. Same text, same id. */
export function headingId(title: string) {
  return `report-${plain(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const FIELD: Record<string, keyof Omit<ReportOpportunity, "title">> = { evidence: "evidence", "why it matters here": "why", "proposed action": "action", "how to tell if it worked": "howToTell" };

export function reportGlance(body: string, evidence: readonly ReportEvidence[]): ReportGlance {
  const lines = body.split("\n").map((line) => line.trimEnd());
  let summary = "";
  let objective = "";
  const sections: ReportSection[] = [];
  const opportunities: ReportOpportunity[] = [];
  let section: ReportSection | null = null;
  let opportunity: ReportOpportunity | null = null;
  let paragraph: string[] = [];
  const endParagraph = () => {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text || section) return;
    const asObjective = text.match(/^\*\*Objective:\*\*\s*(.*)$/);
    if (asObjective) objective = plain(asObjective[1]);
    else if (!summary) summary = plain(text);
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const item = line.match(/^\s*-\s+(.*)$/);
    if (heading) {
      endParagraph();
      if (heading[1].length === 2) {
        section = { title: plain(heading[2]), id: headingId(heading[2]), items: 0 };
        sections.push(section);
        opportunity = null;
      } else if (heading[1].length === 3 && section?.title === "Opportunities") {
        opportunity = { title: plain(heading[2]).replace(/^\d+\.\s*/, ""), evidence: "", why: "", action: "", howToTell: "" };
        opportunities.push(opportunity);
        section.items += 1;
      }
    } else if (item) {
      endParagraph();
      const field = item[1].match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
      const key = field ? FIELD[field[1].trim().toLowerCase()] : undefined;
      if (opportunity && key) opportunity[key] = plain(field![2]);
      else if (section && !opportunity) section.items += 1;
    } else if (line.trim() === "") endParagraph();
    else paragraph.push(line.trim());
  }
  endParagraph();

  const labels = evidence.flatMap((row) => (row.basisLabel ? [row.basisLabel] : []));
  return {
    summary,
    objective,
    opportunities,
    sections,
    claims: evidence.length,
    sources: new Set(evidence.flatMap((row) => (row.sources ?? []).map((source) => source.url))).size,
    missing: evidence.filter((row) => row.missing).length,
    byLabel: evidenceCounts(labels),
    weakest: weakestClaim(labels),
  };
}
