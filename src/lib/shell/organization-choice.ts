/**
 * Which organization a person last opened, kept per browser. The server decides what they may open; this
 * only remembers which of those to show first.
 */
const STORE = "vistrial.organization.v1";

export function readOrganizationChoice(): string | null {
  try {
    return window.localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

export function writeOrganizationChoice(workspaceId: string) {
  try {
    window.localStorage.setItem(STORE, workspaceId);
  } catch {
    // Private windows and blocked storage: switching still works, it just is not remembered.
  }
}

const SCOPE_STORE = "vistrial.scope.v1";

/** The client picker's choice per organization: "all", "own" or a client id. */
export function readScopeChoice(workspaceId: string): string {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SCOPE_STORE) ?? "{}") as Record<string, unknown>;
    return typeof stored[workspaceId] === "string" ? (stored[workspaceId] as string) : "all";
  } catch {
    return "all";
  }
}

export function writeScopeChoice(workspaceId: string, choice: string) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SCOPE_STORE) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(SCOPE_STORE, JSON.stringify({ ...stored, [workspaceId]: choice }));
  } catch {
    // Blocked storage: the choice still holds for this visit.
  }
}

/**
 * The remembered choice while it still means something: a client that was archived or unassigned since,
 * or "the organization itself" for someone who may no longer see it, falls back to everything.
 */
export function validScope(choice: string, clients: { id: string }[], ownWork: boolean): string {
  if (choice === "own") return ownWork ? "own" : "all";
  return clients.some((row) => row.id === choice) ? choice : "all";
}

/** The remembered organization when the person can still open it, otherwise the first (oldest) one. */
export function chooseOrganization<T extends { workspaceId: string }>(organizations: T[], remembered: string | null): T | null {
  return organizations.find((row) => row.workspaceId === remembered) ?? organizations[0] ?? null;
}
