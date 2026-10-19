"use client";

import { CompassIcon, PinIcon, PinOffIcon } from "lucide-react";

import { AGENTS } from "@/lib/agents/roster";
import { useState } from "react";

import { unpinAction } from "@/app/(workspace)/app/compass/actions";
import { useCompassChat } from "@/components/compass/chat";
import { Button } from "@/components/ui/button";
import type { Starter } from "@/lib/compass/starters";
import { captionText } from "@/lib/ui";

export type PinnedQuestion = { id: string; question: string };

/** The empty state: what Compass is, what it can't do, and questions to start from. */
export function CompassWelcome({
  starters,
  pins,
  staffNote,
  compact = false,
}: {
  starters: Starter[];
  pins: PinnedQuestion[];
  staffNote?: string | null;
  compact?: boolean;
}) {
  const { ask } = useCompassChat();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const pinByQuestion = new Map(pins.map((pin) => [pin.question.toLowerCase(), pin.id]));
  const shown = starters.filter((item) => !(item.pinned && removed.has(item.question.toLowerCase())));

  return (
    <div className="mb-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CompassIcon className="size-5 text-brand-300" aria-hidden />
          <h1 className="font-heading text-xl text-card-foreground">{AGENTS.compass.name}, {AGENTS.compass.sublabel}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Ask about your leads, calls, follow-ups and numbers. Compass answers from this workspace&apos;s own records and shows where each answer came from.
        </p>
      </div>
      {compact ? null : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="font-medium text-card-foreground">It can</dt>
            <dd className="text-muted-foreground">Find leads, read a case file, explain a number, check response times, and suggest a next step for you to confirm.</dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="font-medium text-card-foreground">It can&apos;t</dt>
            <dd className="text-muted-foreground">Send messages, change leads or settings, or answer when the records don&apos;t say.</dd>
          </div>
        </dl>
      )}
      <p className={captionText}>Your conversations with Compass are private to you.</p>
      {staffNote ? <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{staffNote}</p> : null}
      {shown.length ? (
        <div className="flex flex-col gap-2">
          <p className={captionText}>Try asking</p>
          <ul className="flex flex-col gap-1.5">
            {shown.map((item) => {
              const pinId = item.pinned ? pinByQuestion.get(item.question.toLowerCase()) : undefined;
              return (
                <li key={item.question} className="flex items-stretch gap-1">
                  <Button variant="outline" className="h-auto min-h-10 flex-1 justify-start py-2 text-start whitespace-normal" onClick={() => ask(item.question)}>
                    {item.pinned ? <PinIcon className="size-3.5 text-brand-300" aria-label="Pinned" /> : null}
                    {item.question}
                  </Button>
                  {pinId ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Unpin "${item.question}"`}
                      onClick={async () => {
                        setRemoved((prev) => new Set(prev).add(item.question.toLowerCase()));
                        await unpinAction(pinId);
                      }}
                    >
                      <PinOffIcon />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
