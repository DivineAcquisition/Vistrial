import type { WorkspaceRole } from "@/lib/auth/types";

/** "Jordan Miller" reads "Jordan M.", matching staff_short_name in the database. */
export function staffShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Vistrial";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

export function staffTeamLabel(role: WorkspaceRole | "service_team" | "platform_admin"): string {
  return role === "platform_admin" ? "Vistrial Platform Admin" : "Vistrial Service Team";
}

/**
 * The name customers see for whoever acted. Staff always read as staff, so an
 * approval or pause by the Vistrial team is never mistaken for the customer's own.
 */
export function actorLabel(ctx: {
  isStaff: boolean;
  workspaceRole: WorkspaceRole;
  member: { displayName: string };
}): string {
  const name = ctx.member.displayName?.trim() || "a person";
  if (!ctx.isStaff) return name;
  return `${staffShortName(name)}, ${staffTeamLabel(ctx.workspaceRole)}`;
}

/** A seat row from org_members, named the way member_public_name does it. */
export function seatLabel(row: { display_name: string | null; seat?: string | null }): string | null {
  const name = row.display_name?.trim();
  if (!name) return null;
  return row.seat === "staff" ? `${staffShortName(name)}, Vistrial Service Team` : name;
}
