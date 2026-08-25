import type { AuthContext } from "@/lib/auth/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import type { OrgRole } from "@/types/database";

export type ManagedOrgState = {
  managed: boolean;
  takenOverAt: string | null;
};

export function isOwnerRole(role: OrgRole, isPlatformAdmin = false): boolean {
  return isPlatformAdmin || role === "owner";
}

export function isOwner(ctx: AuthContext): boolean {
  return isOwnerRole(ctx.role, ctx.isPlatformAdmin);
}

export function canWriteWorkspaceSettings(ctx: AuthContext): boolean {
  return canManageOrgSettings(ctx.role, ctx.isPlatformAdmin);
}

/**
 * Advanced writes. Platform admins (DA) can always write, including when the
 * org is managed. Client owner/admin can write only after takeover.
 */
export function canWriteAdvancedSettings(ctx: AuthContext, managed: boolean): boolean {
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return false;
  if (ctx.isPlatformAdmin) return true;
  return !managed;
}

export function advancedWriteDenied(managed: boolean): string {
  if (managed) {
    return "These settings are managed by your install team. Take over management, or ask them to make the change.";
  }
  return "You do not have permission to change that.";
}
