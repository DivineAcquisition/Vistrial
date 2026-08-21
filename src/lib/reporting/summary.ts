import { ATTRIBUTION_LINE, CORRELATION_LINE } from "@/lib/reporting/constants";
import { formatPerHundred, formatSample } from "@/lib/reporting/format";

type Rate = {
  k?: number;
  n?: number;
  per_hundred?: number | null;
  pct?: number | null;
  too_small?: boolean;
  sample_label?: string;
};

export type OutcomePayload = {
  headline?: Rate & { window_start?: string; window_end?: string };
  maturing?: Rate;
  baseline?: (Rate & { grade?: string; caveats?: string[] }) | null;
  self_reported?: {
    leads_per_month?: number;
    clients_closed_per_month?: number;
    label?: string;
  } | null;
  comparison?: {
    shown?: boolean;
    from?: string;
    delta_per_hundred?: number | null;
    improved?: boolean;
    unchanged?: boolean;
    too_small?: boolean;
    plain?: string;
  } | null;
  attribution?: string;
  correlation_caveat?: string;
};

export type CoveragePayload = {
  ever_touched?: Rate;
  within_window?: Rate;
  ghosted_no_touch?: number;
  currently_in_breach?: number;
  median_minutes?: number | null;
};

export type SourcesPayload = {
  high_readiness_low_close?: { source?: string; campaign?: string } | null;
};

export type TerminalPayload = {
  too_small?: boolean;
  rows?: Array<{ cause?: string; n?: number }>;
  suppressed_plain?: string | null;
};

export type SpeedPayload = {
  too_small?: boolean;
  suppressed_plain?: string | null;
};

export type SummaryInput = {
  outcome: OutcomePayload;
  coverage: CoveragePayload;
  sources: SourcesPayload;
  terminal: TerminalPayload;
  speed: SpeedPayload;
};

function rateLine(label: string, rate: Rate | undefined, asPerHundred: boolean): string {
  if (!rate) return `${label}: not measured.`;
  const sample = rate.sample_label ?? formatSample(rate.k ?? 0, rate.n ?? 0);
  if (rate.too_small) {
    return `${label}: ${sample}. The sample is too small to treat as a rate.`;
  }
  if (asPerHundred) {
    return `${label}: ${formatPerHundred(rate.per_hundred ?? null, false)} (${sample}).`;
  }
  const pct = rate.pct;
  if (pct === null || pct === undefined) {
    return `${label}: ${sample}.`;
  }
  return `${label}: ${pct.toFixed(1)}% (${sample}).`;
}

/**
 * Deterministic owner-facing copy. Never claims Vistrial closed a deal or
 * caused a change. If nothing improved, it says so.
 */
export function buildClientSummary(input: SummaryInput): string {
  const lines: string[] = [];
  const outcome = input.outcome;
  const comparison = outcome.comparison;

  lines.push(rateLine("Clients closed per hundred leads after activation", outcome.headline, true));

  if (outcome.maturing && (outcome.maturing.n ?? 0) > 0) {
    lines.push(
      `Maturing leads (not in the headline): ${outcome.maturing.sample_label ?? formatSample(outcome.maturing.k ?? 0, outcome.maturing.n ?? 0)}. They have not had a full sales cycle.`
    );
  }

  if (comparison?.too_small) {
    lines.push(comparison.plain ?? "The sample is too small for the difference to mean anything.");
  } else if (comparison?.shown && comparison.from === "backfilled") {
    lines.push(rateLine("Pre-activation baseline (CRM history)", outcome.baseline ?? undefined, true));
    const delta = comparison.delta_per_hundred;
    if (comparison.unchanged || delta === 0) {
      lines.push("Clients closed per hundred leads did not improve in this window.");
    } else if (comparison.improved && delta != null && delta > 0) {
      lines.push(
        `The after figure is ${delta.toFixed(1)} clients per hundred leads higher than the backfilled baseline. That is a difference in measured rates, not a claim that Vistrial caused it.`
      );
    } else {
      lines.push("Clients closed per hundred leads did not improve in this window.");
    }
  } else if (comparison?.plain) {
    lines.push(comparison.plain);
  } else if (!outcome.baseline) {
    lines.push("No pre-activation comparison is shown.");
  }

  if (outcome.self_reported) {
    lines.push(
      `The client stated a prior baseline of ${outcome.self_reported.leads_per_month} leads per month and ${outcome.self_reported.clients_closed_per_month} clients closed per month (${outcome.self_reported.label ?? "self-reported"}). That is the client's claim, not a Vistrial measurement, and it is not blended into the figures above.`
    );
  }

  lines.push(rateLine("Human-touch coverage", input.coverage.ever_touched, false));
  lines.push(rateLine("Contacted inside the speed-to-lead window", input.coverage.within_window, false));
  if (typeof input.coverage.ghosted_no_touch === "number") {
    lines.push(
      `Leads that went ghost with no human touch: ${input.coverage.ghosted_no_touch}. That is the most expensive operational miss on this screen.`
    );
  }
  if (typeof input.coverage.currently_in_breach === "number") {
    lines.push(`Leads currently outside the speed-to-lead window with no human touch: ${input.coverage.currently_in_breach}.`);
  }

  const flag = input.sources.high_readiness_low_close;
  if (flag?.source) {
    lines.push(
      `A source to inspect: ${flag.source}${flag.campaign ? ` / ${flag.campaign}` : ""} shows high readiness and a lower close rate than the workspace. That is a fit question, not a reason to buy more of the same leads.`
    );
  }

  if (input.terminal.too_small) {
    lines.push(input.terminal.suppressed_plain ?? "Terminal outcomes are too few to split by cause.");
  } else if (input.terminal.rows && input.terminal.rows.length > 0) {
    const top = [...input.terminal.rows].sort((a, b) => (b.n ?? 0) - (a.n ?? 0))[0];
    if (top?.cause) {
      lines.push(`The most common terminal cause in this range is ${top.cause.replaceAll("_", " ")} (${top.n}).`);
    }
  }

  if (input.speed.too_small) {
    lines.push(input.speed.suppressed_plain ?? "Speed-to-lead segmentation is withheld; the sample is too small.");
  }

  lines.push(outcome.attribution ?? ATTRIBUTION_LINE);
  lines.push(outcome.correlation_caveat ?? CORRELATION_LINE);

  const text = lines.join(" ");
  if (/vistrial closed|we closed|our revenue|attributed revenue/i.test(text)) {
    throw new Error("summary overclaimed");
  }
  return text;
}

export function summaryOverstates(text: string): boolean {
  return /vistrial closed|we closed these|caused this increase|attributed revenue|vistrial.?s revenue/i.test(
    text
  );
}
