import type { OrgRole, SurfaceAccess } from "@/types/database";

/**
 * UI-facing permission map. The database is the enforcement — every rule
 * here has a policy or trigger behind it in 20261007020000. Hide what a role
 * cannot do, never treat these checks as security.
 *
 * Roles as stored on a seat:
 *   owner                      Workspace Owner
 *   member                     Workspace Member (client_viewer is the retired name)
 *   setter, closer, operator   Workspace Operator
 *   admin                      a staff seat (Service Team or Platform Admin)
 *
 * `isStaff` is true for staff working in the current workspace and grants
 * everything here; Platform-Admin-only actions are checked separately.
 */
const OPERATOR_ROLES = ["setter", "closer", "operator"] as const satisfies readonly OrgRole[];

const ROLE_PERMISSIONS = {
  manageMembers: ["owner", "admin"],
  viewRevenue: ["owner", "admin", "member", "client_viewer"],
  manageOrgSettings: ["admin"],
  assignLeads: ["owner", "admin"],
  createLeads: ["owner", "admin", ...OPERATOR_ROLES],
  workQueue: ["owner", "admin", ...OPERATOR_ROLES],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function isOperatorRole(role: OrgRole): boolean {
  return (OPERATOR_ROLES as readonly OrgRole[]).includes(role);
}

export function hasPermission(role: OrgRole, permission: Permission, isStaff = false): boolean {
  if (isStaff) return true;
  return (ROLE_PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

export function canManageMembers(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "manageMembers", isStaff);
}

export function canViewReporting(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "viewRevenue", isStaff);
}

/** Configuration is the team's. Owners change only business contact details. */
export function canManageOrgSettings(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "manageOrgSettings", isStaff);
}

export function canAssignLeads(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "assignLeads", isStaff);
}

/** Anyone who works the list may add a person when no CRM is feeding this workspace. */
export function canCreateLeads(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "createLeads", isStaff);
}

/** Anyone who works leads may take one. Only owners and staff assign to others. */
export function canAssignLeadTo(args: {
  role: OrgRole;
  actorMemberId: string;
  targetMemberId: string | null;
  isStaff?: boolean;
}): boolean {
  if (args.isStaff) return true;
  if (args.role === "owner" || args.role === "admin") return true;
  if (!isOperatorRole(args.role)) return false;
  if (!args.targetMemberId) return false;
  return args.actorMemberId === args.targetMemberId;
}

/** Operators work leads assigned to them in either slot. Owners and staff work every lead. */
export function canOverrideLead(args: {
  role: OrgRole;
  memberId: string;
  assignedSetterId: string | null;
  assignedCloserId: string | null;
  isStaff?: boolean;
}): boolean {
  if (args.isStaff) return true;
  if (args.role === "owner" || args.role === "admin") return true;
  if (!isOperatorRole(args.role)) return false;
  return args.assignedSetterId === args.memberId || args.assignedCloserId === args.memberId;
}

/**
 * Approving a draft: staff, owners, and members an owner has granted it.
 * Operators never approve. Server actions also ask the database
 * (ws_can_approve) before acting.
 */
export function canApproveFollowUp(args: {
  role: OrgRole;
  canApprove?: boolean;
  isStaff?: boolean;
}): boolean {
  if (args.isStaff) return true;
  if (args.role === "owner" || args.role === "admin") return true;
  return (args.role === "member" || args.role === "client_viewer") && Boolean(args.canApprove);
}

/** The working app: staff, owners, operators. Members use the customer views. */
export function canWorkOperatorApp(
  role: OrgRole,
  _surfaceAccess: SurfaceAccess = "operator",
  isStaff = false
): boolean {
  return hasPermission(role, "workQueue", isStaff);
}

/** The customer views: owners, members, and staff looking through a workspace. */
export function canViewPortal(role: OrgRole, isStaff = false): boolean {
  return hasPermission(role, "viewRevenue", isStaff);
}

/** Roles a person may be invited as. Only staff invite owners. */
export const INVITABLE_ROLES = ["owner", "member", "operator", "setter", "closer"] as const satisfies readonly OrgRole[];

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

export function invitableRolesFor(isStaff: boolean): InvitableRole[] {
  return isStaff ? [...INVITABLE_ROLES] : INVITABLE_ROLES.filter((role) => role !== "owner");
}

export function roleLabel(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "member":
    case "client_viewer":
      return "Member";
    case "setter":
      return "Operator · setter";
    case "closer":
      return "Operator · closer";
    case "operator":
      return "Operator";
    case "admin":
    case "da_operator":
      return "Vistrial team";
  }
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether a member change would take away the org's last active owner.
 *
 * `activeOwners` counts every active owner including this member, and is NaN
 * when the count could not be read — an unreadable count blocks, because
 * guessing here is how an org ends up with nobody who can grant the role back.
 * The database refuses the same change (org_members_guard); this is so the
 * screen can explain it first.
 */
export function removesLastActiveOwner(args: {
  role: OrgRole;
  active: boolean;
  nextRole: OrgRole;
  nextActive: boolean;
  activeOwners: number;
}): boolean {
  const wasActiveOwner = args.role === "owner" && args.active;
  if (!wasActiveOwner) return false;

  const staysActiveOwner = args.nextRole === "owner" && args.nextActive;
  if (staysActiveOwner) return false;

  return !Number.isFinite(args.activeOwners) || args.activeOwners <= 1;
}
