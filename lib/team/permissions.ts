import type { TeamRole } from "@/types/database";

/**
 * Server-side permission catalogue. UI may hide controls for clarity; refusal
 * always happens here when data is requested.
 */
export type Permission =
  | "operational"
  | "manage_users"
  | "change_owner_role"
  | "deactivate_owner"
  | "integration_secrets"
  | "territory_override"
  | "manage_commercial"
  | "manage_definitions"
  | "manage_charges"
  | "delete"
  | "view_activity_log";

const ROLE_PERMISSIONS: Record<TeamRole, ReadonlySet<Permission>> = {
  owner: new Set([
    "operational",
    "manage_users",
    "change_owner_role",
    "deactivate_owner",
    "integration_secrets",
    "territory_override",
    "manage_commercial",
    "manage_definitions",
    "manage_charges",
    "delete",
    "view_activity_log",
  ]),
  admin: new Set([
    "operational",
    "manage_users",
    "manage_commercial",
    "manage_definitions",
    "manage_charges",
    "delete",
    "view_activity_log",
    // Explicitly excluded: change_owner_role, deactivate_owner,
    // integration_secrets, territory_override
  ]),
  member: new Set([
    "operational",
    // Members confirm appointments and work leads/disputes — nothing commercial.
  ]),
};

export function roleHas(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertRoleHas(role: TeamRole, permission: Permission): void {
  if (!roleHas(role, permission)) {
    throw new PermissionError(
      "You do not have permission to do that."
    );
  }
}

export class PermissionError extends Error {
  readonly code = "permission_denied" as const;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError;
}
