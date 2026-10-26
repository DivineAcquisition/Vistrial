"use client";

import { createContext, useContext } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import type { RailAgent } from "@/lib/shell/rail";

export type ShellAgent = RailAgent & { state: "off" | "suggesting" | "on" };

export type WorkspaceShell = {
  workspaceId: Id<"workspaces">;
  role: "owner" | "manager" | "rep";
  setupDone: boolean;
  agents: ShellAgent[];
};

const ShellContext = createContext<WorkspaceShell | null>(null);

export function ShellProvider({ value, children }: { value: WorkspaceShell; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useWorkspaceShell() {
  return useContext(ShellContext);
}
