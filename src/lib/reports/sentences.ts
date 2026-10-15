import { metricDefinition } from "@/lib/metrics/definitions";
import { formatMetricValue } from "@/lib/metrics/format";

export type FigureLine = {
  metric: string;
  value: number | null;
  display: string;
  sentence: string;
};

/**
 * Compass fills a fixed sentence from each figure. Every number in the
 * sentence is the figure's display value, so a draft cannot invent one.
 */
export function sentenceFor(metric: string, value: number | null): FigureLine {
  const def = metricDefinition(metric);
  const display = formatMetricValue(def, value);
  const sentence = `${def.label} (${metric}): ${display}. ${def.explain}`;
  return { metric, value, display, sentence };
}

export function draftFromFigures(figures: Array<{ metric: string; value: number | null }>): string {
  return figures.map((figure) => sentenceFor(figure.metric, figure.value).sentence).join("\n");
}

const NUMBER = /-?\d[\d,]*(?:\.\d+)?%?/g;

/** Release is blocked when the summary contains a number that is not in the payload. */
export function summaryMatchesFigures(
  summary: string,
  figures: Array<{ metric: string; value: number | null }>
): { ok: true } | { ok: false; reason: string } {
  const allowed = new Set<string>();
  for (const figure of figures) {
    const line = sentenceFor(figure.metric, figure.value);
    for (const match of line.display.match(NUMBER) ?? []) allowed.add(match.replace(/,/g, ""));
    if (figure.value !== null) allowed.add(String(Math.round(figure.value)));
  }
  for (const match of summary.match(NUMBER) ?? []) {
    const normalized = match.replace(/,/g, "");
    if (!allowed.has(normalized) && !allowed.has(normalized.replace("%", ""))) {
      return { ok: false, reason: `The summary includes ${match}, which is not in the report figures.` };
    }
  }
  for (const figure of figures) {
    if (!summary.includes(`(${figure.metric})`)) {
      return { ok: false, reason: `The summary does not name ${figure.metric}.` };
    }
  }
  return { ok: true };
}

export function figureHash(figures: Array<{ metric: string; value: number | null }>): string {
  return figures.map((figure) => `${figure.metric}:${figure.value ?? "null"}`).join("|");
}
