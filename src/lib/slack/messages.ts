// ============================================
// SLACK MESSAGE BUILDERS + SENDER
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

export function buildHealthAlertBlocks(params: { clientName: string; healthScore: number; previousScore: number; warningLevel: string; reason: string; clientId: string }) {
  const emoji = params.warningLevel === 'critical' ? '🔴' : params.warningLevel === 'active' ? '🟠' : '🟡';
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Health Drop: ${params.clientName}*\nScore: ${params.previousScore} → ${params.healthScore} | Warning: ${params.warningLevel}\n${params.reason}` } },
  ];
}

export function buildWeeklyBriefBlocks(params: { totalClients: number; avgHealth: number; healthDistribution: { green: number; yellow: number; orange: number; red: number }; needsAttention: any[]; renewals: any[]; deliverablesDue: number; overdueCount: number; completedLastWeek: number }) {
  const d = params.healthDistribution;
  return [
    { type: 'header', text: { type: 'plain_text', text: '📊 Weekly Brief' } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Portfolio:* ${params.totalClients} clients | Avg: ${params.avgHealth}/100\n🟢${d.green} 🟡${d.yellow} 🟠${d.orange} 🔴${d.red}` } },
    ...(params.needsAttention.length > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Attention:*\n${params.needsAttention.map(c => `• ${c.name} — ${c.score}/100 (${c.trend})`).join('\n')}` } }] : []),
    { type: 'section', text: { type: 'mrkdwn', text: `*Fulfillment:* Due: ${params.deliverablesDue} | Overdue: ${params.overdueCount} | Done: ${params.completedLastWeek}` } },
  ];
}
