import { LIMITS } from "@/lib/workflows/types";

export type CountRow = {
  boxId: string;
  status: "active" | "paused" | "needs_attention" | "finished";
  edgeLabel: string | null;
  ageHours: number;
  expectedHours: number | null;
  endReason: string | null;
};

export type BoxCount = {
  now: number;
  passed: number;
  share: number | null;
  shareLabel: string;
  averageHours: number | null;
  stalled: boolean;
};

export function nowMs(): number {
  return Date.now();
}

export function countBoxes(rows: CountRow[], min = LIMITS.minSample): Map<string, BoxCount> {
  const grouped = new Map<string, CountRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.boxId) ?? [];
    list.push(row);
    grouped.set(row.boxId, list);
  }
  const out = new Map<string, BoxCount>();
  for (const [boxId, list] of grouped) {
    const now = list.filter((row) => row.status === "active" || row.status === "paused" || row.status === "needs_attention").length;
    const left = list.filter((row) => row.edgeLabel);
    const passed = left.length;
    const stalled = list.some((row) => row.status === "needs_attention" || (row.expectedHours !== null && row.status === "active" && row.ageHours > row.expectedHours * 2));
    const ages = list.map((row) => row.ageHours).filter((hours) => Number.isFinite(hours));
    const averageHours = ages.length ? Math.round(ages.reduce((sum, hours) => sum + hours, 0) / ages.length) : null;
    out.set(boxId, {
      now,
      passed,
      share: null,
      shareLabel: passed >= min ? "" : "Not enough data yet",
      averageHours,
      stalled,
    });
  }
  return out;
}

export function exitShare(rows: CountRow[], boxId: string, label: string, min = LIMITS.minSample): { share: number | null; label: string; sample: number } {
  const left = rows.filter((row) => row.boxId === boxId && row.edgeLabel);
  const sample = left.length;
  if (sample < min) return { share: null, label: "Not enough data yet", sample };
  const taken = left.filter((row) => row.edgeLabel === label).length;
  return { share: Math.round((taken / sample) * 1000) / 10, label: `${Math.round((taken / sample) * 1000) / 10} percent`, sample };
}

export function dropOffSentence(rows: CountRow[], boxTitle: string, label: string, min = LIMITS.minSample): string | null {
  const share = exitShare(rows, rows.find((row) => row.edgeLabel === label)?.boxId ?? "", label, min);
  if (share.share === null) return null;
  return `${share.label} of leads who reached ${boxTitle} took ${label}. Based on ${share.sample} leads.`;
}

export function resultTotals(rows: CountRow[], min = LIMITS.minSample): { finished: number; byReason: Record<string, number | null> } {
  const finished = rows.filter((row) => row.status === "finished");
  const byReason: Record<string, number | null> = {};
  const reasons = new Set(finished.map((row) => row.endReason).filter((reason): reason is string => Boolean(reason)));
  for (const reason of reasons) {
    const count = finished.filter((row) => row.endReason === reason).length;
    byReason[reason] = finished.length >= min ? count : null;
  }
  return { finished: finished.length, byReason };
}
