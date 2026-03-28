// ============================================
// URGENCY CLASSIFICATION ENGINE
// Classifies events + groups by client into consolidated digests
// ============================================

export type UrgencyLevel = 'critical' | 'urgent' | 'important' | 'routine';
export type DeliveryMode = 'realtime' | 'brief_only';

export type AgentEvent = {
  type: string;
  organizationId: string;
  clientId?: string;
  clientName?: string;
  data: Record<string, any>;
  urgency: UrgencyLevel;
  message: string;
  suggestedAction?: string;
  assignedTeamMemberId?: string;
};

export type ClientDigest = {
  clientId: string;
  clientName: string;
  organizationId: string;
  events: AgentEvent[];
  highestUrgency: UrgencyLevel;
  assignedTeamMemberId?: string;
  assignedTeamMemberName?: string;
  slackUserId?: string;
  discordUserId?: string;
};

export function classifyUrgency(eventType: string, data: Record<string, any>): UrgencyLevel {
  if (
    (data.healthScore !== undefined && data.healthScore < 20) ||
    data.paymentFailed === true ||
    (data.sentimentScore !== undefined && data.sentimentScore < 0.2) ||
    eventType === 'client_cancellation_request'
  ) return 'critical';

  if (
    (data.healthScore !== undefined && data.healthScore < 50) ||
    (data.daysSinceLastInteraction !== undefined && data.daysSinceLastInteraction >= 14) ||
    (data.contractExpiringDays !== undefined && data.contractExpiringDays <= 14) ||
    (data.deliverableOverdueDays !== undefined && data.deliverableOverdueDays >= 7) ||
    (data.invoiceOverdueDays !== undefined && data.invoiceOverdueDays >= 14)
  ) return 'urgent';

  if (
    data.healthTrend === 'declining' ||
    (data.deliverableOverdueDays !== undefined && data.deliverableOverdueDays >= 3) ||
    (data.contractExpiringDays !== undefined && data.contractExpiringDays <= 30) ||
    (data.daysSinceLastInteraction !== undefined && data.daysSinceLastInteraction >= 7)
  ) return 'important';

  return 'routine';
}

export function buildClientDigests(events: AgentEvent[]): ClientDigest[] {
  const clientMap = new Map<string, AgentEvent[]>();
  for (const event of events) {
    const key = event.clientId || '__system__';
    if (!clientMap.has(key)) clientMap.set(key, []);
    clientMap.get(key)!.push(event);
  }

  const urgencyRank: Record<UrgencyLevel, number> = { critical: 0, urgent: 1, important: 2, routine: 3 };
  const digests: ClientDigest[] = [];

  Array.from(clientMap.entries()).forEach(([clientId, clientEvents]) => {
    clientEvents.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);
    digests.push({
      clientId,
      clientName: clientEvents[0].clientName || 'System',
      organizationId: clientEvents[0].organizationId,
      events: clientEvents,
      highestUrgency: clientEvents[0].urgency,
      assignedTeamMemberId: clientEvents[0].assignedTeamMemberId,
    });
  });

  digests.sort((a, b) => urgencyRank[a.highestUrgency] - urgencyRank[b.highestUrgency]);
  return digests;
}
