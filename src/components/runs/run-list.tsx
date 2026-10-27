import Link from "next/link";

import { RunStatusBadge } from "@/components/runs/run-parts";
import { STOP_REASON_WORDS, centsInWords, formatCents, type RunStatus, type StopReason } from "@/lib/runs/view";

export type RunListItem = {
  id: string;
  skillName: string;
  agentName: string;
  status: RunStatus;
  stopReason: StopReason | null;
  costCents: number;
  startedAt: number;
  startedByMe: boolean;
};

/** One row per run. Every row is a link, status always has a word next to its colour. */
export function RunList({ runs }: { runs: RunListItem[] }) {
  return (
    <ul className="grid divide-y divide-border">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/app/runs/${run.id}`}
            className="grid gap-1 rounded-md px-2 py-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-card-foreground">{run.skillName}</span>
              <span className="block text-xs text-muted-foreground">
                {run.agentName}, started{" "}
                {new Date(run.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {run.startedByMe ? " by you" : ""}
                {run.stopReason && run.stopReason !== "done" ? `. ${STOP_REASON_WORDS[run.stopReason]}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <RunStatusBadge status={run.status} />
              <span className="text-sm text-muted-foreground tabular-nums">
                <span aria-hidden="true">{formatCents(run.costCents)}</span>
                <span className="sr-only">{centsInWords(run.costCents)}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
