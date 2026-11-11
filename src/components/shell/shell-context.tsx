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

/** A client the person may see, as the picker lists it. */
export type ShellClient = { id: Id<"clients">; name: string; type: "business" | "person"; line: string };

/** The client picker's choice: everything, the organization itself, or one client. */
export type ScopeChoice = "all" | "own" | Id<"clients">;

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
  /** The clients this person may see here. Missing in stories that do not show the picker. */
  clients?: ShellClient[];
  /** Whether "<Organization> itself" is a choice for this person. */
  ownWork?: boolean;
  /** Owners and Admins add clients and choose who sees them. */
  canManageClients?: boolean;
  choice?: ScopeChoice;
  setChoice?: (choice: ScopeChoice) => void;
};

/**
 * The picker's choice in the two forms screens need: `scope` to pass to a list query (undefined shows
 * everything the person may see), and `clientId` to make new work for (undefined makes it the
 * organization's own). The server decides what the person may see; this only narrows it.
 */
export function scopeOf(shell: WorkspaceShell | null): { scope: "own" | Id<"clients"> | undefined; clientId: Id<"clients"> | undefined } {
  const choice = shell?.choice ?? "all";
  if (choice === "all") return { scope: undefined, clientId: undefined };
  if (choice === "own") return { scope: "own", clientId: undefined };
  return { scope: choice, clientId: choice };
}

const ShellContext = createContext<WorkspaceShell | null>(null);

export function ShellProvider({ value, children }: { value: WorkspaceShell; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useWorkspaceShell() {
  return useContext(ShellContext);
}

/** The client picker's choice, for a list query's `scope` and a new record's `clientId`. */
export function useClientScope() {
  return scopeOf(useContext(ShellContext));
}
