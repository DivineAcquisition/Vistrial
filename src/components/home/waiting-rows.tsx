import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export type QuestionRowView = {
  status: "waiting" | "needsInput";
  question: string;
  projectId: string;
  projectTitle: string;
};

/** A run stopped to ask instead of guessing. Nothing runs or spends until a person answers. */
export function QuestionRow({ row }: { row: QuestionRowView }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={row.status === "needsInput" ? "Needs Input — Timed Out" : "Waiting for User"}
            tone={row.status === "needsInput" ? "critical" : "warning"}
            className="[&_span]:normal-case"
          />
          <span className="text-xs text-muted-foreground">{row.projectTitle}</span>
        </div>
        <p className="font-medium break-words text-card-foreground">{row.question}</p>
      </div>
      <Button size="sm" render={<Link href={`/app/agents/growth-architect/sessions/${row.projectId}`} />}>
        {row.status === "needsInput" ? "Resume" : "Answer"}
      </Button>
    </div>
  );
}

export type CheckInRowView = { checkInAt: number; proposedAction: string; projectId: string };

/** A decision whose check-in date has come: say what happened, and the next research builds on it. */
export function CheckInRow({ row }: { row: CheckInRowView }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <span className="text-xs text-muted-foreground">Due {new Date(row.checkInAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        <p className="font-medium break-words text-card-foreground">{row.proposedAction}</p>
      </div>
      <Button size="sm" render={<Link href={`/app/agents/growth-architect/sessions/${row.projectId}`} />}>
        Say what happened
      </Button>
    </div>
  );
}
