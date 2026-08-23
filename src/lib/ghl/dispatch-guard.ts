export function followUpMissingApprover(input: {
  followUpDraftId?: string;
  actorMemberId?: string | null;
}): boolean {
  return Boolean(input.followUpDraftId) && !input.actorMemberId;
}

/** A failed contact fetch must not be treated as “not suppressed.” */
export function contactLookupReady(result: { ok: boolean }): boolean {
  return result.ok;
}

export function draftStatusBlocksSend(status: string | null | undefined): boolean {
  return status === "discarded" || status === "rejected";
}

/**
 * After an inbound reply (or org stop) discards drafts, a dispatch that was
 * already queued must not still send. A discard that happened before this
 * dispatch was created belongs to an earlier sequence and does not block.
 */
export function discardedDraftBlocksDispatch(args: {
  dispatchCreatedAt: string;
  discardedUpdatedAt: string | null;
}): boolean {
  if (!args.discardedUpdatedAt) return false;
  return Date.parse(args.discardedUpdatedAt) >= Date.parse(args.dispatchCreatedAt);
}

/**
 * Outbound webhooks without a GHL message id cannot be matched to a dispatch.
 * If we just sent, skip inserting a second touch. A CRM-native send with no id
 * and no recent dispatch still records.
 */
export function skipOutboundWebhookTouch(args: {
  messageId: string | null;
  touchAlreadyExists: boolean;
  dispatchOwnsMessage: boolean;
  recentSentDispatch: boolean;
}): boolean {
  if (args.messageId) return args.touchAlreadyExists || args.dispatchOwnsMessage;
  return args.recentSentDispatch;
}
