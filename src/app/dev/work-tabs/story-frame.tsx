"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

import { AgentHeader } from "@/components/agents/agent-frame";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS } from "../journey-sidebar/fixtures";
import { StoryTheme } from "../story-theme";

/**
 * The agent's page as the app frames it, with no live data. Work tabs name themselves, so only the agent's
 * home passes `header`.
 */
export function StoryFrame({ theme, role = "owner", header = false, children }: { tab?: string; theme: string; role?: "owner" | "viewer"; header?: boolean; children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient("https://story-fixture-123.convex.cloud"), []);
  const shell: WorkspaceShell = { workspaceId: "ws1" as Id<"workspaces">, role, setupDone: true, agents: STORY_AGENTS };
  return (
    <ConvexProvider client={client}>
      <ShellProvider value={shell}>
        <StoryTheme theme={theme} />
        <main className="min-h-dvh bg-background px-4 py-6 sm:px-8">
          <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-5">
            {header ? <AgentHeader slug="growth-architect" department="Growth and Marketing" name="Strategist" job="Researches your market and hands back reports and strategies, each claim with its source." stateLabel="On" on /> : null}
            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </ShellProvider>
    </ConvexProvider>
  );
}
