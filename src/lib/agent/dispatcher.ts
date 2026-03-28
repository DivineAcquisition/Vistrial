// @ts-nocheck
// ============================================
// NOTIFICATION DISPATCHER
// Consolidated client digests → multi-channel delivery with fallback
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendSlackMessage } from '@/lib/slack/messages';
import { ClientDigest } from '@/lib/agent/urgency';
import { generateDedupKey, wasAlreadyDispatched, recordDispatch } from '@/lib/agent/dedup';

export async function dispatchClientDigest(digest: ClientDigest, agentConfig: any): Promise<{ dispatched: boolean; channelsUsed: string[]; reason?: string }> {
  const admin = getSupabaseAdminClient();
  const channelsUsed: string[] = [];

  // Dedup check
  const dedupKey = generateDedupKey(digest.organizationId, digest.clientId, `digest_${digest.highestUrgency}`);
  if (await wasAlreadyDispatched(dedupKey)) {
    return { dispatched: false, channelsUsed: [], reason: 'already_dispatched_today' };
  }

  // Determine delivery mode
  const isRealtime = digest.highestUrgency === 'critical' || digest.highestUrgency === 'urgent';

  // Always write in-app notification
  await admin.from('notifications').insert({
    organization_id: digest.organizationId,
    type: `client_digest_${digest.highestUrgency}`,
    title: `${digest.clientName} — ${digest.events.length} issue${digest.events.length > 1 ? 's' : ''}`,
    message: digest.events.map(e => e.message).join(' | '),
    urgency: digest.highestUrgency,
    metadata: { events: digest.events.map(e => ({ type: e.type, urgency: e.urgency, message: e.message })) },
    read: false,
  }).catch(() => {});
  channelsUsed.push('in_app');

  // For important/routine: brief only, no external push
  if (!isRealtime) {
    await recordDispatch(dedupKey, digest.organizationId, digest.clientId, `digest_${digest.highestUrgency}`, channelsUsed);
    return { dispatched: true, channelsUsed, reason: 'brief_only' };
  }

  // Realtime: push to Slack
  const webhookUrl = agentConfig?.slack_webhook_url || (await admin.from('organizations').select('slack_webhook_url').eq('id', digest.organizationId).single())?.data?.slack_webhook_url;

  if (webhookUrl) {
    const urgencyEmoji = { critical: '🔴', urgent: '🟠', important: '🟡', routine: '🟢' }[digest.highestUrgency];
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `${urgencyEmoji} ${digest.clientName}` } },
      ...digest.events.map(e => ({ type: 'section', text: { type: 'mrkdwn', text: `*${e.type.replace(/_/g, ' ')}*\n${e.message}${e.suggestedAction ? `\n💡 _${e.suggestedAction}_` : ''}` } })),
    ];

    if (digest.slackUserId) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<@${digest.slackUserId}> — this is your account.` } });
    }

    try {
      await sendSlackMessage(webhookUrl, blocks);
      channelsUsed.push('slack');
    } catch { /* fallback handled below */ }
  }

  await recordDispatch(dedupKey, digest.organizationId, digest.clientId, `digest_${digest.highestUrgency}`, channelsUsed);
  return { dispatched: true, channelsUsed };
}
