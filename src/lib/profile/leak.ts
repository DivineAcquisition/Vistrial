import type { Enums } from "@/types/database";
import { asArray, asRecord, bool, num, str } from "@/lib/profile/parse";
import { BENCHMARK_METRIC_LABELS, BENCHMARK_METRIC_UNITS } from "@/lib/profile/vocabulary";

export type LeakRate = {
  k: number;
  n: number;
  pct: number | null;
  tooSmall: boolean;
  sampleLabel: string;
};

export type LeakFinding = {
  key: string;
  title: string;
  shown: boolean;
  measured: boolean;
  trace: string;
  fix: string;
  /** Null where Vistrial does not address the finding, which is said out loud. */
  vistrial: string | null;
  rate: LeakRate | null;
  valueEstimateCents: number | null;
  estimateBasis: string | null;
  /** Everything else the finding carries, rendered per key by the screen. */
  extra: Record<string, unknown>;
};

export type LeakMovement = {
  key: string;
  first: number;
  now: number;
  delta: number;
};

export type LeakReport = {
  basis: Enums<"leak_report_basis">;
  basisLabel: string;
  generatedAt: string;
  orgName: string;
  orgSlug: string;
  profileVersion: number;
  windowStart: string | null;
  windowEnd: string | null;
  missing: string[];
  minSample: number;
  stated: {
    closeRatePct: number | null;
    pricePointCents: number | null;
    monthlyLeadVolume: number | null;
    speedToLeadIntentMinutes: number | null;
  };
  findings: LeakFinding[];
  benchmark: Record<string, unknown>;
  movement: LeakMovement[];
  movementAgainst: string | null;
};

function parseRate(value: unknown): LeakRate | null {
  if (!value) return null;
  const row = asRecord(value);
  if (row.n === undefined) return null;
  return {
    k: num(row.k) ?? 0,
    n: num(row.n) ?? 0,
    pct: num(row.pct),
    tooSmall: bool(row.too_small),
    sampleLabel: str(row.sample_label) ?? `${num(row.k) ?? 0} of ${num(row.n) ?? 0}`,
  };
}

export function parseLeakReport(value: unknown): LeakReport {
  const row = asRecord(value);
  const findings: LeakFinding[] = asArray(row.findings).map((item) => {
    const f = asRecord(item);
    const known = new Set([
      "key",
      "title",
      "shown",
      "measured",
      "trace",
      "fix",
      "vistrial",
      "rate",
      "value_estimate_cents",
      "estimate_basis",
    ]);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (!known.has(k)) extra[k] = v;
    }
    return {
      key: str(f.key) ?? "",
      title: str(f.title) ?? "",
      shown: bool(f.shown),
      measured: bool(f.measured),
      trace: str(f.trace) ?? "",
      fix: str(f.fix) ?? "",
      vistrial: str(f.vistrial),
      rate: parseRate(f.rate),
      valueEstimateCents: num(f.value_estimate_cents),
      estimateBasis: str(f.estimate_basis),
      extra,
    };
  });

  const stated = asRecord(row.stated);

  return {
    basis: (str(row.basis) as Enums<"leak_report_basis">) ?? "profile_only",
    basisLabel: str(row.basis_label) ?? "",
    generatedAt: str(row.generated_at) ?? "",
    orgName: str(row.org_name) ?? "",
    orgSlug: str(row.org_slug) ?? "",
    profileVersion: num(row.profile_version) ?? 1,
    windowStart: str(row.window_start),
    windowEnd: str(row.window_end),
    missing: asArray(row.missing).filter((item): item is string => typeof item === "string"),
    minSample: num(row.min_sample) ?? 20,
    stated: {
      closeRatePct: num(stated.close_rate_pct),
      pricePointCents: num(stated.price_point_cents),
      monthlyLeadVolume: num(stated.monthly_lead_volume),
      speedToLeadIntentMinutes: num(stated.speed_to_lead_intent_minutes),
    },
    findings,
    benchmark: asRecord(row.benchmark),
    movement: asArray(row.movement).flatMap((item) => {
      const m = asRecord(item);
      const key = str(m.key);
      const first = num(m.first);
      const now = num(m.now);
      if (!key || first === null || now === null) return [];
      return [{ key, first, now, delta: num(m.delta) ?? 0 }];
    }),
    movementAgainst: str(row.movement_against),
  };
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatLeakPct(rate: LeakRate | null, minSample: number): string {
  if (!rate) return "—";
  if (rate.tooSmall || rate.pct === null) {
    return `${rate.sampleLabel} (under ${minSample}, so no rate is shown)`;
  }
  return `${rate.pct}% (${rate.sampleLabel})`;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 90) return `${value} minutes`;
  const hours = value / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10} hours`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * The report as plain lines, used by the PDF and by the copy the screen shows
 * beneath each finding. Kept in one place so the export and the screen cannot
 * drift apart.
 */
export function leakFindingLines(finding: LeakFinding, minSample: number): string[] {
  const lines: string[] = [];

  if (!finding.shown) {
    lines.push(finding.trace);
    lines.push(`Fix: ${finding.fix}`);
    return lines;
  }

  if (finding.rate) {
    lines.push(formatLeakPct(finding.rate, minSample));
  }

  switch (finding.key) {
    case "speed_to_lead": {
      const actual = num(finding.extra.actual_median_minutes);
      const intent = num(finding.extra.intent_minutes);
      lines.push(`You aim for ${formatMinutes(intent)}.`);
      lines.push(
        actual === null
          ? `The real median is not shown: ${num(finding.extra.sample_n) ?? 0} touched contacts is under ${minSample}.`
          : `The real median is ${formatMinutes(actual)}.`
      );
      break;
    }
    case "show_rate": {
      lines.push(`${num(finding.extra.no_show_count) ?? 0} people booked and did not show.`);
      break;
    }
    case "close_rate_by_source": {
      for (const item of asArray(finding.extra.rows).slice(0, 8)) {
        const rowRec = asRecord(item);
        const rate = parseRate(rowRec.rate);
        lines.push(`${str(rowRec.source) ?? "unattributed"}: ${formatLeakPct(rate, minSample)}`);
      }
      const zero = asArray(finding.extra.zero_close_sources).filter(
        (item): item is string => typeof item === "string"
      );
      if (zero.length > 0) {
        lines.push(`Volume but no closes: ${zero.join(", ")}.`);
      }
      break;
    }
    case "cost_per_acquisition": {
      lines.push(
        `${formatMoney(num(finding.extra.monthly_spend_cents))} a month of shared spend, ${
          num(finding.extra.closes_in_window) ?? 0
        } closes in the window.`
      );
      lines.push(`Cost per client: ${formatMoney(num(finding.extra.cost_per_close_cents))}.`);
      break;
    }
    case "where_deals_die": {
      for (const item of asArray(finding.extra.rows)) {
        const rowRec = asRecord(item);
        lines.push(`${str(rowRec.cause) ?? "unknown"}: ${num(rowRec.n) ?? 0}`);
      }
      break;
    }
    case "stated_shape": {
      const s = asRecord(finding.extra.stated);
      lines.push(`${num(s.monthly_lead_volume) ?? 0} leads a month at ${num(s.close_rate_pct) ?? 0}% close rate.`);
      lines.push(
        `That is ${num(s.implied_clients_per_month) ?? 0} clients and ${formatMoney(
          num(s.implied_revenue_cents_per_month)
        )} a month, from your figures rather than ours.`
      );
      break;
    }
    default:
      break;
  }

  if (finding.valueEstimateCents !== null) {
    lines.push(`Estimated value: ${formatMoney(finding.valueEstimateCents)}.`);
  }
  if (finding.estimateBasis) lines.push(finding.estimateBasis);
  lines.push(finding.trace);
  lines.push(`Fix: ${finding.fix}`);
  lines.push(
    finding.vistrial
      ? `Vistrial: ${finding.vistrial}`
      : "Vistrial does not address this one."
  );
  return lines;
}

export function benchmarkLines(benchmark: Record<string, unknown>): string[] {
  if (!bool(benchmark.shown)) {
    return [str(benchmark.plain) ?? "No benchmark is shown."];
  }
  const lines = asArray(benchmark.rows).map((item) => {
    const row = asRecord(item);
    const metric = str(row.metric) as Enums<"benchmark_metric"> | null;
    if (!metric) return "";
    const unit = BENCHMARK_METRIC_UNITS[metric];
    const own = num(row.own_value);
    const median = num(row.cohort_median);
    return `${BENCHMARK_METRIC_LABELS[metric]}: you ${
      own === null ? "not yet measurable" : `${own}${unit}`
    }, comparable businesses ${median}${unit}`;
  });
  lines.push(str(benchmark.basis) ?? "");
  return lines.filter(Boolean);
}
