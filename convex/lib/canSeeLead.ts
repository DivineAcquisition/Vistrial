import type { Doc, Id } from "../_generated/dataModel";

export function leadOwnerId(lead: {
  ownerMemberId?: Id<"members">;
  assignedMemberId?: Id<"members">;
}): Id<"members"> | undefined {
  return lead.ownerMemberId ?? lead.assignedMemberId;
}

/** Reps only see leads they own. Everyone else in the workspace sees all. */
export function canSeeLead(
  member: Pick<Doc<"members">, "role" | "workspaceId" | "_id">,
  lead: { workspaceId: Id<"workspaces">; ownerMemberId?: Id<"members">; assignedMemberId?: Id<"members"> },
): boolean {
  if (lead.workspaceId !== member.workspaceId) return false;
  if (member.role !== "rep") return true;
  return leadOwnerId(lead) === member._id;
}
