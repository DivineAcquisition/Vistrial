export type LeadSyncSnapshot = {
  status: string | null;
  lastTouchAt: string | null;
  firstHumanTouchAt: string | null;
};

/**
 * A queued outcome still writes when the lead moved. This names what moved so
 * the operator can see it. Returning null means the snapshot matched.
 */
export function describeOutcomeDiscrepancy(
  expected: LeadSyncSnapshot | null,
  actual: LeadSyncSnapshot
): string | null {
  if (!expected) return null;
  const parts: string[] = [];
  if (expected.status && actual.status && expected.status !== actual.status) {
    parts.push(`status was ${expected.status}, now ${actual.status}`);
  }
  if (
    expected.lastTouchAt &&
    actual.lastTouchAt &&
    expected.lastTouchAt !== actual.lastTouchAt
  ) {
    parts.push("another touch landed before this one synced");
  }
  if (
    expected.firstHumanTouchAt === null &&
    actual.firstHumanTouchAt !== null
  ) {
    parts.push("a first human touch was already recorded");
  }
  if (parts.length === 0) return null;
  return `This lead changed while the outcome was queued (${parts.join("; ")}). The outcome was still recorded.`;
}
