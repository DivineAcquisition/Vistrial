import type { Enums } from "@/types/database";

export type OrgAssigneeDefaults = {
  setterId: string | null;
  closerId: string | null;
};

/**
 * Who should own a new inbound lead, from the structure the owner named.
 * Unassigned stays unassigned when the team has not been named yet.
 */
export function assigneesFromTeamStructure(
  structure: Enums<"profile_team_structure"> | null,
  members: Array<{ id: string; role: Enums<"org_role"> }>
): OrgAssigneeDefaults {
  const first = (role: Enums<"org_role">) => members.find((member) => member.role === role)?.id ?? null;
  const owner = first("owner") ?? first("admin");
  const setter = first("setter");
  const closer = first("closer");

  switch (structure) {
    case "owner_sold":
      return { setterId: null, closerId: owner };
    case "closers_only":
      return { setterId: null, closerId: closer ?? owner };
    case "setter_closer":
      return { setterId: setter, closerId: closer ?? owner };
    case "setters_only":
      return { setterId: setter, closerId: owner };
    default:
      return { setterId: null, closerId: null };
  }
}
