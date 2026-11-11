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

/** The remembered organization when the person can still open it, otherwise the first (oldest) one. */
export function chooseOrganization<T extends { workspaceId: string }>(organizations: T[], remembered: string | null): T | null {
  return organizations.find((row) => row.workspaceId === remembered) ?? organizations[0] ?? null;
}
