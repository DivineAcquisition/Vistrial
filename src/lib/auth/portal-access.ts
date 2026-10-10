import type { WorkspaceRole } from "@/lib/auth/types";

/**
 * Who sees what in the customer portal. These mirror the portal_can_* SQL
 * functions, which are the enforcement; this only decides what to render.
 */

type Who = {
  workspaceRole: WorkspaceRole;
  member: { canSeeMoney: boolean; canExport: boolean };
};

const STAFF_OR_OWNER: readonly WorkspaceRole[] = ["owner", "platform_admin", "service_team"];

/** Home and Results. Operators work their own list instead. */
export function canSeeResults(who: Pick<Who, "workspaceRole">): boolean {
  return who.workspaceRole !== "operator";
}

export function canSeeMoney(who: Who): boolean {
  if (STAFF_OR_OWNER.includes(who.workspaceRole)) return true;
  return who.workspaceRole === "member" && who.member.canSeeMoney;
}

/** Per-person numbers and the person filter. */
export function canSeePeople(who: Pick<Who, "workspaceRole">): boolean {
  return STAFF_OR_OWNER.includes(who.workspaceRole);
}

export function canExport(who: Who): boolean {
  if (STAFF_OR_OWNER.includes(who.workspaceRole)) return true;
  return who.workspaceRole === "member" && who.member.canExport;
}

/**
 * Owners and Platform Admins. Service Team only with billing access, which
 * the page checks against the database.
 */
export function mayOpenBilling(who: Pick<Who, "workspaceRole">): boolean {
  return STAFF_OR_OWNER.includes(who.workspaceRole);
}

/** Data export and deletion requests. */
export function canRequestData(who: Pick<Who, "workspaceRole">): boolean {
  return STAFF_OR_OWNER.includes(who.workspaceRole);
}
