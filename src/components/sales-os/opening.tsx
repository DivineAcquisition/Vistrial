"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowRightIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { OpeningState } from "@/lib/sales-os/context-types";
import { captionText, cardTitle } from "@/lib/ui";

function builtLabel(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * What a fresh conversation opens on: Vistrial's current read of the
 * business, built from the context package before anyone types.
 */
export function Opening({ state }: { state: OpeningState }) {
  return (
    <div className="mb-8 space-y-5 px-2">
      <div className="space-y-2">
        <p className="font-heading text-2xl tracking-tight text-card-foreground">Hi {state.greetingName}.</p>
        {state.lines.map((line, index) => (
          <p key={index} className="text-base leading-relaxed text-card-foreground">
            {line}
          </p>
        ))}
      </div>

      {state.leaks.length ? (
        <ul className="grid gap-3">
          {state.leaks.map((leak) => (
            <li key={leak.title}>
              <Card className="gap-2 p-4">
                <h3 className={cardTitle}>{leak.title}</h3>
                <p className="text-sm leading-relaxed text-card-foreground">{leak.evidence}</p>
                <p className={captionText}>Sample: {leak.sample}</p>
                <ThreadPrimitive.Suggestion
                  prompt={leak.ask}
                  send
                  className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-300 underline-offset-4 hover:underline"
                >
                  {leak.ask}
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                </ThreadPrimitive.Suggestion>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {state.thinReasons.length ? (
        <Card className="gap-2 bg-muted/40 p-4">
          <h3 className={cardTitle}>Where the data is thin</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-card-foreground">
            {state.thinReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {state.suggestions
          .filter((s) => !state.leaks.some((leak) => leak.ask === s.prompt))
          .map((suggestion) => (
            <ThreadPrimitive.Suggestion
              key={suggestion.prompt}
              prompt={suggestion.prompt}
              send
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:border-brand-500/50 hover:bg-brand-500/5"
            >
              {suggestion.prompt}
            </ThreadPrimitive.Suggestion>
          ))}
      </div>
      <p className={captionText}>From your data as of {builtLabel(state.builtAt)}.</p>
    </div>
  );
}
