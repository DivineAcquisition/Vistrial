// ============================================
// SLACK MESSAGE BUILDERS
// Block Kit message formatting
// ============================================

export async function sendSlackMessage(webhookUrl: string, blocks: any[]) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
  } catch (error) {
    console.error('Slack send error:', error);
  }
}

export function buildHealthAlertBlocks(params: {
  clientName: string;
  healthScore: number;
  previousScore: number;
  warningLevel: string;
  reason: string;
  clientId: string;
}) {
  const emoji = params.warningLevel === 'critical' ? '🔴' : params.warningLevel === 'active' ? '🟠' : '🟡';
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Health Drop: ${params.clientName}*\nScore: ${params.previousScore} → ${params.healthScore} | Warning: ${params.warningLevel}\nReason: ${params.reason}` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'View Client' }, url: `/clients/${params.clientId}`, action_id: 'view_client' },
      { type: 'button', text: { type: 'plain_text', text: 'I\'ll Handle It' }, action_id: 'handle_manually', style: 'primary' },
    ]},
  ];
}

export function buildDraftApprovalBlocks(params: {
  clientName: string;
  draftType: string;
  draftBody: string;
  healthScore: number;
  draftId: string;
}) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `📋 *Draft ready: ${params.draftType} for ${params.clientName}*\nHealth: ${params.healthScore}/100` } },
    { type: 'section', text: { type: 'mrkdwn', text: `"${params.draftBody.slice(0, 300)}${params.draftBody.length > 300 ? '...' : ''}"` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: '✅ Approve & Send' }, action_id: 'approve_draft', value: params.draftId, style: 'primary' },
      { type: 'button', text: { type: 'plain_text', text: '✏️ Edit' }, action_id: 'edit_draft', value: params.draftId },
      { type: 'button', text: { type: 'plain_text', text: '🚫 Dismiss' }, action_id: 'dismiss_draft', value: params.draftId },
    ]},
  ];
}

export function buildWeeklyBriefBlocks(params: {
  totalClients: number;
  avgHealth: number;
  healthDistribution: { green: number; yellow: number; orange: number; red: number };
  needsAttention: Array<{ name: string; score: number; trend: string; reason: string }>;
  renewals: Array<{ name: string; daysLeft: number; status: string; health: number }>;
  deliverablesDue: number;
  overdueCount: number;
  completedLastWeek: number;
}) {
  const d = params.healthDistribution;
  return [
    { type: 'header', text: { type: 'plain_text', text: '📊 Weekly Operations Brief' } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Portfolio Health*\nTotal clients: ${params.totalClients} | Avg health: ${params.avgHealth}/100\n🟢 ${d.green} healthy | 🟡 ${d.yellow} watch | 🟠 ${d.orange} at-risk | 🔴 ${d.red} critical` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*Needs Attention*\n${params.needsAttention.slice(0, 5).map(c => `• ${c.name} — ${c.score}/100 (${c.trend}) — ${c.reason}`).join('\n') || 'None — all clients healthy!'}` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*Fulfillment*\nDue this week: ${params.deliverablesDue} | Overdue: ${params.overdueCount} | Completed last week: ${params.completedLastWeek}` } },
    ...(params.renewals.length > 0 ? [{ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: `*Renewals*\n${params.renewals.map(r => `• ${r.name} — ${r.daysLeft} days — ${r.status} — Health: ${r.health}`).join('\n')}` } }] : []),
  ];
}
