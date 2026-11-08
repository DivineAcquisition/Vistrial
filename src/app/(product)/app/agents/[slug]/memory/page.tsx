"use client";

import { useMutation, useQuery } from "convex/react";
import { Brain, Trash2 } from "lucide-react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { FACT_SOURCE_WORDS, FACT_STATUS_WORDS, errorWords, shortDate } from "@/lib/research/words";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

function words(key: string) {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Business memory: what Vistrial knows about the business, each fact with its source, date and status. */
export default function AgentMemory() {
  const shell = useWorkspaceShell();
  const facts = useQuery(api.facts.list, shell ? { workspaceId: shell.workspaceId } : "skip");
  const remove = useMutation(api.facts.remove);
  const [notice, setNotice] = useState("");
  if (!shell) return null;
  const canEdit = shell.role !== "rep";
  return (
    <div className="grid gap-4">
      <Panel className="flex items-start gap-3 p-4">
        <Brain aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          Shared across this workspace&apos;s agents. A fact an agent found is never treated as verified until a person confirms it. Remove anything that is wrong; the history is kept.
        </p>
      </Panel>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {facts === undefined ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : facts.length === 0 ? (
        <Panel className="p-5">
          <p className="text-sm text-muted-foreground">Nothing yet. Facts appear as you answer questions in sessions and confirm your profile.</p>
        </Panel>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {facts.map((fact) => {
            const status = FACT_STATUS_WORDS[fact.status] ?? { label: fact.status, tone: "neutral" as const };
            return (
              <li key={fact.id} className="grid content-start gap-1.5 rounded-xl border border-border bg-card p-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{words(fact.factKey)}</span>
                  <StatusBadge label={status.label} tone={status.tone} className="[&_span]:normal-case" />
                </span>
                <span className="break-words text-card-foreground">{fact.value}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {FACT_SOURCE_WORDS[fact.sourceType] ?? fact.sourceType}, {shortDate(fact.recordedAt)}
                  </span>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void remove({ workspaceId: shell.workspaceId, factId: fact.id as Id<"businessFacts"> }).then(
                          () => setNotice("Removed. It no longer feeds any agent."),
                          (problem: unknown) => setNotice(errorWords(problem, "It was not removed.")),
                        )
                      }
                    >
                      <Trash2 aria-hidden className="size-3.5" /> Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
