export type MeasureRow = { metric: string; seconds: number | null; met: boolean | null };

export function summarizeMeasures(rows: MeasureRow[]) {
  const first = rows.filter((row) => row.metric === "time_to_first_touch" && typeof row.seconds === "number");
  const minutes = first.map((row) => (row.seconds as number) / 60).sort((a, b) => a - b);
  const judged = first.filter((row) => row.met != null);
  const gaps = rows.filter((row) => row.metric === "gap");
  const gapsJudged = gaps.filter((row) => row.met != null);
  const middle = Math.floor(minutes.length / 2);
  return {
    firstTouches: first.length,
    averageMinutes: minutes.length ? minutes.reduce((sum, value) => sum + value, 0) / minutes.length : null,
    medianMinutes: minutes.length ? (minutes.length % 2 ? minutes[middle] : (minutes[middle - 1] + minutes[middle]) / 2) : null,
    withinWindowPercent: judged.length ? (judged.filter((row) => row.met).length / judged.length) * 100 : null,
    gaps: gaps.length,
    gapsMetPercent: gapsJudged.length ? (gapsJudged.filter((row) => row.met).length / gapsJudged.length) * 100 : null,
  };
}

const STALE_MINUTES = 20;

/** What the status line says. A sweep that has gone quiet reads as stopped, never as fine. */
export function sentryStatus(args: { mode: string; lastSweepAt: string | null; lastError: string | null; now: number }): {
  state: "off" | "watching" | "paused" | "stopped";
  detail: string;
} {
  if (args.mode !== "practice" && args.mode !== "live") return { state: "off", detail: "Sentry is off." };
  if (args.lastError === "paused") return { state: "paused", detail: "Sentry is paused. Clocks are kept, and nothing new is checked until it resumes." };
  if (args.lastError === "workspace") return { state: "paused", detail: "Sentry is waiting for this workspace to be active." };
  if (args.lastError === "config") return { state: "stopped", detail: "Sentry stopped: the response settings are incomplete. The Vistrial team has been told." };
  if (args.lastError) return { state: "stopped", detail: "Sentry stopped after an error. The Vistrial team has been told." };
  if (!args.lastSweepAt) return { state: "watching", detail: "Sentry is starting its first check." };
  const age = Math.round((args.now - Date.parse(args.lastSweepAt)) / 60_000);
  if (age > STALE_MINUTES) return { state: "stopped", detail: `Sentry has not checked for ${age} minutes. The Vistrial team has been told.` };
  return { state: "watching", detail: age <= 1 ? "Checked in the last minute." : `Checked ${age} minutes ago.` };
}
