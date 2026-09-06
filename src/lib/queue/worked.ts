/**
 * The one button's two states (Prompt 7, Part 4). A row is "already worked"
 * once a human has ever reached this person — that is the only signal that
 * exists for "someone talked to them," so re-opening the conversation stops
 * being the primary action and logging what happened starts being it.
 *
 * This deliberately ignores `lastTouchAt`: that column also advances on
 * system touches (an automated SMS, a CRM sync), and a robot texting someone
 * is not "already worked" in the sense this button cares about — a human
 * still needs to open the conversation.
 */
export function queueRowAlreadyWorked(row: {
  firstHumanTouchAt: string | null;
}): boolean {
  return row.firstHumanTouchAt !== null;
}

export type QueuePrimaryAction =
  { kind: "open_crm"; href: string } | { kind: "log_outcome" };

/**
 * What the row's single button does. Opening the CRM only makes sense before
 * anyone has talked to this person and only when there is somewhere to open;
 * every other case logs an outcome, which is the fallback that always works.
 */
export function queuePrimaryAction(row: {
  firstHumanTouchAt: string | null;
  crmUrl: string | null;
}): QueuePrimaryAction {
  if (!queueRowAlreadyWorked(row) && row.crmUrl) {
    return { kind: "open_crm", href: row.crmUrl };
  }
  return { kind: "log_outcome" };
}
