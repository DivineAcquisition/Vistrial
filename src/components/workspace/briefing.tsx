"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { markBriefingSeenAction } from "@/app/(workspace)/app/home/workspace-actions";
import { AgentGlyph } from "@/components/live/agent-identity";
import { useLiveMeta } from "@/components/live/live-provider";
import { Button } from "@/components/ui/button";
import { BRIEFING_COPY, type Briefing } from "@/lib/workspace/voice";

/**
 * While you were away. Expanded the first time the person opens the app
 * each day, then one line for the rest of the day.
 */
export function BriefingSection({
  briefing,
  firstViewToday,
  history,
}: {
  briefing: Briefing;
  firstViewToday: boolean;
  history: Array<{ day: string; briefing: Briefing }>;
}) {
  const [open, setOpen] = useState(firstViewToday && !briefing.quiet);
  const { offline } = useLiveMeta();

  useEffect(() => {
    if (firstViewToday && !offline) void markBriefingSeenAction();
  }, [firstViewToday, offline]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <p className="text-sm font-medium text-card-foreground">{briefing.headline}</p>
      {open && briefing.lines.length ? (
        <ul className="flex flex-col gap-2">
          {briefing.lines.map((line) => (
            <li key={line.agentId} className="flex items-start gap-2">
              <AgentGlyph agentId={line.agentId} size="sm" />
              <Link href={line.href} className="min-w-0 flex-1 text-sm text-card-foreground hover:underline">
                {line.text}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {briefing.lines.length ? (
          <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? BRIEFING_COPY.hide : BRIEFING_COPY.show}
          </Button>
        ) : null}
        {history.length ? (
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-card-foreground sm:min-h-7">
              {BRIEFING_COPY.history}
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {history.map((entry) => (
                <div key={entry.day} className="border-l border-border ps-3">
                  <p className="text-xs font-medium text-muted-foreground">{BRIEFING_COPY.dayLabel(entry.day)}</p>
                  <p className="text-sm text-card-foreground">{entry.briefing.headline}</p>
                  {entry.briefing.lines.map((line) => (
                    <p key={line.agentId} className="text-sm text-muted-foreground">
                      {line.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
