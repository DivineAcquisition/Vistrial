/** Plain language for a deletion request. The numbers come from support settings. */
export function deletionTerms(waitDays: number): string[] {
  return [
    `After a Platform Admin approves it, deletion waits ${waitDays} days. The Owner can cancel it during that wait.`,
    "Deletion cannot start while the subscription is still active.",
    "Once the subscription is cancelled and final billing is settled, deletion can proceed.",
    "The activity log and the billing records are kept. Leads, case files, drafts, and the rest of the workspace are deleted.",
    "Nothing is written to or removed from the CRM.",
  ];
}

export function exportTerms(linkDays: number): string[] {
  return [
    "A Platform Admin approves the request after confirming it came from an Owner.",
    "The copy is a file of this workspace's records. Internal notes written by the Vistrial team are not included.",
    `The download link works for ${linkDays} days, then it stops.`,
  ];
}

export const SESSION_END_REASON: Record<string, string> = {
  timeout: "The hour was up.",
  idle: "There was no activity for 30 minutes.",
  none: "Open the workspace again to carry on.",
  exit: "You left this workspace.",
  removed: "Your assignment to this workspace ended.",
};
