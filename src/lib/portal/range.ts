import type { ReportingRange } from "@/lib/reporting/range";

export function previousEqualRange(
  range: ReportingRange,
  activatedAt: string | null
): ReportingRange | null {
  const durationMs = Date.parse(range.to) - Date.parse(range.from);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const prevTo = range.from;
  let prevFromMs = Date.parse(range.from) - durationMs;
  if (activatedAt) {
    const floor = Date.parse(activatedAt);
    if (Number.isFinite(floor) && prevFromMs < floor) prevFromMs = floor;
  }
  if (prevFromMs >= Date.parse(prevTo)) return null;
  const from = new Date(prevFromMs).toISOString();
  return {
    key: "custom",
    from,
    to: prevTo,
    fromDate: from.slice(0, 10),
    toDate: prevTo.slice(0, 10),
  };
}
