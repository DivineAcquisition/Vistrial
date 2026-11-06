"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, useState } from "react";

import { SessionThread } from "@/components/sessions/session-thread";
import { FolderTree, type FolderData } from "@/components/shell/folder-tree";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import { STATUS_META } from "@/lib/runs/view";
import { SOURCES, STEPS, studioFor } from "../research-studio/story";
import type { Id } from "../../../../convex/_generated/dataModel";

const WS = "ws1" as Id<"workspaces">;

const SHELL: WorkspaceShell = {
  workspaceId: WS,
  role: "owner",
  setupDone: true,
  agents: [
    { slug: "growth-architect", name: "Growth Architect", department: "growth", status: "live", job: "Research, strategy and campaigns that bring in demand.", promise: "", sort: 0, state: "on" },
    { slug: "sales-conversion", name: "Sales Conversion", department: "sales", status: "planned", job: "", promise: "", sort: 1, state: "off" },
    { slug: "customer-success", name: "Customer Success", department: "customer-success", status: "planned", job: "", promise: "", sort: 2, state: "off" },
  ],
};

function folder(state: string): FolderData {
  const now = Date.now();
  return ({
    sessions: [
      { id: "p1", title: "Austin deep cleaning", objective: "", geography: "Austin, TX", state: state === "done" ? "done" : state === "review" ? "review" : state, updatedAt: now - 60_000, costCents: 82 },
      { id: "p2", title: "Bay Area offers", objective: "", geography: "San Francisco, CA", state: "review", updatedAt: now - 3_600_000, costCents: 96 },
      { id: "p3", title: "Move-out pricing", objective: "", geography: "Austin, TX", state: "done", updatedAt: now - 86_400_000, costCents: 74 },
    ],
    sessionCount: 3,
    counts: { facts: 12, reports: 3, reportsWaiting: 1, runsOpen: state === "working" ? 1 : 0 },
    connections: [
      { key: "meta", label: "Meta ads", state: "on", detail: "Bay Area Cleaning Professionals" },
      { key: "youtube", label: "YouTube", state: "on", detail: null },
      { key: "instagram", label: "Instagram", state: "attention", detail: "Waiting for Meta approval" },
      { key: "adLibrary", label: "Meta Ad Library", state: "attention", detail: "EU and UK ads only" },
    ],
  } as unknown) as FolderData;
}

export function AgentSessionStory({ state }: { state: string }) {
  const client = useMemo(() => new ConvexReactClient("https://example.convex.cloud"), []);
  const [now] = useState(() => Date.now());
  const key = (["done", "review", "waiting", "working"].includes(state) ? state : "done") as "done" | "review" | "waiting" | "working";
  const base = studioFor(key);
  const studio = { ...base, project: { ...base.project, createdAt: now - 400_000 }, run: base.run ? { ...base.run, startedAt: key === "working" ? now - 150_000 : base.run.startedAt } : null } as typeof base;
  const steps = (STEPS[key === "review" ? "done" : key] ?? STEPS.waiting).map((row) => (key === "working" && row.at ? { ...row, at: row.at - 1793800000000 + now - 150_000 } : row));
  const sources = new Map(key === "waiting" ? [] : SOURCES.map((row) => [row.id, row]));
  const meta = key === "done" || key === "review" ? STATUS_META.completed : key === "waiting" ? STATUS_META.waiting : STATUS_META.running;
  return (
    <ConvexProvider client={client}>
      <ShellProvider value={SHELL}>
        <div className="flex min-h-screen bg-background">
          <aside className="hidden w-72 shrink-0 border-r border-border p-3 md:block">
            <FolderTree
              departments={[
                { slug: "growth", name: "Growth and Marketing", sort: 0 },
                { slug: "sales", name: "Sales", sort: 1 },
                { slug: "customer-success", name: "Customer Success", sort: 2 },
              ]}
              agents={SHELL.agents}
              pathname="/app/agents/growth-architect/sessions/p1"
              fixtures={{ "growth-architect": folder(key) }}
            />
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-6xl">
              <SessionThread
                workspaceId={WS}
                editor
                agentName="Growth Architect"
                base="/app/agents/growth-architect"
                data={{
                  studio,
                  steps,
                  open: key === "working" || key === "waiting",
                  meta,
                  statuses:
                    key === "waiting"
                      ? []
                      : [
                          { platform: "web", state: "partial", reasonCode: "ok", found: 30 },
                          { platform: "youtube", state: "available", reasonCode: "ok", found: 22 },
                          { platform: "tiktok", state: "available", reasonCode: "ok", found: 8 },
                        ],
                  sources,
                  counts: new Map(key === "waiting" ? [] : [["web", 2], ["youtube", 1], ["tiktok", 1]]),
                  reportAsset: key === "done" || key === "review" ? { id: "a1", title: "Market report: Austin deep cleaning", status: key === "review" ? "needsReview" : "draft", currentVersion: key === "review" ? 2 : 1 } : null,
                  assetStatus: key === "review" ? "needsReview" : key === "done" ? "draft" : null,
                  capCents: 300,
                }}
              />
            </div>
          </main>
        </div>
      </ShellProvider>
    </ConvexProvider>
  );
}
