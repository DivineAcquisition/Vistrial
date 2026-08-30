export function triggerKey(parts: {
  orgId: string;
  agentId: string;
  kind: string;
  eventId: string;
}): string {
  return `${parts.orgId}:${parts.agentId}:${parts.kind}:${parts.eventId}`;
}

export function isDuplicateTrigger(
  existing: { triggerKey: string } | null,
  key: string,
): boolean {
  return existing?.triggerKey === key;
}
