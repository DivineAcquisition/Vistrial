import type { OrgRole } from "@/types/database";

/**
 * UI-facing permission map. RLS is the actual enforcement — hide what a role
 * cannot do, but never treat these checks as security.
 */
const ROLE_PERMISSIONS = {
  manageMembers: ["owner", "admin"],
  viewRevenue: ["owner", "admin"],
  manageOrgSettings: ["owner", "admin"],
  assignLeads: ["owner", "admin"],
  workQueue: ["owner", "admin", "closer", "setter"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

export function canManageMembers(role: OrgRole): boolean {
  return hasPermission(role, "manageMembers");
}

export function canViewReporting(role: OrgRole): boolean {
  return hasPermission(role, "viewRevenue");
}

export function canManageOrgSettings(role: OrgRole): boolean {
  return hasPermission(role, "manageOrgSettings");
}

export function canAssignLeads(role: OrgRole): boolean {
  return hasPermission(role, "assignLeads");
}

export function canOverrideLead(args: {
  role: OrgRole;
  memberId: string;
  assignedSetterId: string | null;
  assignedCloserId: string | null;
}): boolean {
  if (args.role === "owner" || args.role === "admin") return true;
  if (args.role === "setter") return args.assignedSetterId === args.memberId;
  if (args.role === "closer") return args.assignedCloserId === args.memberId;
  return false;
}

export const INVITABLE_ROLES = ["admin", "closer", "setter"] as const satisfies readonly OrgRole[];

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
