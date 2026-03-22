// ============================================
// DAILY PRIORITY GENERATION
// Generates prioritized action lists per team member
// ============================================

interface PriorityItem {
  urgency: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  clientName: string;
  clientId: string;
  reason: string;
  estimatedMinutes: number;
  draftId?: string;
}

export function generatePriorities(params: {
  clients: Array<{
    id: string;
    company_name: string;
    health_score: number;
    warning_level: string;
    days_since_interaction: number;
    overdue_deliverables: number;
    days_to_renewal: number | null;
    renewal_status: string;
    next_check_in_date: string | null;
  }>;
}): PriorityItem[] {
  const priorities: PriorityItem[] = [];

  for (const client of params.clients) {
    // Critical: health below 30
    if (client.health_score < 30) {
      priorities.push({
        urgency: 'critical',
        action: 'CALL NOW',
        clientName: client.company_name,
        clientId: client.id,
        reason: `Health critical at ${client.health_score}. Personal outreach needed.`,
        estimatedMinutes: 30,
      });
    }
    // High: overdue deliverables
    else if (client.overdue_deliverables > 0) {
      priorities.push({
        urgency: 'high',
        action: 'Resolve overdue deliverable',
        clientName: client.company_name,
        clientId: client.id,
        reason: `${client.overdue_deliverables} overdue deliverable(s)`,
        estimatedMinutes: 20,
      });
    }
    // High: renewal within 14 days
    else if (client.days_to_renewal !== null && client.days_to_renewal <= 14 && client.renewal_status !== 'accepted') {
      priorities.push({
        urgency: 'high',
        action: 'Renewal conversation',
        clientName: client.company_name,
        clientId: client.id,
        reason: `Renews in ${client.days_to_renewal} days, status: ${client.renewal_status}`,
        estimatedMinutes: 20,
      });
    }
    // Medium: check-in due today
    else if (client.next_check_in_date && new Date(client.next_check_in_date) <= new Date()) {
      priorities.push({
        urgency: 'medium',
        action: 'Check-in',
        clientName: client.company_name,
        clientId: client.id,
        reason: 'Scheduled check-in due',
        estimatedMinutes: 10,
      });
    }
    // Medium: no contact in 14+ days
    else if (client.days_since_interaction > 14) {
      priorities.push({
        urgency: 'medium',
        action: 'Reach out',
        clientName: client.company_name,
        clientId: client.id,
        reason: `No contact in ${client.days_since_interaction} days`,
        estimatedMinutes: 10,
      });
    }
  }

  // Sort by urgency
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  priorities.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return priorities;
}
