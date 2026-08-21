import type { ReportingRangeKey } from "@/lib/reporting/constants";

export type ReportingRange = {
  key: ReportingRangeKey;
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
};

function asSingle(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function startOfUtcDay(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`;
}

function endOfUtcDayExclusive(isoDate: string): string {
  const next = new Date(`${isoDate}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function isoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseReportingRange(
  params: Record<string, string | string[] | undefined>,
  activatedAt: string | null
): ReportingRange {
  const now = new Date();
  const toDefault = now.toISOString();
  const fromDefault = activatedAt ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const preset = asSingle(params.range);
  const key: ReportingRangeKey =
    preset === "last_30d" || preset === "last_90d" || preset === "custom" || preset === "since_activation"
      ? preset
      : "since_activation";

  if (key === "last_30d") {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const clamped = activatedAt && from < activatedAt ? activatedAt : from;
    return {
      key,
      from: clamped,
      to: toDefault,
      fromDate: isoDateUtc(new Date(clamped)),
      toDate: isoDateUtc(now),
    };
  }
  if (key === "last_90d") {
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const clamped = activatedAt && from < activatedAt ? activatedAt : from;
    return {
      key,
      from: clamped,
      to: toDefault,
      fromDate: isoDateUtc(new Date(clamped)),
      toDate: isoDateUtc(now),
    };
  }
  if (key === "custom") {
    const fromDate = asSingle(params.from);
    const toDate = asSingle(params.to);
    if (fromDate && toDate && isIsoDate(fromDate) && isIsoDate(toDate) && fromDate <= toDate) {
      let from = startOfUtcDay(fromDate);
      const to = endOfUtcDayExclusive(toDate);
      if (activatedAt && from < activatedAt) from = activatedAt;
      return { key, from, to, fromDate, toDate };
    }
  }

  return {
    key: "since_activation",
    from: fromDefault,
    to: toDefault,
    fromDate: isoDateUtc(new Date(fromDefault)),
    toDate: isoDateUtc(now),
  };
}

export function reportingRangeQuery(range: ReportingRange): string {
  const params = new URLSearchParams();
  params.set("range", range.key);
  if (range.key === "custom") {
    params.set("from", range.fromDate);
    params.set("to", range.toDate);
  }
  return params.toString();
}
