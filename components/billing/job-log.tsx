import { Panel } from "@/components/ui/panel";
import { TonePill, type Tone } from "@/components/ui/tone";
import type { JobRunRecord } from "@/lib/db/billing";
import { formatDateTime } from "@/lib/format";

const ACTION_TONES: Record<string, Tone> = {
  assembled: "brand",
  notified: "brand",
  processed: "good",
  failed: "critical",
  retried: "warning",
  skipped: "neutral",
};

/**
 * A cycle that silently did not run is a week of revenue that quietly did not
 * happen, so a run that did nothing still shows, and says what it skipped.
 */
export function JobLog({ runs }: { runs: JobRunRecord[] }) {
  if (runs.length === 0) {
    return (
      <Panel className="px-5 py-6 text-center">
        <p className="text-sm text-silver">
          The cycle job has never run. Point a daily scheduler at{" "}
          <span className="font-mono text-xs">POST /api/jobs/cycle</span> with the
          shared secret, or run it by hand above.
        </p>
      </Panel>
    );
  }

  return (
    <ol className="space-y-3">
      {runs.map((run) => (
        <li key={run.id}>
          <Panel className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <TonePill tone={run.error === null ? "neutral" : "critical"}>
                {run.trigger === "manual" ? "By hand" : "Scheduled"}
              </TonePill>
              <span className="text-sm text-silver tabular-nums">
                {formatDateTime(run.started_at)}
              </span>
              <span className="ml-auto text-xs text-dim tabular-nums">
                {run.assembled} assembled · {run.notified} notified · {run.processed}{" "}
                processed · {run.failed} failed · {run.skipped} skipped
              </span>
            </div>

            {run.error ? (
              <p className="mt-2 text-sm text-flag-critical">{run.error}</p>
            ) : null}

            {run.entries && run.entries.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {run.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-2">
                    <TonePill tone={ACTION_TONES[entry.action] ?? "neutral"}>
                      {entry.action}
                    </TonePill>
                    <span className="min-w-0 flex-1 text-sm text-silver">
                      {entry.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-dim">
                Nothing was due. No cycle had closed and no charge was waiting.
              </p>
            )}
          </Panel>
        </li>
      ))}
    </ol>
  );
}
