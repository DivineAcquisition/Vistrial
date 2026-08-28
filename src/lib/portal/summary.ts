import { ATTRIBUTION_LINE, CORRELATION_LINE, REPORTING_DIAG_MIN_N, REPORTING_RATE_MIN_N } from "@/lib/reporting/constants";
import { formatPerHundred, formatSample } from "@/lib/reporting/format";
import {
  buildClientSummary,
  summaryOverstates,
  type CoveragePayload,
  type OutcomePayload,
  type SourcesPayload,
  type SpeedPayload,
  type TerminalPayload,
} from "@/lib/reporting/summary";
import { TERMINAL_CAUSE_FIX, UNEVENTFUL_FINDING } from "@/lib/sources/catalog";

export type PortalSummaryInput = {
  outcome: OutcomePayload;
  previousOutcome: OutcomePayload | null;
  coverage: CoveragePayload;
  previousCoverage: CoveragePayload | null;
  sources: SourcesPayload;
  terminal: TerminalPayload;
  speed: SpeedPayload;
};

function ratePerHundred(rate: OutcomePayload["headline"]): number | null {
  if (!rate || rate.too_small) return null;
  return typeof rate.per_hundred === "number" ? rate.per_hundred : null;
}

function coveragePct(rate: CoveragePayload["ever_touched"]): number | null {
  if (!rate || rate.too_small) return null;
  return typeof rate.pct === "number" ? rate.pct : null;
}

function whatChanged(input: PortalSummaryInput): { line: string; declined: boolean; needsAttention: boolean } {
  const current = ratePerHundred(input.outcome.headline);
  const previous = ratePerHundred(input.previousOutcome?.headline);
  const currentN = input.outcome.headline?.n ?? 0;
  const previousN = input.previousOutcome?.headline?.n ?? 0;

  if (!input.previousOutcome) {
    return {
      line: "There is no equal-length previous window after activation to compare this period against.",
      declined: false,
      needsAttention: false,
    };
  }
  if (currentN < REPORTING_RATE_MIN_N || previousN < REPORTING_RATE_MIN_N || current === null || previous === null) {
    return {
      line: `What changed versus the previous window is not shown. Samples are ${formatSample(input.outcome.headline?.k ?? 0, currentN)} this period and ${formatSample(input.previousOutcome.headline?.k ?? 0, previousN)} before.`,
      declined: false,
      needsAttention: false,
    };
  }
  const delta = current - previous;
  if (delta < 0) {
    return {
      line: `Clients closed per hundred leads declined from ${formatPerHundred(previous, false)} to ${formatPerHundred(current, false)} versus the previous equal-length window. That is shown because a hidden decline is how trust in the rest of the page dies.`,
      declined: true,
      needsAttention: true,
    };
  }
  if (delta > 0) {
    return {
      line: `Clients closed per hundred leads moved from ${formatPerHundred(previous, false)} to ${formatPerHundred(current, false)} versus the previous equal-length window. That is a difference in measured rates, not a claim that Vistrial caused it.`,
      declined: false,
      needsAttention: false,
    };
  }
  return {
    line: "Clients closed per hundred leads did not change versus the previous equal-length window.",
    declined: false,
    needsAttention: false,
  };
}

function coverageChange(input: PortalSummaryInput): { line: string | null; declined: boolean } {
  const current = coveragePct(input.coverage.ever_touched);
  const previous = coveragePct(input.previousCoverage?.ever_touched);
  const currentN = input.coverage.ever_touched?.n ?? 0;
  const previousN = input.previousCoverage?.ever_touched?.n ?? 0;
  if (!input.previousCoverage || current === null || previous === null) {
    return { line: null, declined: false };
  }
  if (currentN < REPORTING_RATE_MIN_N || previousN < REPORTING_RATE_MIN_N) {
    return { line: null, declined: false };
  }
  if (current < previous) {
    return {
      line: `Human-touch coverage declined from ${previous.toFixed(1)}% to ${current.toFixed(1)}%.`,
      declined: true,
    };
  }
  return { line: null, declined: false };
}

function biggestLeak(terminal: TerminalPayload): { cause: string; n: number; address: string } | null {
  if (terminal.too_small) return null;
  const rows = [...(terminal.rows ?? [])].filter((row) => (row.n ?? 0) >= REPORTING_DIAG_MIN_N);
  if (rows.length === 0) return null;
  const top = rows.sort((a, b) => (b.n ?? 0) - (a.n ?? 0))[0];
  if (!top?.cause || !top.n) return null;
  return {
    cause: top.cause,
    n: top.n,
    address: TERMINAL_CAUSE_FIX[top.cause] ?? "Look at this cause on its own. Lumping it as lost hides which fix to pick.",
  };
}

/**
 * Section 4 copy. Deterministic. Never manufactures a finding. Never credits
 * Vistrial with revenue or with closing a deal.
 */
export function buildPortalSummary(input: PortalSummaryInput): string {
  const measured = buildClientSummary({
    outcome: input.outcome,
    coverage: input.coverage,
    sources: input.sources,
    terminal: input.terminal,
    speed: input.speed,
  });
  const changed = whatChanged(input);
  const cover = coverageChange(input);
  const leak = biggestLeak(input.terminal);
  const fit = Boolean(input.sources.high_readiness_low_close?.source);
  const needsAttention = changed.needsAttention || cover.declined || Boolean(leak) || fit;

  const lines = [measured, changed.line];
  if (cover.line) lines.push(cover.line);

  if (!needsAttention) {
    lines.push(UNEVENTFUL_FINDING);
  } else {
    if (leak) {
      lines.push(
        `The biggest leak this period is ${leak.cause.replaceAll("_", " ")} (${leak.n} leads). ${leak.address}`
      );
    }
    if (fit) {
      const flag = input.sources.high_readiness_low_close;
      lines.push(
        `A source producing high readiness and lower closes (${flag?.source}${flag?.campaign ? ` / ${flag.campaign}` : ""}) is a fit problem they are currently solving by buying more leads.`
      );
    }
  }

  lines.push(input.outcome.attribution ?? ATTRIBUTION_LINE);
  lines.push(input.outcome.correlation_caveat ?? CORRELATION_LINE);

  const text = lines.join(" ");
  if (summaryOverstates(text) || /vistrial closed|we closed|our revenue|attributed revenue/i.test(text)) {
    throw new Error("summary overclaimed");
  }
  return text;
}

export { UNEVENTFUL_FINDING };
