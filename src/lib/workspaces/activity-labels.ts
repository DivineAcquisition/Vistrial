/** Plain words for activity log actions. Unknown actions fall back to a readable form of the key. */
const KNOWN: Record<string, string> = {
  "auth.signed_in": "Signed in",
  "auth.signed_out": "Signed out",
  "workspace.entered": "Entered the workspace",
  "workspace.created": "Created the workspace",
  "workspace.updated": "Changed workspace details",
  "workspace.status_changed": "Changed the workspace status",
  "assignment.added": "Assigned someone to the workspace",
  "assignment.ended": "Ended someone's assignment",
  "invite.sent": "Sent an invite",
  "invite.accepted": "Accepted an invite",
  "invite.revoked": "Revoked an invite",
  "member.added": "Added someone",
  "member.role_changed": "Changed someone's role",
  "member.removed": "Removed someone",
  "member.restored": "Restored someone",
  "member.deleted": "Deleted someone's seat",
  "member.approval_permission_changed": "Changed who can approve",
  "staff.added": "Added someone to the Vistrial team",
  "staff.deactivated": "Deactivated a team member",
  "staff.reactivated": "Reactivated a team member",
  "staff.role_changed": "Changed a team member's role",
  "staff.template_access_changed": "Changed template access",
  "user.deactivated": "Deactivated a person everywhere",
  "inbound_hold.released": "Released a held event",
  "inbound_hold.discarded": "Discarded a held event",
};

export function describeActivity(action: string): string {
  if (KNOWN[action]) return KNOWN[action];
  const config = action.match(/^config\.([a-z0-9_]+)\.(insert|update|delete)$/);
  if (config) {
    const thing = config[1].replace(/_/g, " ");
    const verb = config[2] === "insert" ? "Added" : config[2] === "update" ? "Changed" : "Removed";
    return `${verb} ${thing}`;
  }
  const words = action.replace(/[._]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : action;
}

export const ACTOR_KIND_LABEL: Record<string, string> = {
  customer: "Customer",
  service_team: "Vistrial team",
  platform_admin: "Platform Admin",
  system: "Vistrial",
};
