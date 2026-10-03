/**
 * When the cached context package is stale enough to rebuild. Pure, so the
 * rule is tested rather than trusted.
 */

export type ContextFingerprint = {
  leads: number;
  calls: number;
  objections: number;
  closes: number;
  statusChanges: number;
  touches: number;
  revenue: number | null;
};

/** Reuse a package this young without even reading the fingerprint. */
export const CONTEXT_FRESH_MS = 10 * 60_000;
/** Rebuild at least this often, because "last 30 days" moves with the calendar. */
export const CONTEXT_MAX_AGE_MS = 12 * 60 * 60_000;

export type RefreshDecision = { refresh: boolean; reason: string };

export function contextNeedsRefresh(
  previous: ContextFingerprint | null,
  next: ContextFingerprint,
  ageMs: number
): RefreshDecision {
  if (!previous) return { refresh: true, reason: "no package yet" };
  if (ageMs >= CONTEXT_MAX_AGE_MS) return { refresh: true, reason: "package is older than 12 hours" };
  if (next.closes !== previous.closes) return { refresh: true, reason: "a deal closed or was lost" };
  if ((next.revenue ?? 0) !== (previous.revenue ?? 0)) return { refresh: true, reason: "revenue was recorded" };
  if (Math.abs(next.calls - previous.calls) >= 3) return { refresh: true, reason: "new calls" };
  if (Math.abs(next.objections - previous.objections) >= 3) return { refresh: true, reason: "new objections" };
  const leadStep = Math.max(5, Math.ceil(previous.leads * 0.05));
  if (Math.abs(next.leads - previous.leads) >= leadStep) return { refresh: true, reason: "new leads" };
  const touchStep = Math.max(25, Math.ceil(previous.touches * 0.1));
  if (Math.abs(next.touches - previous.touches) >= touchStep) return { refresh: true, reason: "new activity" };
  if (Math.abs(next.statusChanges - previous.statusChanges) >= 10) return { refresh: true, reason: "leads moved stage" };
  return { refresh: false, reason: "nothing meaningful changed" };
}

export function parseFingerprint(value: unknown): ContextFingerprint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const num = (key: string) => (typeof rec[key] === "number" ? (rec[key] as number) : null);
  const leads = num("leads");
  const calls = num("calls");
  const objections = num("objections");
  const closes = num("closes");
  const statusChanges = num("statusChanges");
  const touches = num("touches");
  if ([leads, calls, objections, closes, statusChanges, touches].some((v) => v === null)) return null;
  return {
    leads: leads!,
    calls: calls!,
    objections: objections!,
    closes: closes!,
    statusChanges: statusChanges!,
    touches: touches!,
    revenue: num("revenue"),
  };
}
