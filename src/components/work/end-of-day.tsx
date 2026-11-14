"use client";

import type { FunctionReturnType } from "convex/server";

import { ClipboardList, Users } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import type { api } from "../../../convex/_generated/api";

import { SectionTitle } from "./work-shell";

export type EndOfDayData = FunctionReturnType<typeof api.endOfDay.today>;
type Report = Extract<EndOfDayData, { appointments: true }>;

function Count({ label, value }: { label: string; value: number }) {
  return (
    <li className="grid gap-0.5 rounded-lg border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-lg text-foreground">{value}</span>
    </li>
  );
}

/** Today so far, as this person's home shows it: calls by outcome, what was done, what is still open, tomorrow. */
export function EndOfDayPanel({ report }: { report: Report }) {
  const { figures, done } = report;
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-end-of-day>
      <SectionTitle icon={ClipboardList}>Today so far · {report.day}</SectionTitle>
      <p className="text-sm text-muted-foreground">{report.headline}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Today's calls">
        <Count label="Held" value={figures.held} />
        <Count label="No-shows" value={figures.noShow} />
        <Count label="Not marked" value={figures.notMarked} />
        <Count label="Later today" value={figures.later} />
      </ul>
      <p className="text-xs text-muted-foreground">
        Done today: {done.briefs} brief{done.briefs === 1 ? "" : "s"}, notes on {done.notes} call{done.notes === 1 ? "" : "s"}, {done.reviews} review{done.reviews === 1 ? "" : "s"}, {done.sent}{" "}
        message{done.sent === 1 ? "" : "s"} sent.
      </p>
      {report.open.length ? (
        <div className="grid gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Still open</h3>
          <ul className="grid gap-1.5">
            {report.open.map((line) => (
              <li key={line} className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing is left open from today.</p>
      )}
      {report.reps?.length ? (
        <div className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Users aria-hidden className="size-3.5" />
            By rep
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Rep</th>
                  <th className="py-1 pr-3 font-medium">Held</th>
                  <th className="py-1 pr-3 font-medium">No-shows</th>
                  <th className="py-1 pr-3 font-medium">Not marked</th>
                  <th className="py-1 font-medium">With notes</th>
                </tr>
              </thead>
              <tbody>
                {report.reps.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                    <td className="py-1.5 pr-3">{row.held}</td>
                    <td className="py-1.5 pr-3">{row.noShow}</td>
                    <td className="py-1.5 pr-3">{row.notMarked}</td>
                    <td className="py-1.5">{row.noted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Counts from your CRM and the notes added here. Not a measure of anyone.</p>
        </div>
      ) : null}
    </Panel>
  );
}
