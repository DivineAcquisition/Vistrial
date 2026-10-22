"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";

import { dismissWelcomeAction } from "@/app/(workspace)/app/home/workspace-actions";
import { AgentGlyph } from "@/components/live/agent-identity";
import { Button } from "@/components/ui/button";
import { OnboardCard } from "@/components/ui/onboard-card";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { WELCOME_COPY } from "@/lib/workspace/voice";

export type FirstMove = { key: string; label: string; href: string; done: boolean };

/** First sign-in. One screen, skippable, with only real lines and real moves. */
export function WelcomePanel({
  businessName,
  lines,
  moves,
}: {
  businessName: string;
  lines: Array<{ agentId: LiveAgentId; text: string }>;
  moves: FirstMove[];
}) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    start(async () => {
      await dismissWelcomeAction();
    });
  }

  return (
    <section aria-labelledby="ws-welcome" className="flex flex-col gap-4 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="ws-welcome" className="font-heading text-xl text-card-foreground">
              {WELCOME_COPY.title(businessName)}
            </h2>
            <Button size="sm" variant="ghost" onClick={dismiss} disabled={pending}>
              {WELCOME_COPY.skip}
            </Button>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{WELCOME_COPY.intro}</p>
        </div>
        <OnboardCard className="shrink-0" step1="Workspace ready" step2="Agents checking in" step3="First drafts waiting" />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-card-foreground">{WELCOME_COPY.meet}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {lines.map((line) => (
            <li key={line.agentId} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
              <AgentGlyph agentId={line.agentId} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-card-foreground">
                  {AGENTS[line.agentId].name} <span className="font-normal text-muted-foreground">· {AGENTS[line.agentId].sublabel}</span>
                </p>
                <p className="text-sm text-card-foreground">{line.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {moves.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-card-foreground">{WELCOME_COPY.moves}</h3>
          <ul className="flex flex-col gap-1">
            {moves.map((move) => (
              <li key={move.key}>
                <Link href={move.href} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                  {move.done ? <CheckCircle2Icon aria-hidden className="size-4 text-success" /> : <CircleIcon aria-hidden className="size-4 text-muted-foreground" />}
                  <span className={move.done ? "text-muted-foreground line-through" : "text-card-foreground"}>{move.label}</span>
                  <span className="sr-only">{move.done ? "Done" : "Not done yet"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button className="self-start" onClick={dismiss} disabled={pending}>
        {WELCOME_COPY.go}
      </Button>
    </section>
  );
}
