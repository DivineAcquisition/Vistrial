"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

import { AGENT_TABS } from "@/components/agents/agent-frame";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS } from "../journey-sidebar/fixtures";
import { StoryTheme } from "../story-theme";

/** The agent page's header and tabs as the app draws them, around one work tab, with no live data. */
export function StoryFrame({ tab, theme, role = "owner", children }: { tab: string; theme: string; role?: "owner" | "rep"; children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient("https://story-fixture-123.convex.cloud"), []);
  const shell: WorkspaceShell = { workspaceId: "ws1" as Id<"workspaces">, role, setupDone: true, agents: STORY_AGENTS };
  return (
    <ConvexProvider client={client}>
      <ShellProvider value={shell}>
        <StoryTheme theme={theme} />
        <main className="min-h-dvh bg-background px-4 py-6 sm:px-8">
          <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-5">
            <header className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <VistrialMark size="md" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Growth and Marketing</p>
                    <h1 className="font-heading text-xl text-foreground">Growth Architect</h1>
                    <p className="text-sm text-muted-foreground">Researches your market and hands back reports and strategies, each claim with its source.</p>
                  </div>
                </div>
                <StatusBadge label="On" tone="good" />
              </div>
              <nav aria-label="Growth Architect folder" className="-mx-1 overflow-x-auto">
                <ul className="flex min-w-max gap-1 border-b border-border px-1">
                  {AGENT_TABS.map((row) => (
                    <li key={row.key || "overview"}>
                      <span className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm", row.key === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
                        <row.icon aria-hidden className="size-4" />
                        {row.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </nav>
            </header>
            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </ShellProvider>
    </ConvexProvider>
  );
}
