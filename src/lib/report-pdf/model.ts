/**
 * A market report's PDF, as data: every word and every chart value the document draws, assembled in code
 * from the report, its sources and the business's own figures. The renderer only lays this out, so what a
 * PDF says (and that a white-label one never says "Vistrial") is checked here, in tests.
 */

export type Branding = "vistrial" | "whiteLabel";

export type ReportPdfInput = {
  title: string;
  version: number;
  createdAt: number;
  businessName: string;
  market: string;
  geography: string;
  objective: string;
  summary: string;
  findings: { statement: string; basisLabel: string; sourceIds: string[] }[];
  opportunities: { opportunity: string; proposedAction: string; validationMethod: string; uncertainty: string; sourceIds: string[] }[];
  limits: string[];
  sources: { id: string; platform: string; title: string; url: string; publisher: string | null; offer: string | null; callToAction: string | null }[];
  figures: { source: string; label: string; currency: string | null; period: string | null; spend: number | null; conversions: number | null; revenue: number | null }[];
};

export type Bar = { label: string; value: number };

export type ReportPdfModel = {
  meta: { title: string; author: string; creator: string };
  cover: { eyebrow: string; businessName: string; title: string; subtitle: string; date: string; logoUrl: string | null; brandMark: boolean };
  summary: { objective: string; text: string; stats: { label: string; value: string }[] };
  findings: { number: number; statement: string; basisLabel: string; sources: number[] }[];
  opportunities: { number: number; opportunity: string; action: string; howToTell: string; uncertainty: string | null; sources: number[] }[];
  limits: string[];
  charts: {
    platforms: Bar[];
    offers: Bar[];
    ctas: Bar[];
    /** The business's own figures, one group per source. Null when none are connected. */
    ownFigures: null | { label: string; period: string | null; rows: { label: string; value: number; display: string }[] }[];
  };
  appendix: { number: number; title: string; platform: string; publisher: string | null; url: string }[];
  footer: string;
};

export const PLATFORM_WORDS: Record<string, string> = {
  web: "Web",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  metaAdLibrary: "Meta Ad Library",
  customerData: "Your data",
  upload: "Your files",
};

const UNCERTAINTY: Record<string, string | null> = { none: null, hypothesis: "Untested hypothesis", insufficient: "Not enough data" };

/** The PDF's built-in fonts cover Latin-1 and common punctuation. Anything else is spelled out or dropped. */
export function pdfText(value: string) {
  return value
    .replace(/[→⇒]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[✓✔]/g, "+")
    .replace(/[^\u0009\u000A\u000D -ÿ–—‘’“”•…€]/g, "")
    .trim();
}

/** Counts by a key, largest first, with the rest folded into "Other" past `top`. */
export function tally(values: string[], top = 6): Bar[] {
  const counts = new Map<string, { label: string; value: number }>();
  for (const raw of values) {
    const label = pdfText(raw).replace(/\s+/g, " ").slice(0, 48);
    if (!label) continue;
    const key = label.toLowerCase();
    const row = counts.get(key) ?? { label, value: 0 };
    row.value += 1;
    counts.set(key, row);
  }
  const sorted = [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top - 1).reduce((sum, row) => sum + row.value, 0);
  return [...sorted.slice(0, top - 1), { label: "Other", value: rest }];
}

function moneyDisplay(value: number, currency: string | null) {
  const symbol = currency === "USD" || !currency ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 2 : 0 })}`;
}

function dateWords(time: number) {
  return new Date(time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Builds the PDF's content. White-label puts the business's name (and its logo, when there is one) where
 * Vistrial's would be, and leaves Vistrial out of every word, including the document's metadata.
 */
export function buildReportPdf(input: ReportPdfInput, options: { branding: Branding; logoUrl?: string | null; generatedAt: number }): ReportPdfModel {
  const white = options.branding === "whiteLabel";
  const business = pdfText(input.businessName) || "Your business";
  // Sources are numbered in the order the appendix lists them, so [3] in a finding is row 3.
  const number = new Map(input.sources.map((row, i) => [row.id, i + 1]));
  const refs = (ids: string[]) => [...new Set(ids.map((id) => number.get(id)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
  const where = [input.market, input.geography].map(pdfText).filter(Boolean).join(", ");

  const ownFigures = input.figures
    .map((row) => {
      const rows: { label: string; value: number; display: string }[] = [];
      if (row.spend !== null) rows.push({ label: "Spend", value: row.spend, display: moneyDisplay(row.spend, row.currency) });
      if (row.conversions !== null) rows.push({ label: row.source === "meta" ? "Results" : "Conversions", value: row.conversions, display: row.conversions.toLocaleString("en-US") });
      if (row.revenue !== null) rows.push({ label: "Revenue", value: row.revenue, display: moneyDisplay(row.revenue, row.currency) });
      if (row.spend !== null && row.conversions) {
        const per = Math.round((row.spend / row.conversions) * 100) / 100;
        rows.push({ label: row.source === "meta" ? "Cost per result" : "Cost per conversion", value: per, display: moneyDisplay(per, row.currency) });
      }
      return { label: pdfText(row.label), period: row.period, rows };
    })
    .filter((group) => group.rows.length > 0);

  const findings = input.findings.map((row, i) => ({ number: i + 1, statement: pdfText(row.statement), basisLabel: row.basisLabel, sources: refs(row.sourceIds) }));
  return {
    meta: {
      title: pdfText(input.title),
      author: white ? business : `${business}, prepared with Vistrial`,
      creator: white ? business : "Vistrial",
    },
    cover: {
      eyebrow: white ? "Market report" : "Vistrial · Market report",
      businessName: business,
      title: pdfText(input.title),
      subtitle: where ? `${where} · version ${input.version}` : `Version ${input.version}`,
      date: dateWords(options.generatedAt),
      logoUrl: white ? (options.logoUrl ?? null) : null,
      brandMark: !white,
    },
    summary: {
      objective: pdfText(input.objective),
      text: pdfText(input.summary),
      stats: [
        { label: "Findings", value: String(findings.length) },
        { label: "Opportunities", value: String(input.opportunities.length) },
        { label: "Sources", value: String(input.sources.length) },
      ],
    },
    findings,
    opportunities: input.opportunities.map((row, i) => ({
      number: i + 1,
      opportunity: pdfText(row.opportunity),
      action: pdfText(row.proposedAction),
      howToTell: pdfText(row.validationMethod),
      uncertainty: UNCERTAINTY[row.uncertainty] ?? null,
      sources: refs(row.sourceIds),
    })),
    limits: input.limits.map(pdfText).filter(Boolean),
    charts: {
      platforms: tally(input.sources.map((row) => PLATFORM_WORDS[row.platform] ?? row.platform), 7),
      offers: tally(input.sources.map((row) => row.offer ?? "")),
      ctas: tally(input.sources.map((row) => row.callToAction ?? "")),
      ownFigures: ownFigures.length ? ownFigures : null,
    },
    appendix: input.sources.map((row, i) => ({ number: i + 1, title: pdfText(row.title) || row.url, platform: PLATFORM_WORDS[row.platform] ?? row.platform, publisher: row.publisher ? pdfText(row.publisher) : null, url: row.url })),
    footer: white ? `${business} · ${pdfText(input.title)}` : `${business} · Prepared with Vistrial. Every claim cites its sources.`,
  };
}
