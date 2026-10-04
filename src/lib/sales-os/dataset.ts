import "server-only";

import type { Dataset } from "@/lib/sales-os/analysis";
import {
  loadCalls,
  loadDisqualifications,
  loadLeads,
  loadObjections,
  loadRevenue,
  loadSpend,
  loadStatusChanges,
  loadTargets,
  loadTouches,
  ROW_CAP,
  windowDays,
  type SalesDb,
  type Window,
} from "@/lib/sales-os/data";

export type Reader = {
  db: SalesDb;
  orgId: string;
  /** Owner/admin. Decides whether revenue and spend are asked for at all. */
  canSeeMoney: boolean;
};

export const MAX_ANALYSIS_DAYS = 365;

export function clampDays(days: unknown, fallback: number): number {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.round(days) : fallback;
  return Math.min(Math.max(n, 7), MAX_ANALYSIS_DAYS);
}

/**
 * Everything one analysis needs, read as the signed-in person. Calls, status
 * changes, and touches are read from the start of the window to now, so a
 * lead that arrived early in the window still has its later calls.
 */
export async function loadDataset(
  reader: Reader,
  window: Window,
  options: { touches?: boolean } = {}
): Promise<Dataset> {
  const now = new Date().toISOString();
  const through: Window = { from: window.from, to: now };
  const [leads, calls, objections, statusChanges, touches, disqualifications, revenue, spend, targets] =
    await Promise.all([
      loadLeads(reader.db, reader.orgId, window),
      loadCalls(reader.db, reader.orgId, through),
      loadObjections(reader.db, reader.orgId, window),
      loadStatusChanges(reader.db, reader.orgId, through),
      options.touches === false
        ? Promise.resolve({ rows: [], capped: false })
        : loadTouches(reader.db, reader.orgId, through),
      loadDisqualifications(reader.db, reader.orgId, window),
      loadRevenue(reader.db, reader.orgId, window, reader.canSeeMoney),
      loadSpend(reader.db, reader.orgId, window, reader.canSeeMoney),
      loadTargets(reader.db, reader.orgId),
    ]);
  const capped: string[] = [];
  if (leads.capped) capped.push(`${ROW_CAP.toLocaleString("en-US")} leads`);
  if (calls.capped) capped.push(`${ROW_CAP.toLocaleString("en-US")} calls`);
  if (touches.capped) capped.push(`${ROW_CAP.toLocaleString("en-US")} touches`);
  return {
    window,
    now,
    leads: leads.rows,
    calls: calls.rows,
    objections: objections.rows,
    statusChanges: statusChanges.rows,
    touches: touches.rows,
    disqualifications: disqualifications.rows,
    revenue: revenue.visible ? { visible: true, rows: revenue.rows } : { visible: false },
    spend: spend.visible ? { visible: true, rows: spend.rows } : { visible: false },
    targets,
    capped,
  };
}

export function lastDays(days: number): Window {
  return windowDays(days);
}
