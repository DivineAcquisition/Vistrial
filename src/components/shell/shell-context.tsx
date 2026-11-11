"use client";

import { createContext, useContext } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import type { Role } from "@/lib/roles";
import type { RailAgent } from "@/lib/shell/rail";

export type ShellAgent = RailAgent & { state: "off" | "suggesting" | "on" };

/** One organization the signed-in person can open, with their role in it. */
export type ShellOrganization = { workspaceId: Id<"workspaces">; name: string; role: Role; accountId: Id<"accounts"> | null };

/** The account the open organization belongs to, as far as this person is concerned. */
export type ShellAccount = {
  accountId: Id<"accounts">;
  name: string;
  owner: boolean;
  /** An Owner may add an organization here right now. */
  canAdd: boolean;
  /** Why adding is closed, for an Owner. Null when it is open or the person is not an Owner. */
  addClosedReason: string | null;
};

export type WorkspaceShell = {
  /** The open organization. Organizations are stored as workspaces. */
  workspaceId: Id<"workspaces">;
  role: Role;
  setupDone: boolean;
  agents: ShellAgent[];
  /** Every organization the person can open, the open one included. Missing in stories that show one. */
  organizations?: ShellOrganization[];
  account?: ShellAccount | null;
  /** Opens another organization. Everything on screen then belongs to it. */
  switchOrganization?: (workspaceId: Id<"workspaces">) => void;
};

const ShellContext = createContext<WorkspaceShell | null>(null);

export function ShellProvider({ value, children }: { value: WorkspaceShell; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useWorkspaceShell() {
  return useContext(ShellContext);
}
