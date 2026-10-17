import type { OrgRole } from "@/types/database";

import { isOperatorRole } from "@/lib/auth/permissions";

export function canViewConnections(args: { role: OrgRole; isStaff: boolean }): boolean {
  if (args.isStaff) return true;
  if (isOperatorRole(args.role)) return false;
  return args.role === "owner" || args.role === "member" || args.role === "client_viewer" || args.role === "admin";
}

/**
 * Staff can see status and prepare a connect link. They cannot authorize.
 */
export function canManageConnections(args: {
  role: OrgRole;
  isStaff: boolean;
  canManageFlag: boolean;
}): boolean {
  if (args.isStaff) return false;
  if (args.role === "owner" || args.role === "admin") return true;
  if (args.role === "member" || args.role === "client_viewer") return args.canManageFlag;
  return false;
}

export function canPrepareConnectLink(args: { isStaff: boolean }): boolean {
  return args.isStaff;
}
