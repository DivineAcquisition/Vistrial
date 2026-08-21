export function followUpMissingApprover(input: {
  followUpDraftId?: string;
  actorMemberId?: string | null;
}): boolean {
  return Boolean(input.followUpDraftId) && !input.actorMemberId;
}
