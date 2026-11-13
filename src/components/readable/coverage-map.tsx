import { coverageCounts, JOB_STATUS_WORDS, type CoverageCell, type JobStatus } from "@/lib/readable/teardown";
import { cn } from "@/lib/utils";

import { JOB_TONE, JobChip, StatusIcon } from "./status-chip";

export type CoverageLook = "grid" | "list" | "track";

const CELL: Record<JobStatus, string> = {
  does: "border-success/30 bg-success/5",
  partly: "border-warning/40 bg-warning/5",
  doesNot: "border-destructive/30 bg-destructive/5",
  skipped: "border-dashed border-muted-foreground/50",
  leftOut: "border-border opacity-80",
};

const place = (cell: CoverageCell) => (cell.position === null ? "not on the page" : `${ordinal(cell.position)} on the page${cell.late ? ", later than the framework places it" : ""}`);
function ordinal(value: number) {
  const tail = value % 100;
  const suffix = tail >= 11 && tail <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return `${value}${suffix}`;
}

function Position({ cell }: { cell: CoverageCell }) {
  return (
    <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", cell.position === null ? "border border-dashed border-muted-foreground/50 text-muted-foreground" : "bg-primary/10 text-primary")}>
      {cell.position ?? "–"}
    </span>
  );
}

/** One line under the map saying what it is made of, and the counts in words. */
export function CoverageSummary({ cells, numbered = true }: { cells: readonly CoverageCell[]; numbered?: boolean }) {
  const counts = coverageCounts(cells);
  return (
    <p className="text-xs text-muted-foreground">
      {counts.present} of {counts.total} jobs have a section: {counts.does} {counts.does === 1 ? "does its job" : "do their job"}, {counts.partly} partly, {counts.doesNot} {counts.doesNot === 1 ? "does" : "do"} not. {counts.skipped} skipped{counts.leftOut ? `, ${counts.leftOut} left out (optional)` : ""}
      {counts.late ? `, ${counts.late} later than the framework places ${counts.late === 1 ? "it" : "them"}` : ""}.{numbered ? " The number on each is where it comes on the page." : ""} Which job a section does is a reading of the page, not a measurement.
    </p>
  );
}

/**
 * The coverage map: the framework's jobs in the framework's order, each with what this page does about it and
 * where it comes on the page. Three looks over the same cells; `grid` is the default.
 */
export function CoverageMap({ cells, look = "grid", sectionHref, className }: { cells: readonly CoverageCell[]; look?: CoverageLook; sectionHref?: (index: number) => string; className?: string }) {
  const link = (cell: CoverageCell) => (cell.sectionIndex !== null && sectionHref ? sectionHref(cell.sectionIndex) : null);
  const words = (cell: CoverageCell) => `${cell.name}: ${JOB_STATUS_WORDS[cell.status]}, ${place(cell)}`;

  if (look === "track") {
    return (
      <div className={cn("grid gap-2", className)}>
        <ol className="flex flex-wrap gap-1" aria-label="The framework's jobs on this page">
          {cells.map((cell) => {
            const href = link(cell);
            const body = (
              <>
                <StatusIcon tone={JOB_TONE[cell.status]} label={words(cell)} />
                <span aria-hidden className="max-w-full truncate text-[10px] leading-none text-muted-foreground">{cell.name}</span>
              </>
            );
            const look = cn("flex h-11 w-[4.6rem] flex-col items-center justify-center gap-1 rounded-lg border px-1", CELL[cell.status]);
            return (
              <li key={cell.key} title={`${words(cell)}. Answers "${cell.objection}"`}>
                {href ? (
                  <a href={href} className={cn(look, "outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring")}>
                    {body}
                  </a>
                ) : (
                  <span className={look}>{body}</span>
                )}
              </li>
            );
          })}
        </ol>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="What the marks mean">
          {(Object.keys(JOB_STATUS_WORDS) as JobStatus[]).filter((status) => cells.some((cell) => cell.status === status)).map((status) => (
            <li key={status} className="inline-flex items-center gap-1">
              <StatusIcon tone={JOB_TONE[status]} label="" /> {JOB_STATUS_WORDS[status]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (look === "list") {
    return (
      <ol className={cn("grid gap-x-6 sm:grid-cols-2", className)} aria-label="The framework's jobs on this page">
        {cells.map((cell) => {
          const href = link(cell);
          return (
            <li key={cell.key} className="flex min-w-0 items-center gap-2 border-b border-border py-1.5 text-sm">
              <Position cell={cell} />
              <span className="sr-only">{place(cell)}: </span>
              {href ? (
                <a href={href} className="min-w-0 truncate text-card-foreground underline-offset-2 hover:underline">
                  {cell.name}
                </a>
              ) : (
                <span className="min-w-0 truncate text-card-foreground">{cell.name}</span>
              )}
              {cell.late ? <span className="shrink-0 text-xs text-muted-foreground">later than the framework</span> : null}
              <JobChip status={cell.status} className="ml-auto" />
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn("grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6", className)} aria-label="The framework's jobs on this page">
      {cells.map((cell) => {
        const href = link(cell);
        const body = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <Position cell={cell} />
              <span className="sr-only">{place(cell)}: </span>
              <span className="min-w-0 truncate text-sm font-medium text-card-foreground">{cell.name}</span>
            </span>
            <span className={cn("flex items-center gap-1 text-xs", cell.status === "leftOut" || cell.status === "skipped" ? "text-muted-foreground" : "text-card-foreground")}>
              <StatusIcon tone={JOB_TONE[cell.status]} label="" />
              {JOB_STATUS_WORDS[cell.status]}
            </span>
            {cell.late ? <span className="text-[11px] text-muted-foreground">Later than the framework</span> : null}
          </>
        );
        const box = cn("grid h-full content-start gap-1 rounded-lg border px-2.5 py-2", CELL[cell.status]);
        return (
          <li key={cell.key} title={`Answers "${cell.objection}"`}>
            {href ? (
              <a href={href} className={cn(box, "outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring")}>
                {body}
              </a>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
