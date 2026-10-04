"use client";

import { useAuiState, type AssistantState } from "@assistant-ui/react";
import Link from "next/link";

import { Sheet, SheetPopup, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TOOL_LABELS, isSalesOsTool } from "@/lib/sales-os/catalog";
import type { OpeningState } from "@/lib/sales-os/context-types";
import type { PendingApproval } from "@/lib/sales-os/executions/types";
import type { ToolCallRecord } from "@/lib/sales-os/persist";
import { captionText, cardTitle } from "@/lib/ui";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function currentWork(state: AssistantState): string {
  if (!state.thread.isRunning) return "Nothing in progress.";
  const messages = state.thread.messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (part.type !== "tool-call" || part.result !== undefined || part.isError) continue;
      if (isSalesOsTool(part.toolName)) return `${TOOL_LABELS[part.toolName].running}.`;
      return "Answering you now.";
    }
  }
  return "Answering you now.";
}

/** What Vistrial knows, what it is doing, and what is waiting. An overlay, not a zone. */
export function AgentStatePanel({
  opening,
  pending,
  recent,
}: {
  opening: OpeningState;
  pending: PendingApproval[];
  recent: ToolCallRecord[];
}) {
  const working = useAuiState(currentWork);
  return (
    <Sheet>
      <SheetTrigger
        nativeButton
        className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-card-foreground"
      >
        What Vistrial knows
      </SheetTrigger>
      <SheetPopup side="left" className="w-[min(100%,22rem)]">
        <div className="space-y-5 overflow-x-hidden overflow-y-auto p-5 pt-12">
          <SheetTitle className="text-base">What Vistrial knows</SheetTitle>
          <section className="space-y-2">
            <h2 className={cardTitle}>About this client</h2>
            {opening.lines.map((line) => (
              <p key={line} className="text-sm leading-relaxed text-card-foreground">
                {line}
              </p>
            ))}
            {opening.thinReasons.map((reason) => (
              <p key={reason} className={captionText}>
                {reason}
              </p>
            ))}
          </section>
          <section className="space-y-1">
            <h2 className={cardTitle}>Working on</h2>
            <p className="text-sm text-card-foreground">{working}</p>
          </section>
          <section className="space-y-1">
            <h2 className={cardTitle}>Waiting for an OK</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
            ) : (
              pending.map((item) => (
                <Link key={item.id} href={`/app/ask?c=${item.conversationId}`} className="block text-sm text-card-foreground underline-offset-4 hover:underline">
                  {item.plainSummary}
                </Link>
              ))
            )}
          </section>
          <section className="space-y-1">
            <h2 className={cardTitle}>Recently</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              recent.map((item) => (
                <p key={item.id} className="text-sm text-card-foreground">
                  {item.label}
                  <span className={captionText}> {when(item.startedAt)}</span>
                </p>
              ))
            )}
          </section>
        </div>
      </SheetPopup>
    </Sheet>
  );
}
